import { describe, expect, it } from 'vitest';
import type { Workspace } from './types';
import { bootstrapWorkspace } from './backup';
import { createGroup } from './operations';
import {
  createSavedTab,
  editSavedTab,
  deleteSavedTab,
  reorderSavedTabs,
  moveSavedTab,
  saveBrowserTab,
  stashCurrentTabs,
} from './tab-operations';

/** Create a minimal workspace with one empty space for testing. */
function makeWorkspace(): Workspace {
  const ws = bootstrapWorkspace();
  const id2 = crypto.randomUUID();
  ws.spaces[id2] = { id: id2, name: 'Second', groups: [], pins: {} };
  ws.spaceOrder.push(id2);
  return ws;
}

/** Freeze a Workspace so mutation attempts throw in strict mode / fail visibly. */
function freezeWs(ws: Workspace): Workspace {
  return Object.freeze(ws);
}

describe('saved-tab operations', () => {
  function wsWithTab(): { ws: Workspace; spaceId: string; groupId: string; tabId: string } {
    const ws = makeWorkspace();
    const spaceId = ws.spaceOrder[0];
    const withGroup = createGroup(ws, spaceId, 'Group');
    const groupId = withGroup.spaces[spaceId].groups[0].id;
    const withTab = createSavedTab(withGroup, spaceId, groupId, 'Tab Title', 'https://example.com');
    const tabId = withTab.spaces[spaceId].groups[0].tabs[0].id;
    return { ws: withTab, spaceId, groupId, tabId };
  }

  it('createSavedTab appends a tab to a group', () => {
    const ws = makeWorkspace();
    const spaceId = ws.spaceOrder[0];
    const withGroup = createGroup(ws, spaceId, 'Group');
    const groupId = withGroup.spaces[spaceId].groups[0].id;
    const result = createSavedTab(freezeWs(withGroup), spaceId, groupId, 'T', 'https://x.com');
    const tabs = result.spaces[spaceId].groups[0].tabs;
    expect(tabs.length).toBe(1);
    expect(tabs[0].title).toBe('T');
    expect(tabs[0].url).toBe('https://x.com');
    expect(tabs[0].kind).toBe('record');
    expect(tabs[0].id).toBeTruthy();
  });

  it('createSavedTab throws for unknown space', () => {
    const { ws, groupId } = wsWithTab();
    expect(() => createSavedTab(ws, 'nope', groupId, 'T', 'u')).toThrow('not found');
  });

  it('createSavedTab throws for unknown group', () => {
    const { ws, spaceId } = wsWithTab();
    expect(() => createSavedTab(ws, spaceId, 'nope', 'T', 'u')).toThrow('not found');
  });

  it('editSavedTab updates title and url', () => {
    const { ws, spaceId, groupId, tabId } = wsWithTab();
    const result = editSavedTab(freezeWs(ws), spaceId, groupId, tabId, 'New Title', 'https://new.com');
    const tab = result.spaces[spaceId].groups[0].tabs[0];
    expect(tab.title).toBe('New Title');
    expect(tab.url).toBe('https://new.com');
  });

  it('editSavedTab throws for unknown tab', () => {
    const { ws, spaceId, groupId } = wsWithTab();
    expect(() => editSavedTab(ws, spaceId, groupId, 'nope', 'T', 'u')).toThrow('not found');
  });

  it('deleteSavedTab removes the tab', () => {
    const { ws, spaceId, groupId, tabId } = wsWithTab();
    const result = deleteSavedTab(freezeWs(ws), spaceId, groupId, tabId);
    expect(result.spaces[spaceId].groups[0].tabs.length).toBe(0);
  });

  it('deleteSavedTab throws for unknown tab', () => {
    const { ws, spaceId, groupId } = wsWithTab();
    expect(() => deleteSavedTab(ws, spaceId, groupId, 'nope')).toThrow('not found');
  });

  it('reorderSavedTabs changes tab order', () => {
    const { ws, spaceId, groupId } = wsWithTab();
    const with2 = createSavedTab(ws, spaceId, groupId, 'Tab 2', 'https://2.com');
    const tabs = with2.spaces[spaceId].groups[0].tabs;
    const reversed = [tabs[1].id, tabs[0].id];
    const result = reorderSavedTabs(freezeWs(with2), spaceId, groupId, reversed);
    expect(result.spaces[spaceId].groups[0].tabs.map((t) => t.id)).toEqual(reversed);
  });

  it('reorderSavedTabs throws on wrong length', () => {
    const { ws, spaceId, groupId } = wsWithTab();
    expect(() => reorderSavedTabs(ws, spaceId, groupId, [])).toThrow('exactly once');
  });

  it('reorderSavedTabs throws on duplicate ids', () => {
    const { ws, spaceId, groupId, tabId } = wsWithTab();
    expect(() => reorderSavedTabs(ws, spaceId, groupId, [tabId, tabId])).toThrow('exactly once');
  });

  it('reorderSavedTabs throws on unknown id', () => {
    const { ws, spaceId, groupId } = wsWithTab();
    expect(() => reorderSavedTabs(ws, spaceId, groupId, ['nope'])).toThrow('unknown tab');
  });
});

