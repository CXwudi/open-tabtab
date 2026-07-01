import { messaging } from '../src/messaging/messaging';
import { handleCommand } from '../src/background/handler';
import { SyncEngine } from '../src/background/sync-engine';
import { StorageRepository } from '../src/storage/repository';
import { GistClient } from '../src/sync/gist-client';

export default defineBackground(() => {
  const repository = new StorageRepository();
  const syncEngine = new SyncEngine({
    repository,
    gistClient: new GistClient(),
  });

  messaging.onMessage('dispatchCommand', ({ data }) => handleCommand(data, {
    repository,
    syncEngine,
  }));
});
