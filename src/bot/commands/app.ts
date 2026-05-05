import { CommandContext, Context } from 'grammy';
import { config } from '../../config';

export async function handleApp(ctx: CommandContext<Context>): Promise<void> {
  const baseUrl = process.env.BASE_URL || `http://localhost:${config.app.port || 3000}`;
  const tmaUrl = `${baseUrl}/tma`;

  try {
    // Telegram Mini App REQUIRES HTTPS. If it's HTTP, it will fail to send the button.
    const isHttps = tmaUrl.startsWith('https://');

    if (!isHttps && !tmaUrl.includes('localhost')) {
      await ctx.reply(`📱 <b>Mini App Portfolio</b>\n\nWah, sepertinya BASE_URL kamu belum pakai HTTPS. Telegram mewajibkan HTTPS untuk fitur Mini App.\n\nKamu tetap bisa buka lewat link browser ini:\n${tmaUrl}`, { parse_mode: 'HTML' });
      return;
    }

    const keyboard = {
      inline_keyboard: [
        [{ text: '📱 Buka Mini App', web_app: { url: tmaUrl } }]
      ]
    };

    await ctx.reply('Buka Mini App untuk melihat portofolio dan market secara interaktif:', {
      reply_markup: keyboard
    });
  } catch (err) {
    log.error('handleApp failed', { error: (err as Error).message, tmaUrl });
    await ctx.reply('❌ Gagal membuka Mini App. Pastikan BASE_URL di .env sudah benar dan menggunakan HTTPS.');
  }
}
