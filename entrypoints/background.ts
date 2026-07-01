import { messaging } from '../src/messaging/messaging';
import type { Snapshot } from '../src/messaging/protocol';

const initialSnapshot: Snapshot = {
  workspace: {
    version: 0,
    spaceOrder: [],
    spaces: {},
  },
  syncState: {
    status: 'idle',
  },
  settings: {
    enabled: false,
    filename: 'open-tabtab-backup.json',
    hasToken: false,
  },
};

export default defineBackground(() => {
  messaging.onMessage('dispatchCommand', async () => ({
    ok: true,
    snapshot: initialSnapshot,
  }));
});
