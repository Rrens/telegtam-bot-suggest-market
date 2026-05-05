// ─────────────────────────────────────────────────────────────────────────────
// /check command: Analyzes a Solana token contract address for rug pull risks.
// Usage: /check <contract_address>
// ─────────────────────────────────────────────────────────────────────────────

import { CommandContext, Context } from 'grammy';
import { RugCheckService } from '../../services/RugCheckService';
import { log } from '../../utils/logger';

// Solana address validation: base58, 32-44 chars
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function handleCheck(ctx: CommandContext<Context>): Promise<void> {
  const input = ctx.match?.trim() ?? '';

  if (!input) {
    await ctx.reply([
      `🛡️ <b>RugCheck — Cara Pakai:</b>`,
      ``,
      `<code>/check &lt;contract_address&gt;</code>`,
      ``,
      `<i>Contoh:</i>`,
      `<code>/check So11111111111111111111111111111111111111112</code>`,
      ``,
      `Bot akan mengecek:`,
      `• Apakah LP sudah di-burn atau di-lock`,
      `• Apakah Mint Authority sudah dicabut`,
      `• % kepemilikan top holder`,
      `• Skor keamanan keseluruhan dari RugCheck.xyz`,
    ].join('\n'), { parse_mode: 'HTML' });
    return;
  }

  if (!SOLANA_ADDRESS_RE.test(input)) {
    await ctx.reply(
      `❌ <b>Format address tidak valid.</b>\n\nPastikan lo paste alamat kontrak Solana yang benar (bukan nama koin).`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  const loadingMsg = await ctx.reply(
    `🛡️ <b>Analyzing contract...</b>\n\n<code>${input.slice(0, 8)}...${input.slice(-4)}</code>\n\nFetching report from RugCheck.xyz...`,
    { parse_mode: 'HTML' }
  );

  try {
    const report = await RugCheckService.getReport(input);

    if (!report) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        [
          `❌ <b>Tidak bisa mengambil data untuk address ini.</b>`,
          ``,
          `Kemungkinan penyebab:`,
          `• Token ini belum ada di RugCheck.xyz`,
          `• Address bukan token SPL Solana`,
          `• Token terlalu baru (belum terindeks)`,
          ``,
          `Coba cek manual: <a href="https://rugcheck.xyz/tokens/${input}">rugcheck.xyz</a>`,
        ].join('\n'),
        { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
      );
      return;
    }

    const message = RugCheckService.formatReport(report);
    await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, message, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });

    log.info('RugCheck command executed', {
      userId: ctx.from?.id,
      mint: input,
      riskLevel: report.riskLevel,
      score: report.score,
    });
  } catch (err) {
    log.error('Check command failed', { error: (err as Error).message });
    await ctx.api.editMessageText(
      ctx.chat!.id,
      loadingMsg.message_id,
      `❌ <b>Gagal fetch data.</b> Coba lagi nanti.`,
      { parse_mode: 'HTML' }
    ).catch(() => {});
  }
}
