import { describe, expect, it } from 'vitest';
import {
  bootstrapWorkspace,
  fromTabTab,
  parseBackup,
  serializeBackup,
} from './backup';
import type { Workspace } from './types';
import { sampleTabTabBackup } from '../testing/sample-backup';

describe('bootstrapWorkspace', () => {
  it('creates a workspace with one Default space', () => {
    const ws = bootstrapWorkspace();
    expect(ws.spaces).toBeDefined();
    expect(ws.spaceOrder.length).toBe(1);
    const defaultSpace = ws.spaces[ws.spaceOrder[0]];
    expect(defaultSpace.name).toBe('Default');
    expect(defaultSpace.groups).toEqual([]);
    expect(defaultSpace.pins).toEqual({});
    expect(ws.version).toBeGreaterThan(0);
  });
});

describe('fromTabTab', () => {
  it('converts the sample backup to internal shape', () => {
    const ws = fromTabTab(sampleTabTabBackup);

    // 2 spaces in order
    expect(ws.spaceOrder.length).toBe(2);
    const secondary = ws.spaces[ws.spaceOrder[0]];
    expect(secondary.name).toBe('二次元');
    const dev = ws.spaces[ws.spaceOrder[1]];
    expect(dev.name).toBe('Dev');

    // 7 groups in 二次元
    expect(secondary.groups.length).toBe(7);
    // 2 groups in Dev
    expect(dev.groups.length).toBe(2);

    // pins preserved
    expect(secondary.pins).toEqual({});
    expect(dev.pins).toEqual({});

    // version preserved
    expect(ws.version).toBe(sampleTabTabBackup.version);
  });

  it('handles missing pins field', () => {
    const ws = fromTabTab({
      version: 1,
      space_list: [{ id: 's1', name: 'S1' }],
      spaces: { s1: { id: 's1', name: 'S1', groups: [] } },
    });
    expect(ws.spaces.s1.pins).toEqual({});
  });
});

describe('parseBackup', () => {
  it('accepts a TabTab-shaped backup (space_list)', () => {
    const result = parseBackup(sampleTabTabBackup);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.workspace.spaceOrder.length).toBe(2);
    expect(result.workspace.spaces[result.workspace.spaceOrder[0]].name).toBe('二次元');
    // pins preserved
    expect(result.workspace.spaces[result.workspace.spaceOrder[0]].pins).toEqual({});
  });

  it('accepts an internal-shaped backup (spaceOrder)', () => {
    const ws = fromTabTab(sampleTabTabBackup);
    const serialized = serializeBackup(ws);
    const reparsed = parseBackup(JSON.parse(serialized));
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) throw new Error('expected ok');
    expect(reparsed.workspace.spaceOrder).toEqual(ws.spaceOrder);
    expect(Object.keys(reparsed.workspace.spaces)).toEqual(Object.keys(ws.spaces));
  });

  it('filters dangling internal spaceOrder ids and appends unordered spaces', () => {
    const result = parseBackup({
      version: 1,
      spaceOrder: ['ghost', 's1'],
      spaces: {
        s1: { id: 's1', name: 'One', groups: [] },
        s2: { id: 's2', name: 'Two', groups: [] },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.workspace.spaceOrder).toEqual(['s1', 's2']);
  });

  it('normalizes missing group tabs and tab kind on import', () => {
    const result = parseBackup({
      version: 1,
      spaceOrder: ['s1'],
      spaces: {
        s1: {
          id: 's1',
          name: 'One',
          groups: [
            { id: 'g1', name: 'No Tabs' },
            { id: 'g2', name: 'Missing Kind', tabs: [{ id: 't1', title: 'T', url: 'https://example.com' }] },
          ],
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.workspace.spaces.s1.groups[0].tabs).toEqual([]);
    expect(result.workspace.spaces.s1.groups[1].tabs[0]).toEqual({
      id: 't1',
      title: 'T',
      url: 'https://example.com',
      favIconUrl: undefined,
      kind: 'record',
    });
  });

  it('round-trips: parseBackup(serializeBackup(ws)) deep-equals ws', () => {
    const ws = fromTabTab(sampleTabTabBackup);
    const result = parseBackup(JSON.parse(serializeBackup(ws)));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.workspace).toEqual(ws);
  });

  it('rejects non-object input', () => {
    expect(parseBackup(null)).toEqual({ ok: false, error: expect.stringContaining('object') });
    expect(parseBackup(42)).toEqual({ ok: false, error: expect.stringContaining('object') });
    expect(parseBackup('string')).toEqual({ ok: false, error: expect.stringContaining('object') });
  });

  it('rejects missing version', () => {
    expect(parseBackup({ spaces: {}, spaceOrder: [] })).toEqual({
      ok: false, error: expect.stringContaining('version'),
    });
  });

  it('rejects missing spaces', () => {
    expect(parseBackup({ version: 1, spaceOrder: [] })).toEqual({
      ok: false, error: expect.stringContaining('spaces'),
    });
  });

  it('rejects missing space_list and spaceOrder', () => {
    expect(parseBackup({ version: 1, spaces: {} })).toEqual({
      ok: false, error: expect.stringContaining('space_list'),
    });
  });

  it('rejects bad space_list entries', () => {
    expect(parseBackup({
      version: 1,
      space_list: [{ id: 's1' }], // missing name
      spaces: {},
    })).toEqual({ ok: false, error: expect.stringContaining('space_list') });
  });

  it('rejects bad group entries', () => {
    expect(parseBackup({
      version: 1,
      space_list: [{ id: 's1', name: 'S1' }],
      spaces: { s1: { id: 's1', name: 'S1', groups: [{ id: 'g1' }] } }, // missing name
    })).toEqual({ ok: false, error: expect.stringContaining('group') });
  });

  it('rejects bad tab entries', () => {
    expect(parseBackup({
      version: 1,
      space_list: [{ id: 's1', name: 'S1' }],
      spaces: {
        s1: {
          id: 's1', name: 'S1',
          groups: [{ id: 'g1', name: 'G1', tabs: [{ title: 'T' }] }], // missing url
        },
      },
    })).toEqual({ ok: false, error: expect.stringContaining('tab') });
  });

  it('rejects tabs missing ids', () => {
    expect(parseBackup({
      version: 1,
      space_list: [{ id: 's1', name: 'S1' }],
      spaces: {
        s1: {
          id: 's1', name: 'S1',
          groups: [{ id: 'g1', name: 'G1', tabs: [{ title: 'T', url: 'https://example.com' }] }],
        },
      },
    })).toEqual({ ok: false, error: expect.stringContaining('tab') });
  });

  it('preserves file:// URLs from the sample', () => {
    const result = parseBackup(sampleTabTabBackup);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const tabs = result.workspace.spaces[result.workspace.spaceOrder[0]].groups
      .find((g) => g.name === 'On Learning with Piapro Studio')?.tabs ?? [];
    const fileTab = tabs.find((t) => t.url.startsWith('file://'));
    expect(fileTab).toBeDefined();
    expect(fileTab!.url).toBe('file:///D:/Users/11134/Downloads/V4XSeries_InstallationGuide_EN.pdf');
  });
});

describe('serializeBackup', () => {
  it('produces valid JSON matching the internal shape', () => {
    const ws = fromTabTab(sampleTabTabBackup);
    const json = serializeBackup(ws);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(ws.version);
    expect(Array.isArray(parsed.spaceOrder)).toBe(true);
    expect(typeof parsed.spaces).toBe('object');
    // should NOT have space_list (TabTab export shape)
    expect(parsed.space_list).toBeUndefined();
  });
});
