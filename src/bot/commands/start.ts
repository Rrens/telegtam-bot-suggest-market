import { CommandContext, Context } from 'grammy';
import { db } from '../../db';
import { log } from '../../utils/logger';

export async function handleStart(ctx: CommandContext<Context>): Promise<void> {
  const user = ctx.from!;

  // Upsert user in DB
  try {
    await db('users')
      .insert({
        id: user.id.toString(),
        username: user.username ?? null,
        risk_profile: 'moderate',
        preferred_timeframe: 'swing',
      })
      .onConflict('id')
      .merge({ username: user.username ?? null });

    log.info('User registered/updated', { userId: user.id, username: user.username });
  } catch (err) {
    log.error('Failed to upsert user', { error: (err as Error).message });
  }

  await ctx.reply(
    `<b>Advanced Trading Assistant</b>\n\n` +
    `Welcome${user.first_name ? `, ${user.first_name}` : ''}. ` +
    `I provide data-driven trading signals for crypto, stocks, and forex.\n\n` +
    `📢 <b>Join Our Channel:</b>\n` +
    `Get automatic signals, price alerts, and high-impact news directly in our channel: <a href="https://t.me/+2-DeXds1bZg5YTI1">Join Here</a>\n\n` +
    `<b>Commands:</b>\n` +
    `/predict &lt;symbol&gt; — Full signal analysis\n` +
    `/news &lt;symbol&gt; — Latest news with sentiment\n` +
    `/add &lt;symbol&gt; &lt;amount&gt; &lt;avg_price&gt; — Track an asset\n` +
    `/list — View tracked assets\n` +
    `/delete &lt;symbol&gt; — Remove an asset\n` +
    `/portfolio — Portfolio PnL summary\n` +
    `/alert &lt;symbol&gt; &lt;gte|lte&gt; &lt;price&gt; — Set price alert\n` +
    `/alertnews &lt;symbol&gt; — News alert subscription\n` +
    `/history &lt;symbol&gt; — Past signal history\n` +
    `/profile — Set risk profile & timeframe\n\n` +
    `👨‍💻 <b>Developer:</b> Rendy Yusuf — <a href="https://www.linkedin.com/in/rendy-yusuf/">LinkedIn</a>\n\n` +
    `<i>⚠ Signals are probabilistic. Not financial advice.</i>`,
    { 
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📢 Join Official Channel', url: 'https://t.me/+2-DeXds1bZg5YTI1' }]
        ]
      }
    }
  );
}
