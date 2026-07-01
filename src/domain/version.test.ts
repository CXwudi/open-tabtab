import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextVersion } from './version';

describe('nextVersion', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the current time when it is newer than the current version', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);

    expect(nextVersion(5)).toBe(Math.max(Date.now(), 6));
  });

  it('bumps a future current version by one', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);

    expect(nextVersion(11_000)).toBe(11_001);
  });
});