describe('moveSavedTab', () => {
  it('moves a tab across groups in the same space', () => {
    const ws = makeWorkspace();
    const spaceId = ws.spaceOrder[0];
    const w1 = createGroup(ws, spaceId, 'Source');
    const srcGroupId = w1.spaces[spaceId].groups[0].id;
    const w2 = createSavedTab(w1, spaceId, srcGroupId, 'Tab', 'https://ex.com');
    const tabId = w2.spaces[spaceId].groups[0].tabs[0].id;

    const w3 = createGroup(w2, spaceId, 'Dest');
    const dstGroupId = w3.spaces[spaceId].groups[1].id;

    const result = moveSavedTab(
      freezeWs(w3),
      { spaceId, groupId: srcGroupId },
      { spaceId, groupId: dstGroupId, index: 0 },
      tabId,
    );

    expect(result.spaces[spaceId].groups[0].tabs.length).toBe(0);
    expect(result.spaces[spaceId].groups[1].tabs.length).toBe(1);
    expect(result.spaces[spaceId].groups[1].tabs[0].title).toBe('Tab');
  });

  it('moves a tab across spaces', () => {
    const ws = makeWorkspace();
    const srcSpaceId = ws.spaceOrder[0];
    const dstSpaceId = ws.spaceOrder[1];

    let w = createGroup(ws, srcSpaceId, 'Source');
    const srcGroupId = w.spaces[srcSpaceId].groups[0].id;
    w = createSavedTab(w, srcSpaceId, srcGroupId, 'Tab', 'https://ex.com');
    const tabId = w.spaces[srcSpaceId].groups[0].tabs[0].id;

    w = createGroup(w, dstSpaceId, 'Dest');
    const dstGroupId = w.spaces[dstSpaceId].groups[0].id;

    const result = moveSavedTab(
      freezeWs(w),
      { spaceId: srcSpaceId, groupId: srcGroupId },
      { spaceId: dstSpaceId, groupId: dstGroupId, index: 0 },
      tabId,
    );

    expect(result.spaces[srcSpaceId].groups[0].tabs.length).toBe(0);
    expect(result.spaces[dstSpaceId].groups[0].tabs.length).toBe(1);
    expect(result.spaces[dstSpaceId].groups[0].tabs[0].title).toBe('Tab');
  });

  it('reorders within the same group', () => {
    const { ws, spaceId, groupId } = (() => {
      const ws = makeWorkspace();
      const spaceId = ws.spaceOrder[0];
      let w = createGroup(ws, spaceId, 'G');
      const gId = w.spaces[spaceId].groups[0].id;
      w = createSavedTab(w, spaceId, gId, 'Tab1', 'https://1.com');
      w = createSavedTab(w, spaceId, gId, 'Tab2', 'https://2.com');
      return { ws: w, spaceId, groupId: gId };
    })();

    const result = moveSavedTab(
      freezeWs(ws),
      { spaceId, groupId },
      { spaceId, groupId, index: 1 },
      ws.spaces[spaceId].groups[0].tabs[0].id,
    );

    const tabs = result.spaces[spaceId].groups[0].tabs;
    expect(tabs.length).toBe(2);
    expect(tabs[0].title).toBe('Tab2');
    expect(tabs[1].title).toBe('Tab1');
  });

  it('clamps negative destination index to the front', () => {
    const { ws, spaceId, groupId } = (() => {
      const ws = makeWorkspace();
      const spaceId = ws.spaceOrder[0];
      let w = createGroup(ws, spaceId, 'G');
      const gId = w.spaces[spaceId].groups[0].id;
      w = createSavedTab(w, spaceId, gId, 'Tab1', 'https://1.com');
      w = createSavedTab(w, spaceId, gId, 'Tab2', 'https://2.com');
      return { ws: w, spaceId, groupId: gId };
    })();

    const result = moveSavedTab(
      freezeWs(ws),
      { spaceId, groupId },
      { spaceId, groupId, index: -5 },
      ws.spaces[spaceId].groups[0].tabs[1].id,
    );

    const tabs = result.spaces[spaceId].groups[0].tabs;
    expect(tabs[0].title).toBe('Tab2');
    expect(tabs[1].title).toBe('Tab1');
  });
});

