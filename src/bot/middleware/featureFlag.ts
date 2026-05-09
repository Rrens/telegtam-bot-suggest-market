import { Context } from 'grammy';
import { featureFlagService } from '../../services/FeatureFlagService';

/**
 * Checks if a feature is enabled and replies with a message if it's disabled.
 */
export async function isFeatureEnabled(ctx: Context, feature: string): Promise<boolean> {
  const isEnabled = await featureFlagService.isEnabled(feature);
  
  if (!isEnabled) {
    const message = `⚠️ <b>Fitur Dinonaktifkan</b>\n\nMaaf, fitur <code>${feature}</code> saat ini sedang dinonaktifkan oleh administrator.`;
    
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: 'Fitur dinonaktifkan', show_alert: true });
      await ctx.editMessageText(message, { parse_mode: 'HTML' });
    } else {
      await ctx.reply(message, { parse_mode: 'HTML' });
    }
    return false;
  }
  
  return true;
}
