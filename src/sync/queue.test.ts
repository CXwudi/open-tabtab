import { describe, expect, it, vi } from 'vitest';
import { SerialPushQueue } from './queue';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('SerialPushQueue', () => {
  it('coalesces enqueues during an active push into one trailing run', async () => {
    const firstRun = deferred();
    let latestVersion = 1;
    let calls = 0;
    const seenVersions: number[] = [];
    const queue = new SerialPushQueue(async () => {
      calls += 1;
      seenVersions.push(latestVersion);
      if (calls === 1) {
        await firstRun.promise;
      }
    });

    queue.enqueue();
    await vi.waitFor(() => expect(calls).toBe(1));

    latestVersion = 5;
    queue.enqueue();
    queue.enqueue();
    queue.enqueue();
    queue.enqueue();
    queue.enqueue();

    expect(calls).toBe(1);

    firstRun.resolve();

    await vi.waitFor(() => expect(calls).toBe(2));
    expect(seenVersions).toEqual([1, 5]);
  });
});
