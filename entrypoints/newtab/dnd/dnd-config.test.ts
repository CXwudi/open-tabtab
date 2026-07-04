import { describe, expect, it } from 'vitest';
import {
  appCollisionDetection,
  encodeBrowserTabId,
  encodeGroupId,
  encodeSpaceId,
  type DndDragData,
} from './dnd-config';

type CollisionArgs = Parameters<typeof appCollisionDetection>[0];

/** Builds a DOMRect-like object for dnd-kit collision tests. */
function rect(left: number, top: number, width: number, height: number) {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

/** Builds a minimal active draggable descriptor for collision tests. */
function active(id: string, data: DndDragData): CollisionArgs['active'] {
  return {
    id,
    data: { current: data },
    rect: { current: { initial: null, translated: null } },
  } as CollisionArgs['active'];
}

/** Builds a minimal droppable container descriptor for collision tests. */
function droppable(id: string): CollisionArgs['droppableContainers'][number] {
  return {
    id,
    key: id,
    data: { current: {} },
    disabled: false,
    node: { current: null },
    rect: { current: null },
  } as CollisionArgs['droppableContainers'][number];
}

describe('appCollisionDetection', () => {
  const browserTabData = {
    kind: 'browserTab',
    tab: { title: 'Docs', url: 'https://docs.example' },
  } satisfies DndDragData;

  it('prefers the collection currently under the pointer', () => {
    const firstGroupId = encodeGroupId('s1', 'g1');
    const secondGroupId = encodeGroupId('s1', 'g2');

    const collisions = appCollisionDetection({
      active: active(encodeBrowserTabId(1), browserTabData),
      collisionRect: rect(120, 120, 80, 24),
      droppableContainers: [droppable(firstGroupId), droppable(secondGroupId)],
      droppableRects: new Map([
        [firstGroupId, rect(0, 0, 320, 80)],
        [secondGroupId, rect(0, 100, 320, 80)],
      ]),
      pointerCoordinates: { x: 160, y: 130 },
    });

    expect(collisions[0]?.id).toBe(secondGroupId);
  });

  it('does not choose a collection when the pointer only hits an incompatible target', () => {
    const spaceId = encodeSpaceId('s1');
    const groupId = encodeGroupId('s1', 'g1');

    const collisions = appCollisionDetection({
      active: active(encodeBrowserTabId(1), browserTabData),
      collisionRect: rect(20, 20, 80, 24),
      droppableContainers: [droppable(spaceId), droppable(groupId)],
      droppableRects: new Map([
        [spaceId, rect(0, 0, 220, 40)],
        [groupId, rect(0, 100, 320, 80)],
      ]),
      pointerCoordinates: { x: 40, y: 20 },
    });

    expect(collisions).toEqual([]);
  });
});
