import { describe, expect, it } from 'vitest';
import type { Workspace } from './types';
import {
  createSpace,
  renameSpace,
  deleteSpace,
  reorderSpaces,
  createGroup,
  renameGroup,
  deleteGroup,
  reorderGroups,
} from './operations';
import { bootstrapWorkspace } from './backup';

/** Create a minimal workspace with one empty space for testing. */
function makeWorkspace(): Workspace {
  const ws = bootstrapWorkspace();
  // add a second space for cross-space tests
  const id2 = crypto.randomUUID();
  ws.spaces[id2] = { id: id2, name: 'Second', groups: [], pins: {} };
  ws.spaceOrder.push(id2);
  return ws;
}

/** Freeze a Workspace so mutation attempts throw in strict mode / fail visibly. */
function freezeWs(ws: Workspace): Workspace {
  return Object.freeze(ws);
}

describe('space operations', () => {
  it('createSpace appends a new space and does not mutate input', () => {
    const ws = freezeWs(makeWorkspace());
    const result = createSpace(ws, 'New Space');
    expect(result.spaceOrder.length).toBe(ws.spaceOrder.length + 1);
    const newId = result.spaceOrder[result.spaceOrder.length - 1];
    expect(result.spaces[newId]).toBeDefined();
    expect(result.spaces[newId].name).toBe('New Space');
    expect(result.spaces[newId].groups).toEqual([]);
    expect(result.spaces[newId].pins).toEqual({});
    expect(Object.is(ws, result)).toBe(false);
  });

  it('renameSpace updates the space name', () => {
    const ws = freezeWs(makeWorkspace());
    const spaceId = ws.spaceOrder[0];
    const result = renameSpace(ws, spaceId, 'Renamed');
    expect(result.spaces[spaceId].name).toBe('Renamed');
    expect(ws.spaces[spaceId].name).not.toBe('Renamed');
  });

  it('renameSpace throws for unknown space', () => {
    const ws = freezeWs(makeWorkspace());
    expect(() => renameSpace(ws, 'nonexistent', 'x')).toThrow('not found');
  });

  it('deleteSpace removes space and its order entry', () => {
    const ws = freezeWs(makeWorkspace());
    const spaceId = ws.spaceOrder[0];
    const result = deleteSpace(ws, spaceId);
    expect(result.spaces[spaceId]).toBeUndefined();
    expect(result.spaceOrder).not.toContain(spaceId);
    expect(result.spaceOrder.length).toBe(ws.spaceOrder.length - 1);
  });

  it('deleteSpace throws for unknown space', () => {
    const ws = freezeWs(makeWorkspace());
    expect(() => deleteSpace(ws, 'nonexistent')).toThrow('not found');
  });

  it('reorderSpaces changes the order', () => {
    const ws = freezeWs(makeWorkspace());
    const reversed = [...ws.spaceOrder].reverse();
    const result = reorderSpaces(ws, reversed);
    expect(result.spaceOrder).toEqual(reversed);
  });

  it('reorderSpaces throws on wrong length', () => {
    const ws = freezeWs(makeWorkspace());
    expect(() => reorderSpaces(ws, [ws.spaceOrder[0]])).toThrow('exactly once');
  });

  it('reorderSpaces throws on duplicate ids', () => {
    const ws = freezeWs(makeWorkspace());
    expect(() => reorderSpaces(ws, [ws.spaceOrder[0], ws.spaceOrder[0]])).toThrow('exactly once');
  });

  it('reorderSpaces throws on unknown id', () => {
    const ws = freezeWs(makeWorkspace());
    const bad = [...ws.spaceOrder];
    bad[0] = 'nonexistent';
    expect(() => reorderSpaces(ws, bad)).toThrow('unknown space');
  });
});

describe('group operations', () => {
  function wsWithGroup(): { ws: Workspace; spaceId: string; groupId: string } {
    const ws = makeWorkspace();
    const spaceId = ws.spaceOrder[0];
    const result = createGroup(ws, spaceId, 'Test Group');
    return { ws: result, spaceId, groupId: result.spaces[spaceId].groups[0].id };
  }

  it('createGroup adds a group to a space', () => {
    const ws = freezeWs(makeWorkspace());
    const spaceId = ws.spaceOrder[0];
    const result = createGroup(ws, spaceId, 'My Group');
    expect(result.spaces[spaceId].groups.length).toBe(1);
    expect(result.spaces[spaceId].groups[0].name).toBe('My Group');
    expect(result.spaces[spaceId].groups[0].tabs).toEqual([]);
    expect(ws.spaces[spaceId].groups.length).toBe(0);
  });

  it('createGroup throws for unknown space', () => {
    const ws = freezeWs(makeWorkspace());
    expect(() => createGroup(ws, 'nope', 'G')).toThrow('not found');
  });

  it('renameGroup changes the group name', () => {
    const { ws, spaceId, groupId } = wsWithGroup();
    const frozen = freezeWs(ws);
    const result = renameGroup(frozen, spaceId, groupId, 'Renamed');
    expect(result.spaces[spaceId].groups[0].name).toBe('Renamed');
  });

  it('renameGroup throws for unknown group', () => {
    const { ws, spaceId } = wsWithGroup();
    expect(() => renameGroup(ws, spaceId, 'nope', 'x')).toThrow('not found');
  });

  it('deleteGroup removes the group', () => {
    const { ws, spaceId, groupId } = wsWithGroup();
    const frozen = freezeWs(ws);
    const result = deleteGroup(frozen, spaceId, groupId);
    expect(result.spaces[spaceId].groups.length).toBe(0);
  });

  it('deleteGroup throws for unknown group', () => {
    const { ws, spaceId } = wsWithGroup();
    expect(() => deleteGroup(ws, spaceId, 'nope')).toThrow('not found');
  });

  it('reorderGroups changes group order', () => {
    const { ws, spaceId } = wsWithGroup();
    // add a second group
    const with2 = createGroup(ws, spaceId, 'Second Group');
    const groups = with2.spaces[spaceId].groups;
    const reversed = [groups[1].id, groups[0].id];
    const result = reorderGroups(freezeWs(with2), spaceId, reversed);
    expect(result.spaces[spaceId].groups.map((g) => g.id)).toEqual(reversed);
  });

  it('reorderGroups throws on wrong length', () => {
    const { ws, spaceId } = wsWithGroup();
    expect(() => reorderGroups(ws, spaceId, [])).toThrow('exactly once');
  });

  it('reorderGroups throws on duplicate ids', () => {
    const { ws, spaceId, groupId } = wsWithGroup();
    expect(() => reorderGroups(ws, spaceId, [groupId, groupId])).toThrow('exactly once');
  });

  it('reorderGroups throws on unknown id', () => {
    const { ws, spaceId } = wsWithGroup();
    expect(() => reorderGroups(ws, spaceId, ['nope'])).toThrow('unknown group');
  });
});
