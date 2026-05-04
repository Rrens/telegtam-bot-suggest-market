import { CommandContext, Context } from 'grammy';
import { config } from '../../config';

export async function handleApp(ctx: CommandContext<Context>): Promise<void> {
  const baseUrl = process.env.BASE_URL || `http://localhost:${config.app.port || 3000}`;
  // We can pass the user's ID as a token or just let the TMA authenticate via Telegram Web App InitData
  // For now, we'll use a public version of the dashboard or a specific TMA endpoint
  const tmaUrl = `${baseUrl}/tma`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '📱 Buka Mini App', web_app: { url: tmaUrl } }]
    ]
  };

  await ctx.reply('Buka Mini App untuk melihat portofolio dan market secara interaktif:', {
    reply_markup: keyboard
  });
}
