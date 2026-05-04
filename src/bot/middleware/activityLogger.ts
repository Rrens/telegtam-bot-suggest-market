import { Context, NextFunction } from 'grammy';
import { db } from '../../db';
import { log } from '../../utils/logger';

export function activityLogger() {
  return async (ctx: Context, next: NextFunction) => {
    const start = Date.now();
    
    // Process the request first
    await next();
    
    const duration = Date.now() - start;
    
    // Async log to DB so we don't block the user
    (async () => {
      try {
        const userId = ctx.from?.id.toString();
        const username = ctx.from?.username;
        const text = ctx.message?.text || ctx.callbackQuery?.data || 'non-text message';
        const type = ctx.message?.text?.startsWith('/') ? 'command' : (ctx.callbackQuery ? 'callback' : 'message');
        
        if (!userId) return;

        await db('chat_log').insert({
          user_id: userId,
          username: username || null,
          type: type,
          content: text,
          metadata: JSON.stringify({
            duration_ms: duration,
            chat_id: ctx.chat?.id,
            update_id: ctx.update.update_id,
          })
        });
      } catch (err) {
        log.warn('Failed to log activity to DB', { error: (err as Error).message });
      }
    })();
  };
}
