/**
 * Pure workspace mutation functions for saved tabs.
 *
 * Every function takes a Workspace and arguments, returns a **new** Workspace
 * (never mutates the input).  None of these call `nextVersion` — version bumping
 * is the caller's (background handler) responsibility.
 *
 * IDs for new entities are generated with `crypto.randomUUID()`.
 */

import type { Workspace, Group, SavedTab } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find a tab by id inside a group. Throws if not found. */
function findTab(group: Group, tabId: string): SavedTab {
  const tab = group.tabs.find((t) => t.id === tabId);
  if (!tab) throw new Error(`Tab ${tabId} not found in group ${group.id}`);
  return tab;
}

/** Find a group by id inside a space. Throws if not found. */
function findGroup(space: { groups: Group[]; id: string }, groupId: string): { group: Group; index: number } {
  const index = space.groups.findIndex((g) => g.id === groupId);
  if (index === -1) throw new Error(`Group ${groupId} not found in space ${space.id}`);
  return { group: space.groups[index], index };
}

// ---------------------------------------------------------------------------
// Saved-tab CRUD
// ---------------------------------------------------------------------------

/** Create a saved tab inside a group. */
export function createSavedTab(
  ws: Workspace,
  spaceId: string,
  groupId: string,
  title: string,
  url: string,
): Workspace {
  const space = ws.spaces[spaceId];
  if (!space) throw new Error(`Space ${spaceId} not found`);
  const { group, index } = findGroup(space, groupId);
  const newTab: SavedTab = { id: crypto.randomUUID(), title, url, kind: 'record' };
  const newGroups = [...space.groups];
  newGroups[index] = { ...group, tabs: [...group.tabs, newTab] };
  return {
    ...ws,
    spaces: { ...ws.spaces, [spaceId]: { ...space, groups: newGroups } },
  };
}

/** Edit a saved tab's title and URL. */
export function editSavedTab(
  ws: Workspace,
  spaceId: string,
  groupId: string,
  tabId: string,
  title: string,
  url: string,
): Workspace {
  const space = ws.spaces[spaceId];
  if (!space) throw new Error(`Space ${spaceId} not found`);
  const { group, index: gi } = findGroup(space, groupId);
  findTab(group, tabId); // validate existence
  const newTabs = group.tabs.map((t) => (t.id === tabId ? { ...t, title, url } : t));
  const newGroups = [...space.groups];
  newGroups[gi] = { ...group, tabs: newTabs };
  return {
    ...ws,
    spaces: { ...ws.spaces, [spaceId]: { ...space, groups: newGroups } },
  };
}

/** Delete a saved tab from a group. */
export function deleteSavedTab(
  ws: Workspace,
  spaceId: string,
  groupId: string,
  tabId: string,
): Workspace {
  const space = ws.spaces[spaceId];
  if (!space) throw new Error(`Space ${spaceId} not found`);
  const { group, index: gi } = findGroup(space, groupId);
  findTab(group, tabId); // validate existence
  const newGroups = [...space.groups];
  newGroups[gi] = { ...group, tabs: group.tabs.filter((t) => t.id !== tabId) };
  return {
    ...ws,
    spaces: { ...ws.spaces, [spaceId]: { ...space, groups: newGroups } },
  };
}

/** Reorder saved tabs within a group. */
export function reorderSavedTabs(
  ws: Workspace,
  spaceId: string,
  groupId: string,
  orderedIds: string[],
): Workspace {
  const space = ws.spaces[spaceId];
  if (!space) throw new Error(`Space ${spaceId} not found`);
  const { group, index: gi } = findGroup(space, groupId);
  const byId = new Map(group.tabs.map((t) => [t.id, t]));
  if (orderedIds.length !== byId.size || new Set(orderedIds).size !== orderedIds.length) {
    throw new Error('reorderSavedTabs: orderedIds must contain each tab exactly once');
  }
  const newTabs = orderedIds.map((id) => {
    const t = byId.get(id);
    if (!t) throw new Error(`reorderSavedTabs: unknown tab ${id}`);
    return t;
  });
  const newGroups = [...space.groups];
  newGroups[gi] = { ...group, tabs: newTabs };
  return {
    ...ws,
    spaces: { ...ws.spaces, [spaceId]: { ...space, groups: newGroups } },
  };
}

