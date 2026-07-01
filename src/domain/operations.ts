/**
 * Pure workspace mutation functions for spaces and groups.
 *
 * Every function takes a Workspace and arguments, returns a **new** Workspace
 * (never mutates the input).  None of these call `nextVersion` — version bumping
 * is the caller's (background handler) responsibility.
 *
 * IDs for new entities are generated with `crypto.randomUUID()`.
 */

import type { Workspace, Group } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find a group by id inside a space. Returns the group and its index.
 * Throws if not found.
 */
function findGroup(space: { groups: Group[]; id: string }, groupId: string): { group: Group; index: number } {
  const index = space.groups.findIndex((g) => g.id === groupId);
  if (index === -1) throw new Error(`Group ${groupId} not found in space ${space.id}`);
  return { group: space.groups[index], index };
}

// ---------------------------------------------------------------------------
// Space operations
// ---------------------------------------------------------------------------

/** Create a new space and append it to the space order. */
export function createSpace(ws: Workspace, name: string): Workspace {
  const id = crypto.randomUUID();
  return {
    ...ws,
    spaces: { ...ws.spaces, [id]: { id, name, groups: [], pins: {} } },
    spaceOrder: [...ws.spaceOrder, id],
  };
}

/** Rename a space. */
export function renameSpace(ws: Workspace, spaceId: string, name: string): Workspace {
  const space = ws.spaces[spaceId];
  if (!space) throw new Error(`Space ${spaceId} not found`);
  return {
    ...ws,
    spaces: { ...ws.spaces, [spaceId]: { ...space, name } },
  };
}

/** Delete a space and remove it from the space order. */
export function deleteSpace(ws: Workspace, spaceId: string): Workspace {
  if (!ws.spaces[spaceId]) throw new Error(`Space ${spaceId} not found`);
  const { [spaceId]: _removed, ...restSpaces } = ws.spaces;
  return {
    ...ws,
    spaces: restSpaces,
    spaceOrder: ws.spaceOrder.filter((id) => id !== spaceId),
  };
}

/** Reorder spaces. The new order must contain exactly the same set of ids. */
export function reorderSpaces(ws: Workspace, orderedIds: string[]): Workspace {
  const existing = new Set(ws.spaceOrder);
  if (orderedIds.length !== existing.size || new Set(orderedIds).size !== orderedIds.length) {
    throw new Error('reorderSpaces: orderedIds must contain each space exactly once');
  }
  for (const id of orderedIds) {
    if (!existing.has(id)) throw new Error(`reorderSpaces: unknown space ${id}`);
  }
  return { ...ws, spaceOrder: orderedIds };
}

// ---------------------------------------------------------------------------
// Group operations
// ---------------------------------------------------------------------------

/** Create a new group inside a space. */
export function createGroup(ws: Workspace, spaceId: string, name: string): Workspace {
  const space = ws.spaces[spaceId];
  if (!space) throw new Error(`Space ${spaceId} not found`);
  const newGroup: Group = { id: crypto.randomUUID(), name, tabs: [] };
  return {
    ...ws,
    spaces: {
      ...ws.spaces,
      [spaceId]: { ...space, groups: [...space.groups, newGroup] },
    },
  };
}

/** Rename a group inside a space. */
export function renameGroup(ws: Workspace, spaceId: string, groupId: string, name: string): Workspace {
  const space = ws.spaces[spaceId];
  if (!space) throw new Error(`Space ${spaceId} not found`);
  const { index } = findGroup(space, groupId);
  const newGroups = [...space.groups];
  newGroups[index] = { ...newGroups[index], name };
  return {
    ...ws,
    spaces: { ...ws.spaces, [spaceId]: { ...space, groups: newGroups } },
  };
}

/** Delete a group from a space. */
export function deleteGroup(ws: Workspace, spaceId: string, groupId: string): Workspace {
  const space = ws.spaces[spaceId];
  if (!space) throw new Error(`Space ${spaceId} not found`);
  findGroup(space, groupId); // validate existence
  return {
    ...ws,
    spaces: {
      ...ws.spaces,
      [spaceId]: { ...space, groups: space.groups.filter((g) => g.id !== groupId) },
    },
  };
}

/** Reorder groups within a space. */
export function reorderGroups(ws: Workspace, spaceId: string, orderedIds: string[]): Workspace {
  const space = ws.spaces[spaceId];
  if (!space) throw new Error(`Space ${spaceId} not found`);
  const byId = new Map(space.groups.map((g) => [g.id, g]));
  if (orderedIds.length !== byId.size || new Set(orderedIds).size !== orderedIds.length) {
    throw new Error('reorderGroups: orderedIds must contain each group exactly once');
  }
  const newGroups = orderedIds.map((id) => {
    const g = byId.get(id);
    if (!g) throw new Error(`reorderGroups: unknown group ${id}`);
    return g;
  });
  return {
    ...ws,
    spaces: { ...ws.spaces, [spaceId]: { ...space, groups: newGroups } },
  };
}

export {
  createSavedTab,
  editSavedTab,
  deleteSavedTab,
  reorderSavedTabs,
  moveSavedTab,
  saveBrowserTab,
  stashCurrentTabs,
} from './tab-operations';
