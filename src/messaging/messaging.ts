import { defineExtensionMessaging } from '@webext-core/messaging';
import type { Command, CommandResult } from './protocol';

export const messaging = defineExtensionMessaging<{
  dispatchCommand(cmd: Command): CommandResult;
}>();
