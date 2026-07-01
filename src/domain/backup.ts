/**
 * Backup adapter: import, export, bootstrap, and shape-tolerant parsing.
 *
 * - `parseBackup` accepts both TabTab-shaped (has `space_list`) and
 *   Open-TabTab-shaped (has `spaceOrder`) backups, normalizing either
 *   to the internal `Workspace`.
 * - `serializeBackup` exports the internal Workspace shape.
 * - `fromTabTab` converts a TabTab-format backup to internal Workspace.
 * - `bootstrapWorkspace` creates the initial Default workspace.
 */

import type { Group, SavedTab, Workspace, TabTabBackup, Space } from './types';
import { nextVersion } from './version';

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

/** Create an initial Workspace with one Default space. */
export function bootstrapWorkspace(): Workspace {
  const id = crypto.randomUUID();
  return {
    version: nextVersion(),
    spaceOrder: [id],
    spaces: {
      [id]: { id, name: 'Default', groups: [], pins: {} },
    },
  };
}

// ---------------------------------------------------------------------------
// TabTab → Internal adapter
// ---------------------------------------------------------------------------

/** Convert a TabTab-shaped backup into the internal Workspace shape. */
export function fromTabTab(backup: TabTabBackup): Workspace {
  // Build spaceOrder from space_list ids, then append any spaces keys
  // not in space_list, and skip space_list ids not present in spaces.
  const spaceListIds = backup.space_list.map((s) => s.id);
  const spaceIds = new Set(Object.keys(backup.spaces));

  // Filter: keep only ids that exist in spaces
  const filteredOrder = spaceListIds.filter((id) => spaceIds.has(id));

  // Append any space ids not in the filtered order
  for (const id of spaceIds) {
    if (!filteredOrder.includes(id)) {
      filteredOrder.push(id);
    }
  }

  // Build internal spaces map
  const spaces: Record<string, Space> = {};
  for (const id of filteredOrder) {
    const src = backup.spaces[id];
    if (!src) continue; // should not happen given the filter above
    spaces[id] = {
      id: src.id,
      name: src.name,
      groups: normalizeGroups(src.groups),
      pins: src.pins ? { ...src.pins } : {},
    };
  }

  return {
    version: backup.version,
    spaceOrder: filteredOrder,
    spaces,
  };
}

// ---------------------------------------------------------------------------
// Shape-tolerant parser
// ---------------------------------------------------------------------------

/**
 * Parse a backup from either TabTab-compatible or Open-TabTab (internal)
 * format. Returns either a `Workspace` or a validation error.
 */
export function parseBackup(
  input: unknown,
): { ok: true; workspace: Workspace } | { ok: false; error: string } {
  if (!isRecord(input)) {
    return { ok: false, error: 'Backup must be a JSON object' };
  }

  if (typeof input.version !== 'number') {
    return { ok: false, error: 'Backup must have a numeric "version" field' };
  }

  if (!isRecord(input.spaces)) {
    return { ok: false, error: 'Backup must have a "spaces" object' };
  }

  if (Array.isArray(input.space_list)) {
    return parseTabTabShape(input as BackupObject);
  }

  if (Array.isArray(input.spaceOrder)) {
    return parseInternalShape(input as BackupObject);
  }

  return { ok: false, error: 'Backup must have "space_list" (TabTab format) or "spaceOrder" (Open TabTab format)' };
}

function parseTabTabShape(
  obj: BackupObject,
): { ok: true; workspace: Workspace } | { ok: false; error: string } {
  for (const item of obj.space_list as unknown[]) {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.name !== 'string') {
      return { ok: false, error: 'Each space_list entry must have string "id" and "name"' };
    }
  }

  const validationError = validateSpaces(obj.spaces);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  return { ok: true, workspace: fromTabTab(obj as TabTabBackup) };
}