// ---------------------------------------------------------------------------
// Move, save from browser, stash
// ---------------------------------------------------------------------------

/** Move a saved tab from one group to another (or reorder within the same group). */
export function moveSavedTab(
  ws: Workspace,
  from: { spaceId: string; groupId: string },
  to: { spaceId: string; groupId: string; index: number },
  tabId: string,
): Workspace {
  // Validate source
  const srcSpace = ws.spaces[from.spaceId];
  if (!srcSpace) throw new Error(`Source space ${from.spaceId} not found`);
  const { group: srcGroup, index: srcGi } = findGroup(srcSpace, from.groupId);
  const movedTab = findTab(srcGroup, tabId);

  // Validate destination
  const dstSpace = ws.spaces[to.spaceId];
  if (!dstSpace) throw new Error(`Destination space ${to.spaceId} not found`);
  const { group: dstGroup, index: dstGi } = findGroup(dstSpace, to.groupId);

  const sameSpace = from.spaceId === to.spaceId;
  const sameGroup = sameSpace && from.groupId === to.groupId;

  // Remove from source
  const srcTabs = srcGroup.tabs.filter((t) => t.id !== tabId);

  // Determine the tabs array to insert into
  const baseTabs = sameGroup ? srcTabs : [...dstGroup.tabs];
  const insertIdx = Math.max(0, Math.min(to.index, baseTabs.length));
  const dstTabs = [...baseTabs.slice(0, insertIdx), movedTab, ...baseTabs.slice(insertIdx)];

  const result: Workspace = { ...ws, spaces: { ...ws.spaces } };

  if (sameSpace) {
    // Both groups live in the same space — build one merged groups array
    const groups = [...srcSpace.groups];
    groups[srcGi] = { ...srcGroup, tabs: srcTabs };
    groups[dstGi] = { ...(sameGroup ? srcGroup : dstGroup), tabs: dstTabs };
    result.spaces[from.spaceId] = { ...srcSpace, groups };
  } else {
    // Different spaces
    const srcGroups = [...srcSpace.groups];
    srcGroups[srcGi] = { ...srcGroup, tabs: srcTabs };
    result.spaces[from.spaceId] = { ...srcSpace, groups: srcGroups };

    const dstGroups = [...dstSpace.groups];
    dstGroups[dstGi] = { ...dstGroup, tabs: dstTabs };
    result.spaces[to.spaceId] = { ...dstSpace, groups: dstGroups };
  }

  return result;
}

/** Save a browser tab into a group at an optional index. */
export function saveBrowserTab(
  ws: Workspace,
  spaceId: string,
  groupId: string,
  tab: { title: string; url: string; favIconUrl?: string },
  index?: number,
): Workspace {
  const space = ws.spaces[spaceId];
  if (!space) throw new Error(`Space ${spaceId} not found`);
  const { group, index: gi } = findGroup(space, groupId);
  const newTab: SavedTab = {
    id: crypto.randomUUID(),
    title: tab.title,
    url: tab.url,
    favIconUrl: tab.favIconUrl,
    kind: 'record',
  };
  const insertIdx = index !== undefined ? Math.max(0, Math.min(index, group.tabs.length)) : group.tabs.length;
  const newTabs = [
    ...group.tabs.slice(0, insertIdx),
    newTab,
    ...group.tabs.slice(insertIdx),
  ];
  const newGroups = [...space.groups];
  newGroups[gi] = { ...group, tabs: newTabs };
  return {
    ...ws,
    spaces: { ...ws.spaces, [spaceId]: { ...space, groups: newGroups } },
  };
}

/** Stash a batch of browser tabs into a new timestamp-named group. */
export function stashCurrentTabs(
  ws: Workspace,
  spaceId: string,
  groupName: string,
  tabs: { title: string; url: string; favIconUrl?: string }[],
): Workspace {
  const space = ws.spaces[spaceId];
  if (!space) throw new Error(`Space ${spaceId} not found`);
  const newGroup: Group = {
    id: crypto.randomUUID(),
    name: groupName,
    tabs: tabs.map((t) => ({
      id: crypto.randomUUID(),
      title: t.title, url: t.url, favIconUrl: t.favIconUrl,
      kind: 'record' as const,
    })),
  };
  return {
    ...ws,
    spaces: {
      ...ws.spaces,
      [spaceId]: { ...space, groups: [...space.groups, newGroup] },
    },
  };
}
