import { Bot } from 'grammy';
import { config } from '../config';
import { log } from './logger';

/**
 * Sends a notification with channel-first fallback logic.
 * 1. Tries to send to the configured channel if available.
 * 2. If channel send fails OR no channel is configured, sends to the specific user.
 */
export async function sendNotification(
  bot: Bot,
  userId: string,
  message: string,
  options: any = {}
): Promise<void> {
  const channelId = config.bot.channelId;
  let sentToChannel = false;

  // 1. Try Channel first if configured
  if (channelId) {
    try {
      const sentMsg = await bot.api.sendMessage(channelId, message, {
        parse_mode: 'HTML',
        ...options,
      });
      sentToChannel = true;
      log.debug('Notification sent to channel', { channelId });

      // Pin if requested
      if (options.pin) {
        await bot.api.pinChatMessage(channelId, sentMsg.message_id).catch(e => 
          log.warn('Failed to pin message in channel', { error: e.message })
        );
      }
    } catch (err) {
      log.warn('Failed to send notification to channel, falling back to user DM', {
        channelId,
        error: (err as Error).message,
      });
    }
  }

  // 2. Fallback to User DM if not sent to channel (or channel not configured)
  if (!sentToChannel) {
    try {
      await bot.api.sendMessage(userId, message, {
        parse_mode: 'HTML',
        ...options,
      });
      log.debug('Notification sent to user DM', { userId });
    } catch (err) {
      log.error('Failed to send notification even to user DM', {
        userId,
        error: (err as Error).message,
      });
    }
  }
}
