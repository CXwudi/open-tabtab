import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { closeTabs, getSelfTabId } from '@/src/browser/tabs';
import { RuntimeCommandBus } from '@/src/messaging/runtime-bus';
import { CommandBusProvider, useDispatch, useSnapshot } from './hooks/useSnapshot';
import { useLiveTabs } from './hooks/useLiveTabs';
import { useSelectedSpace } from './hooks/useSelectedSpace';
import { useThemeMode } from './hooks/useThemeMode';
import { buildStashPlan } from './actions/stash';
import { appCollisionDetection, useDndSensors } from './dnd/dnd-config';
import { mapDragEndToCommand } from './dnd/on-drag-end';
import SpacesSidebar from './components/SpacesSidebar';
import WorkspaceView from './components/WorkspaceView';
import CurrentTabsSidebar from './components/CurrentTabsSidebar';
import DragPreview from './components/DragPreview';
import SettingsPanel from './components/settings/SettingsPanel';
import './styles/theme.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/workspace.css';

type ActiveDrag = {
  id: string;
  data: unknown;
} | null;

/** The three-column workspace, rendered once a snapshot is available. */
function NewTabWorkspace() {
  const { snapshot } = useSnapshot();
  useThemeMode(snapshot?.settings.themeMode ?? 'system');
  const dispatch = useDispatch();
  const sensors = useDndSensors();
  const liveTabs = useLiveTabs();
  const workspace = snapshot?.workspace ?? null;
  const { selectedSpaceId, selectSpace } = useSelectedSpace(workspace);
  const [selfTabId, setSelfTabId] = useState<number | undefined>();
  const [showTabs, setShowTabs] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag>(null);

  useEffect(() => {
    void getSelfTabId().then(setSelfTabId).catch(() => undefined);
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDrag({ id: String(event.active.id), data: event.active.data.current });
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDrag(null);
    const command = mapDragEndToCommand(
      { id: String(event.active.id), data: event.active.data },
      event.over ? { id: String(event.over.id) } : null,
    );
    if (command) void dispatch(command);
  }, [dispatch]);

  const handleStashAll = useCallback(async () => {
    if (!selectedSpaceId) return;

    const plan = buildStashPlan(liveTabs, selfTabId);
    if (plan.tabs.length === 0) return;

    const result = await dispatch({
      type: 'stashCurrentTabs',
      spaceId: selectedSpaceId,
      groupName: plan.groupName,
      tabs: plan.tabs,
    });

    if (result.ok) {
      await closeTabs(plan.idsToClose);
    }
  }, [dispatch, liveTabs, selectedSpaceId, selfTabId]);

  if (!snapshot || !workspace) {
    return <div className="app-loading">Loading workspace…</div>;
  }

  const selectedSpace = selectedSpaceId ? workspace.spaces[selectedSpaceId] : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={appCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDrag(null)}
    >
      <div className={`app-grid ${showTabs ? '' : 'app-grid--no-tabs'}`}>
        <SpacesSidebar
          workspace={workspace}
          selectedSpaceId={selectedSpaceId}
          onSelectSpace={selectSpace}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <main className="workspace-col">
          {selectedSpace ? (
            <WorkspaceView space={selectedSpace} onToggleTabs={() => setShowTabs((value) => !value)} />
          ) : (
            <div className="empty-state">Select or create a space to get started.</div>
          )}
        </main>
        {showTabs ? <CurrentTabsSidebar tabs={liveTabs} onSaveAll={selectedSpaceId ? handleStashAll : undefined} /> : null}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeDrag ? <DragPreview activeId={activeDrag.id} data={activeDrag.data} workspace={workspace} /> : null}
      </DragOverlay>
      {settingsOpen ? <SettingsPanel snapshot={snapshot} onClose={() => setSettingsOpen(false)} /> : null}
    </DndContext>
  );
}

/** Root new-tab component: provides the runtime bus and the workspace UI. */
export default function App() {
  const bus = useMemo(() => new RuntimeCommandBus(), []);

  useEffect(() => {
    void bus.dispatch({ type: 'reconcile' }).catch(() => undefined);
  }, [bus]);

  return (
    <CommandBusProvider bus={bus}>
      <NewTabWorkspace />
    </CommandBusProvider>
  );
}
