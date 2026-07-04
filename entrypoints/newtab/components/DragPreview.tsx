import type { Group, SavedTab, Space, Workspace } from '@/src/domain/types';
import { decodeDndId, type BrowserTabPayload } from '../dnd/dnd-config';

type DragPreviewProps = {
  activeId: string;
  data: unknown;
  workspace: Workspace;
};

/** Renders the floating visual clone used by dnd-kit's DragOverlay. */
export default function DragPreview({ activeId, data, workspace }: DragPreviewProps) {
  const decoded = decodeDndId(activeId);
  if (!decoded) return null;

  if (decoded.kind === 'browserTab') {
    const tab = getBrowserTabPayload(data);
    return tab ? <BrowserTabPreview tab={tab} /> : null;
  }

  if (decoded.kind === 'space') {
    const space = workspace.spaces[decoded.spaceId];
    return space ? <SpacePreview space={space} /> : null;
  }

  if (decoded.kind === 'group') {
    const group = workspace.spaces[decoded.spaceId]?.groups.find((entry) => entry.id === decoded.groupId);
    return group ? <GroupPreview group={group} /> : null;
  }

  const tab = findSavedTab(workspace, decoded.spaceId, decoded.groupId, decoded.tabId);
  return tab ? <SavedTabPreview tab={tab} /> : null;
}

/** Mirrors a current browser-tab row in the drag overlay. */
function BrowserTabPreview({ tab }: { tab: BrowserTabPayload }) {
  return (
    <div className="drag-preview drag-preview--current-tab current-tab">
      <span className="drag-handle" aria-hidden="true">⋮⋮</span>
      <PreviewIcon className="current-tab-icon" src={tab.favIconUrl} />
      <span className="current-tab-body">
        <span className="current-tab-title">{tab.title || tab.url}</span>
        <span className="current-tab-url">{tab.url}</span>
      </span>
    </div>
  );
}

/** Mirrors a saved tab card in the drag overlay. */
function SavedTabPreview({ tab }: { tab: SavedTab }) {
  return (
    <div className="drag-preview drag-preview--tab tab-card">
      <PreviewIcon className="tab-card-icon" src={tab.favIconUrl} />
      <span className="tab-card-title">{tab.title || tab.url}</span>
    </div>
  );
}

/** Mirrors a collection row header in the drag overlay. */
function GroupPreview({ group }: { group: Group }) {
  return (
    <section className="drag-preview drag-preview--group group-row">
      <header className="group-header">
        <span className="drag-handle" aria-hidden="true">⋮⋮</span>
        <span className="icon-btn chevron" aria-hidden="true">▾</span>
        <span className="group-name">{group.name}</span>
        <span className="group-count">{group.tabs.length}</span>
      </header>
    </section>
  );
}

/** Mirrors a space row in the drag overlay. */
function SpacePreview({ space }: { space: Space }) {
  return (
    <div className="drag-preview drag-preview--space space-item">
      <span className="drag-handle" aria-hidden="true">⋮⋮</span>
      <span className="space-icon" aria-hidden="true">▢</span>
      <span className="space-name">{space.name}</span>
    </div>
  );
}

/** Renders a favicon when available, otherwise the same fallback block as list rows. */
function PreviewIcon({ className, src }: { className: string; src?: string }) {
  if (src) return <img className={className} src={src} alt="" />;

  const fallbackClass = className === 'current-tab-icon'
    ? 'current-tab-icon--fallback'
    : 'tab-card-icon--fallback';
  return <span className={`${className} ${fallbackClass}`} aria-hidden="true" />;
}

/** Finds a saved tab in the normalized workspace. */
function findSavedTab(
  workspace: Workspace,
  spaceId: string,
  groupId: string,
  tabId: string,
): SavedTab | undefined {
  return workspace.spaces[spaceId]?.groups
    .find((group) => group.id === groupId)
    ?.tabs.find((tab) => tab.id === tabId);
}

/** Parses browser-tab drag data from dnd-kit metadata. */
function getBrowserTabPayload(data: unknown): BrowserTabPayload | null {
  if (!isRecord(data) || data.kind !== 'browserTab' || !isRecord(data.tab)) return null;
  if (typeof data.tab.title !== 'string' || typeof data.tab.url !== 'string') return null;

  return {
    title: data.tab.title,
    url: data.tab.url,
    favIconUrl: typeof data.tab.favIconUrl === 'string' ? data.tab.favIconUrl : undefined,
  };
}

/** Checks whether an unknown value is a non-null object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
