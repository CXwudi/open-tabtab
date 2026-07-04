import {
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

export type BrowserTabPayload = {
  title: string;
  url: string;
  favIconUrl?: string;
};

export type DndDragData =
  | { kind: 'space'; orderedIds: string[] }
  | { kind: 'group'; spaceId: string; orderedIds: string[] }
  | {
    kind: 'tab';
    spaceId: string;
    groupId: string;
    orderedIds: string[];
    groupTabOrders: Record<string, string[]>;
  }
  | { kind: 'browserTab'; tab: BrowserTabPayload };

export type DecodedDndId =
  | { kind: 'space'; spaceId: string }
  | { kind: 'group'; spaceId: string; groupId: string }
  | { kind: 'tab'; spaceId: string; groupId: string; tabId: string }
  | { kind: 'browserTab'; tabId: string };

export const appCollisionDetection: CollisionDetection = (args) => {
  const droppableContainers = args.droppableContainers.filter((container) => (
    isCompatibleDropTarget(args.active.data.current, String(container.id))
  ));
  if (droppableContainers.length === 0) return [];

  const filteredArgs = { ...args, droppableContainers };
  const pointerCollisions = pointerWithin(filteredArgs);
  if (pointerCollisions.length > 0) {
    return prioritizeNestedTabTargets(pointerCollisions, args.active.data.current);
  }

  const intersections = rectIntersection(filteredArgs);
  if (intersections.length > 0) {
    return prioritizeNestedTabTargets(intersections, args.active.data.current);
  }

  if (args.pointerCoordinates) return [];

  return closestCenter(filteredArgs);
};

/** Builds pointer and keyboard sensors shared by the new-tab DnD surface. */
export function useDndSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/** Encodes a space draggable id. */
export function encodeSpaceId(spaceId: string): string {
  return `space:${spaceId}`;
}

/** Encodes a collection draggable/drop target id. */
export function encodeGroupId(spaceId: string, groupId: string): string {
  return `group:${spaceId}:${groupId}`;
}

/** Encodes a saved-tab draggable/drop target id. */
export function encodeTabId(spaceId: string, groupId: string, tabId: string): string {
  return `tab:${spaceId}:${groupId}:${tabId}`;
}

/** Encodes a current-browser-tab draggable id. */
export function encodeBrowserTabId(tabId: number | string): string {
  return `browserTab:${tabId}`;
}

/** Builds a stable key for per-group tab-order metadata. */
export function groupTabOrderKey(spaceId: string, groupId: string): string {
  return `${spaceId}:${groupId}`;
}

/** Decodes a DnD id, returning null for ids outside this app's scheme. */
export function decodeDndId(id: string): DecodedDndId | null {
  const [kind, ...parts] = id.split(':');

  if (kind === 'space' && parts.length === 1) {
    return { kind, spaceId: parts[0] };
  }
  if (kind === 'group' && parts.length === 2) {
    return { kind, spaceId: parts[0], groupId: parts[1] };
  }
  if (kind === 'tab' && parts.length === 3) {
    return { kind, spaceId: parts[0], groupId: parts[1], tabId: parts[2] };
  }
  if (kind === 'browserTab' && parts.length === 1) {
    return { kind, tabId: parts[0] };
  }

  return null;
}

/** Checks whether a droppable id is relevant for the active drag kind. */
function isCompatibleDropTarget(data: unknown, targetId: string): boolean {
  const activeKind = getDragKind(data);
  const target = decodeDndId(targetId);
  if (!activeKind || !target) return false;

  if (activeKind === 'space') return target.kind === 'space';
  if (activeKind === 'group') return target.kind === 'group';
  if (activeKind === 'tab' || activeKind === 'browserTab') {
    return target.kind === 'tab' || target.kind === 'group';
  }

  return false;
}

/** Prefers saved-tab cards over their parent collection when both collide. */
function prioritizeNestedTabTargets(
  collisions: ReturnType<CollisionDetection>,
  data: unknown,
): ReturnType<CollisionDetection> {
  const activeKind = getDragKind(data);
  if (activeKind !== 'tab' && activeKind !== 'browserTab') return collisions;

  const tabCollisions = collisions.filter((collision) => (
    decodeDndId(String(collision.id))?.kind === 'tab'
  ));

  return tabCollisions.length > 0 ? tabCollisions : collisions;
}

/** Reads the app drag kind from dnd-kit metadata. */
function getDragKind(data: unknown): DndDragData['kind'] | null {
  if (!isRecord(data) || typeof data.kind !== 'string') return null;
  if (data.kind === 'space' || data.kind === 'group' || data.kind === 'tab' || data.kind === 'browserTab') {
    return data.kind;
  }

  return null;
}

/** Checks whether an unknown value is a non-null object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
