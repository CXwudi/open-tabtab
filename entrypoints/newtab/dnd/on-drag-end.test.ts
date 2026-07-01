import { describe, expect, it } from 'vitest';
import {
  encodeBrowserTabId,
  encodeGroupId,
  encodeSpaceId,
  encodeTabId,
  groupTabOrderKey,
  type DndDragData,
} from './dnd-config';
import { mapDragEndToCommand } from './on-drag-end';

describe('mapDragEndToCommand', () => {
  it('maps a space drop to reorderSpaces', () => {
    const data = { kind: 'space', orderedIds: ['s1', 's2', 's3'] } satisfies DndDragData;

    expect(mapDragEndToCommand(
      { id: encodeSpaceId('s1'), data: { current: data } },
      { id: encodeSpaceId('s3') },
    )).toEqual({ type: 'reorderSpaces', orderedIds: ['s2', 's3', 's1'] });
  });

  it('maps a collection drop to reorderGroups', () => {
    const data = { kind: 'group', spaceId: 's1', orderedIds: ['g1', 'g2'] } satisfies DndDragData;

    expect(mapDragEndToCommand(
      { id: encodeGroupId('s1', 'g2'), data: { current: data } },
      { id: encodeGroupId('s1', 'g1') },
    )).toEqual({ type: 'reorderGroups', spaceId: 's1', orderedIds: ['g2', 'g1'] });
  });

  it('maps a same-collection saved-tab drop to reorderSavedTabs', () => {
    const data = {
      kind: 'tab',
      spaceId: 's1',
      groupId: 'g1',
      orderedIds: ['t1', 't2', 't3'],
      groupTabOrders: { [groupTabOrderKey('s1', 'g1')]: ['t1', 't2', 't3'] },
    } satisfies DndDragData;

    expect(mapDragEndToCommand(
      { id: encodeTabId('s1', 'g1', 't1'), data: { current: data } },
      { id: encodeTabId('s1', 'g1', 't3') },
    )).toEqual({
      type: 'reorderSavedTabs',
      spaceId: 's1',
      groupId: 'g1',
      orderedIds: ['t2', 't3', 't1'],
    });
  });

  it('maps a cross-collection saved-tab drop to moveSavedTab', () => {
    const data = {
      kind: 'tab',
      spaceId: 's1',
      groupId: 'g1',
      orderedIds: ['t1', 't2'],
      groupTabOrders: {
        [groupTabOrderKey('s1', 'g1')]: ['t1', 't2'],
        [groupTabOrderKey('s1', 'g2')]: ['t3', 't4'],
      },
    } satisfies DndDragData;

    expect(mapDragEndToCommand(
      { id: encodeTabId('s1', 'g1', 't1'), data: { current: data } },
      { id: encodeTabId('s1', 'g2', 't4') },
    )).toEqual({
      type: 'moveSavedTab',
      from: { spaceId: 's1', groupId: 'g1' },
      to: { spaceId: 's1', groupId: 'g2', index: 1 },
      tabId: 't1',
    });
  });

  it('maps a browser-tab drop onto a collection to saveBrowserTab', () => {
    const data = {
      kind: 'browserTab',
      tab: { title: 'Docs', url: 'https://docs.example', favIconUrl: 'https://docs.example/icon.png' },
    } satisfies DndDragData;

    expect(mapDragEndToCommand(
      { id: encodeBrowserTabId(12), data: { current: data } },
      { id: encodeGroupId('s1', 'g1') },
    )).toEqual({
      type: 'saveBrowserTab',
      spaceId: 's1',
      groupId: 'g1',
      tab: { title: 'Docs', url: 'https://docs.example', favIconUrl: 'https://docs.example/icon.png' },
    });
  });

  it('maps a browser-tab drop onto a saved tab to saveBrowserTab', () => {
    const data = {
      kind: 'browserTab',
      tab: { title: 'Docs', url: 'https://docs.example' },
    } satisfies DndDragData;

    expect(mapDragEndToCommand(
      { id: encodeBrowserTabId(12), data: { current: data } },
      { id: encodeTabId('s1', 'g1', 't1') },
    )).toEqual({
      type: 'saveBrowserTab',
      spaceId: 's1',
      groupId: 'g1',
      tab: { title: 'Docs', url: 'https://docs.example' },
    });
  });

  it('maps a saved-tab drop onto another collection to moveSavedTab at the end', () => {
    const data = {
      kind: 'tab',
      spaceId: 's1',
      groupId: 'g1',
      orderedIds: ['t1', 't2'],
      groupTabOrders: {
        [groupTabOrderKey('s1', 'g1')]: ['t1', 't2'],
        [groupTabOrderKey('s1', 'g2')]: ['t3'],
      },
    } satisfies DndDragData;

    expect(mapDragEndToCommand(
      { id: encodeTabId('s1', 'g1', 't1'), data: { current: data } },
      { id: encodeGroupId('s1', 'g2') },
    )).toEqual({
      type: 'moveSavedTab',
      from: { spaceId: 's1', groupId: 'g1' },
      to: { spaceId: 's1', groupId: 'g2', index: 1 },
      tabId: 't1',
    });
  });

  it('returns null for no-op drops', () => {
    const data = { kind: 'space', orderedIds: ['s1', 's2'] } satisfies DndDragData;

    expect(mapDragEndToCommand(
      { id: encodeSpaceId('s1'), data: { current: data } },
      { id: encodeSpaceId('s1') },
    )).toBeNull();
    expect(mapDragEndToCommand(
      { id: encodeSpaceId('s1'), data: { current: data } },
      null,
    )).toBeNull();
  });
});
