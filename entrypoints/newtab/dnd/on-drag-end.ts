import type { Command } from '@/src/messaging/protocol';
import {
  decodeDndId,
  groupTabOrderKey,
  type BrowserTabPayload,
  type DndDragData,
} from './dnd-config';

type DragActive = {
  id: string;
  data?: {
    current?: unknown;
  };
};

type DragOver = {
  id: string;
} | null;

/** Maps a dnd-kit drag result to the single mutation command it should commit. */
export function mapDragEndToCommand(active: DragActive, over: DragOver): Command | null {
  if (!over || active.id === over.id) return null;

  const source = decodeDndId(active.id);
  const target = decodeDndId(over.id);
  const data = parseDragData(active.data?.current);

  if (!source || !target || !data) return null;

  if (source.kind === 'space' && target.kind === 'space' && data.kind === 'space') {
    const orderedIds = moveId(data.orderedIds, source.spaceId, target.spaceId);
    return orderedIds ? { type: 'reorderSpaces', orderedIds } : null;
  }

  if (
    source.kind === 'group' &&
    target.kind === 'group' &&
    data.kind === 'group' &&
    source.spaceId === target.spaceId
  ) {
    const orderedIds = moveId(data.orderedIds, source.groupId, target.groupId);
    return orderedIds ? { type: 'reorderGroups', spaceId: source.spaceId, orderedIds } : null;
  }

  if (source.kind === 'tab' && data.kind === 'tab') {
    return mapSavedTabDrop(source, target, data);
  }

  if (source.kind === 'browserTab' && data.kind === 'browserTab') {
    return mapBrowserTabDrop(target, data.tab);
  }

  return null;
}

function mapSavedTabDrop(
  source: Extract<ReturnType<typeof decodeDndId>, { kind: 'tab' }>,
  target: NonNullable<ReturnType<typeof decodeDndId>>,
  data: Extract<DndDragData, { kind: 'tab' }>,
): Command | null {
  if (target.kind === 'tab') {
    if (source.spaceId === target.spaceId && source.groupId === target.groupId) {
      const orderedIds = moveId(data.orderedIds, source.tabId, target.tabId);
      return orderedIds
        ? { type: 'reorderSavedTabs', spaceId: source.spaceId, groupId: source.groupId, orderedIds }
        : null;
    }

    const targetOrder = data.groupTabOrders[groupTabOrderKey(target.spaceId, target.groupId)];
    const index = targetOrder?.indexOf(target.tabId) ?? -1;
    if (index < 0) return null;

    return {
      type: 'moveSavedTab',
      from: { spaceId: source.spaceId, groupId: source.groupId },
      to: { spaceId: target.spaceId, groupId: target.groupId, index },
      tabId: source.tabId,
    };
  }

  if (target.kind === 'group' && (source.spaceId !== target.spaceId || source.groupId !== target.groupId)) {
    const targetOrder = data.groupTabOrders[groupTabOrderKey(target.spaceId, target.groupId)] ?? [];
    return {
      type: 'moveSavedTab',
      from: { spaceId: source.spaceId, groupId: source.groupId },
      to: { spaceId: target.spaceId, groupId: target.groupId, index: targetOrder.length },
      tabId: source.tabId,
    };
  }

  return null;
}

/** Maps a current-browser-tab drop onto a saved group or saved tab target. */
function mapBrowserTabDrop(
  target: NonNullable<ReturnType<typeof decodeDndId>>,
  tab: BrowserTabPayload,
): Command | null {
  if (target.kind === 'group') {
    return { type: 'saveBrowserTab', spaceId: target.spaceId, groupId: target.groupId, tab };
  }
  if (target.kind === 'tab') {
    return { type: 'saveBrowserTab', spaceId: target.spaceId, groupId: target.groupId, tab };
  }

  return null;
}

/** Moves one id to the target id's slot, returning null when no move is needed. */
function moveId(orderedIds: string[], activeId: string, overId: string): string[] | null {
  const oldIndex = orderedIds.indexOf(activeId);
  const newIndex = orderedIds.indexOf(overId);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return null;

  const next = [...orderedIds];
  const [moved] = next.splice(oldIndex, 1);
  next.splice(newIndex, 0, moved);
  return next;
}

/** Parses dnd-kit metadata into the app's drag-data union. */
function parseDragData(value: unknown): DndDragData | null {
  if (!isRecord(value)) return null;

  if (value.kind === 'space' && isStringArray(value.orderedIds)) {
    return { kind: 'space', orderedIds: value.orderedIds };
  }
  if (value.kind === 'group' && typeof value.spaceId === 'string' && isStringArray(value.orderedIds)) {
    return { kind: 'group', spaceId: value.spaceId, orderedIds: value.orderedIds };
  }
  if (
    value.kind === 'tab' &&
    typeof value.spaceId === 'string' &&
    typeof value.groupId === 'string' &&
    isStringArray(value.orderedIds) &&
    isGroupTabOrders(value.groupTabOrders)
  ) {
    return {
      kind: 'tab',
      spaceId: value.spaceId,
      groupId: value.groupId,
      orderedIds: value.orderedIds,
      groupTabOrders: value.groupTabOrders,
    };
  }
  if (value.kind === 'browserTab' && isBrowserTabPayload(value.tab)) {
    return { kind: 'browserTab', tab: value.tab };
  }

  return null;
}

/** Checks that an unknown value has the browser-tab payload shape. */
function isBrowserTabPayload(value: unknown): value is BrowserTabPayload {
  return isRecord(value) && typeof value.title === 'string' && typeof value.url === 'string';
}

/** Checks that an unknown value maps group keys to ordered tab ids. */
function isGroupTabOrders(value: unknown): value is Record<string, string[]> {
  if (!isRecord(value)) return false;
  return Object.values(value).every(isStringArray);
}

/** Checks that an unknown value is an array of strings. */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/** Checks that an unknown value is a non-null record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
