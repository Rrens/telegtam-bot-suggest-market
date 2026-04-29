import { CommandContext, Context } from 'grammy';
import { AlertService } from '../../services/AlertService';
import { log } from '../../utils/logger';

// Usage: /delalert <id>
export async function handleDelAlert(ctx: CommandContext<Context>): Promise<void> {
  const userId = String(ctx.from!.id);
  const alertIdRaw = ctx.match?.trim();

  if (!alertIdRaw) {
    await ctx.reply('Usage: <code>/delalert &lt;alert_id&gt;</code>\nExample: /delalert 2', { parse_mode: 'HTML' });
    return;
  }

  const alertId = parseInt(alertIdRaw);
  if (isNaN(alertId)) {
    await ctx.reply('Please provide a valid Alert ID (number).');
    return;
  }

  const success = await AlertService.deactivateAlert(alertId, userId);

  if (success) {
    await ctx.reply(`✅ Alert ID <b>${alertId}</b> has been deleted/deactivated.`, { parse_mode: 'HTML' });
    log.info('Alert deleted', { userId, alertId });
  } else {
    await ctx.reply(`❌ Could not find an active alert with ID <b>${alertId}</b> for your account.`, { parse_mode: 'HTML' });
  }
}
