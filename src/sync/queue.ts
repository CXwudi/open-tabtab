/** Serializes push jobs and coalesces bursts into one trailing run. */
export class SerialPushQueue {
  private running = false;
  private dirty = false;

  constructor(private readonly run: () => Promise<void>) {}

  /** Fire-and-forget enqueue. If a run is active, request one trailing run. */
  enqueue(): void {
    if (this.running) {
      this.dirty = true;
      return;
    }

    void this.drain();
  }

  private async drain(): Promise<void> {
    this.running = true;

    do {
      this.dirty = false;
      await this.run().catch(() => undefined);
    } while (this.dirty);

    this.running = false;
  }
}