function parseInternalShape(
  obj: BackupObject,
): { ok: true; workspace: Workspace } | { ok: false; error: string } {
  const spaceOrder = obj.spaceOrder as unknown[];
  for (const id of spaceOrder) {
    if (typeof id !== 'string') {
      return { ok: false, error: 'Each spaceOrder entry must be a string id' };
    }
  }

  const validationError = validateSpaces(obj.spaces);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const spaces: Record<string, Space> = {};
  const spacesObj = obj.spaces;
  const filteredOrder = spaceOrder.filter((id): id is string => typeof id === 'string' && id in spacesObj);

  for (const rawId of spaceOrder) {
    const id = rawId as string;
    const src = spacesObj[id] as Record<string, unknown> | undefined;
    if (!src) continue;
    spaces[id] = {
      id: src.id as string,
      name: src.name as string,
      groups: normalizeGroups(src.groups as Group[] | undefined),
      pins: src.pins ? { ...(src.pins as Record<string, unknown>) } : {},
    };
  }

  const missingOrderIds: string[] = [];
  for (const id of Object.keys(spacesObj)) {
    if (spaces[id]) continue;
    const src = spacesObj[id] as Record<string, unknown>;
    spaces[id] = {
      id: src.id as string,
      name: src.name as string,
      groups: normalizeGroups(src.groups as Group[] | undefined),
      pins: src.pins ? { ...(src.pins as Record<string, unknown>) } : {},
    };
    missingOrderIds.push(id);
  }

  return {
    ok: true,
    workspace: {
      version: obj.version as number,
      spaceOrder: [...filteredOrder, ...missingOrderIds],
      spaces,
    },
  };
}

type BackupObject = Record<string, unknown> & {
  version: number;
  spaces: Record<string, unknown>;
};

function validateSpaces(spacesObj: Record<string, unknown>): string | undefined {
  for (const [id, space] of Object.entries(spacesObj)) {
    if (!isRecord(space)) {
      return `Space "${id}" must be an object`;
    }
    if (typeof space.id !== 'string') {
      return `Space "${id}" must have a string "id"`;
    }
    if (typeof space.name !== 'string') {
      return `Space "${id}" must have a string "name"`;
    }
    if (space.groups !== undefined && !Array.isArray(space.groups)) {
      return `Space "${id}" groups must be an array`;
    }
    const groupError = validateGroups(space.groups);
    if (groupError) {
      return groupError;
    }
  }

  return undefined;
}

function validateGroups(groups: unknown): string | undefined {
  if (!Array.isArray(groups)) {
    return undefined;
  }

  for (const group of groups) {
    if (!isRecord(group) || typeof group.id !== 'string' || typeof group.name !== 'string') {
      return 'Each group must have string "id" and "name"';
    }
    if (group.tabs !== undefined && !Array.isArray(group.tabs)) {
      return 'Group "tabs" must be an array';
    }
    const tabError = validateTabs(group.tabs);
    if (tabError) {
      return tabError;
    }
  }

  return undefined;
}

function validateTabs(tabs: unknown): string | undefined {
  if (!Array.isArray(tabs)) {
    return undefined;
  }

  for (const tab of tabs) {
    if (
      !isRecord(tab)
      || typeof tab.id !== 'string'
      || typeof tab.url !== 'string'
      || typeof tab.title !== 'string'
    ) {
      return 'Each saved tab must have string "id", "url", and "title"';
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

/** Serialize a Workspace to a pretty-printed JSON string (internal shape). */
export function serializeBackup(ws: Workspace): string {
  return JSON.stringify(ws, null, 2);
}

function normalizeGroups(groups: Group[] | undefined): Group[] {
  return (groups ?? []).map((group) => ({
    id: group.id,
    name: group.name,
    tabs: normalizeTabs((group as Group & { tabs?: SavedTab[] }).tabs),
  }));
}

function normalizeTabs(tabs: SavedTab[] | undefined): SavedTab[] {
  return (tabs ?? []).map((tab) => ({
    id: tab.id,
    title: tab.title,
    url: tab.url,
    favIconUrl: tab.favIconUrl,
    kind: 'record',
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
