import { messaging } from '../src/messaging/messaging';
import { handleCommand, type SyncEngine } from '../src/background/handler';
import { StorageRepository } from '../src/storage/repository';

const syncEngine: SyncEngine = {
  enqueuePush: () => undefined,
  reconcile: () => undefined,
  setSettings: () => undefined,
  testConnection: () => undefined,
  createGist: () => undefined,
  pull: () => undefined,
  push: () => undefined,
  resolveConflict: () => undefined,
};

export default defineBackground(() => {
  const repository = new StorageRepository();

  messaging.onMessage('dispatchCommand', ({ data }) => handleCommand(data, {
    repository,
    syncEngine,
  }));
});