describe('saveBrowserTab', () => {
  it('saves a browser tab at the end by default', () => {
    const ws = makeWorkspace();
    const spaceId = ws.spaceOrder[0];
    const withGroup = createGroup(ws, spaceId, 'G');
    const groupId = withGroup.spaces[spaceId].groups[0].id;

    const result = saveBrowserTab(freezeWs(withGroup), spaceId, groupId, {
      title: 'BTab', url: 'https://b.com', favIconUrl: 'https://b.com/f.ico',
    });

    expect(result.spaces[spaceId].groups[0].tabs.length).toBe(1);
    expect(result.spaces[spaceId].groups[0].tabs[0].title).toBe('BTab');
    expect(result.spaces[spaceId].groups[0].tabs[0].favIconUrl).toBe('https://b.com/f.ico');
  });

  it('saves at a specific index', () => {
    const ws = makeWorkspace();
    const spaceId = ws.spaceOrder[0];
    let w = createGroup(ws, spaceId, 'G');
    const groupId = w.spaces[spaceId].groups[0].id;
    w = createSavedTab(w, spaceId, groupId, 'First', 'https://1.com');

    const result = saveBrowserTab(freezeWs(w), spaceId, groupId, {
      title: 'Inserted', url: 'https://i.com',
    }, 0);

    expect(result.spaces[spaceId].groups[0].tabs[0].title).toBe('Inserted');
    expect(result.spaces[spaceId].groups[0].tabs[1].title).toBe('First');
  });

  it('clamps a negative index to the front', () => {
    const ws = makeWorkspace();
    const spaceId = ws.spaceOrder[0];
    let w = createGroup(ws, spaceId, 'G');
    const groupId = w.spaces[spaceId].groups[0].id;
    w = createSavedTab(w, spaceId, groupId, 'First', 'https://1.com');

    const result = saveBrowserTab(freezeWs(w), spaceId, groupId, {
      title: 'Inserted', url: 'https://i.com',
    }, -1);

    expect(result.spaces[spaceId].groups[0].tabs[0].title).toBe('Inserted');
    expect(result.spaces[spaceId].groups[0].tabs[1].title).toBe('First');
  });
});

describe('stashCurrentTabs', () => {
  it('creates a new group with the stashed tabs', () => {
    const ws = makeWorkspace();
    const spaceId = ws.spaceOrder[0];
    const tabs = [
      { title: 'A', url: 'https://a.com', favIconUrl: 'https://a.com/f.ico' },
      { title: 'B', url: 'https://b.com' },
    ];

    const result = stashCurrentTabs(freezeWs(ws), spaceId, '2024-01-01 12:00', tabs);
    const groups = result.spaces[spaceId].groups;
    expect(groups.length).toBe(1);
    expect(groups[0].name).toBe('2024-01-01 12:00');
    expect(groups[0].tabs.length).toBe(2);
    expect(groups[0].tabs[0].title).toBe('A');
    expect(groups[0].tabs[0].kind).toBe('record');
  });
});
