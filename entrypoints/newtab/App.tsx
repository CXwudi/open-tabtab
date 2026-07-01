import { useEffect, useMemo, useState } from 'react';
import { RuntimeCommandBus } from '@/src/messaging/runtime-bus';
import { CommandBusProvider, useSnapshot } from './hooks/useSnapshot';
import { useSelectedSpace } from './hooks/useSelectedSpace';
import SpacesSidebar from './components/SpacesSidebar';
import WorkspaceView from './components/WorkspaceView';
import CurrentTabsSidebar, { type BrowserTabView } from './components/CurrentTabsSidebar';
import './styles/theme.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/workspace.css';

// Placeholder tabs until the live browser source lands in Task 9.
const MOCK_TABS: BrowserTabView[] = [
  { id: 1, title: 'Open TabTab — New Tab', url: 'chrome://newtab/', favIconUrl: '' },
  { id: 2, title: 'GitHub', url: 'https://github.com', favIconUrl: 'https://github.com/favicon.ico' },
  { id: 3, title: 'MDN Web Docs', url: 'https://developer.mozilla.org', favIconUrl: 'https://developer.mozilla.org/favicon.ico' },
  { id: 4, title: 'Hacker News', url: 'https://news.ycombinator.com', favIconUrl: 'https://news.ycombinator.com/favicon.ico', pinned: true },
  { id: 5, title: 'React', url: 'https://react.dev', favIconUrl: 'https://react.dev/favicon.ico' },
];

/** The three-column workspace, rendered once a snapshot is available. */
function NewTabWorkspace() {
  const { snapshot } = useSnapshot();
  const workspace = snapshot?.workspace ?? null;
  const { selectedSpaceId, selectSpace } = useSelectedSpace(workspace);
  const [showTabs, setShowTabs] = useState(true);

  if (!workspace) {
    return <div className="app-loading">Loading workspace…</div>;
  }

  const selectedSpace = selectedSpaceId ? workspace.spaces[selectedSpaceId] : undefined;

  return (
    <div className={`app-grid ${showTabs ? '' : 'app-grid--no-tabs'}`}>
      <SpacesSidebar
        workspace={workspace}
        selectedSpaceId={selectedSpaceId}
        onSelectSpace={selectSpace}
      />
      <main className="workspace-col">
        {selectedSpace ? (
          <WorkspaceView space={selectedSpace} onToggleTabs={() => setShowTabs((value) => !value)} />
        ) : (
          <div className="empty-state">Select or create a space to get started.</div>
        )}
      </main>
      {showTabs ? <CurrentTabsSidebar tabs={MOCK_TABS} /> : null}
    </div>
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
