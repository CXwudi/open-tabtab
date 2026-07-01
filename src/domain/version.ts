/**
 * Returns the next monotonic workspace version.
 */
export function nextVersion(current?: number): number {
  return Math.max(Date.now(), (current ?? 0) + 1);
}
