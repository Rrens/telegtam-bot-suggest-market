import { CommandContext, Context } from 'grammy';
import { AlertService } from '../../services/AlertService';
import { formatPrice } from '../../utils/formatter';

// Usage: /listalerts
export async function handleListAlerts(ctx: CommandContext<Context>): Promise<void> {
  const userId = String(ctx.from!.id);
  const alerts = await AlertService.listAlerts(userId);

  if (alerts.length === 0) {
    await ctx.reply('You have no active price alerts.');
    return;
  }

  const lines: string[] = ['<b>🔔 Your Active Price Alerts:</b>', ''];

  alerts.forEach((alert) => {
    const condition = alert.condition === 'gte' ? '≥' : '≤';
    const currency = alert.symbol.endsWith('.JK') ? 'IDR' : 'USD';
    const type = alert.alert_type === 'pct_change' ? 'Change' : 'Target';
    const value = alert.alert_type === 'pct_change' ? `${alert.target_value}%` : formatPrice(alert.target_value, currency);

    lines.push(`• <b>[ID: ${alert.id}]</b> ${alert.symbol}`);
    lines.push(`  Type: ${type} | ${condition} ${value}`);
    lines.push('');
  });

  lines.push('Use <code>/delalert &lt;id&gt;</code> to remove an alert.');

  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
}
