// ─────────────────────────────────────────────────────────────────────────────
// /check command: RugCheck security analysis with copyable CA and action buttons.
// ─────────────────────────────────────────────────────────────────────────────

import { CommandContext, Context, InlineKeyboard } from 'grammy';
import axios from 'axios';

export async function handleCheck(ctx: CommandContext<Context> | Context): Promise<void> {
  let ca = '';
  
  if (ctx.callbackQuery?.data?.startsWith('exec_check_')) {
    ca = ctx.callbackQuery.data.replace('exec_check_', '');
    await ctx.answerCallbackQuery('🔍 Re-scanning CA...');
  } else {
    // Normal command: /check <CA>
    const text = (ctx as any).message?.text || '';
    ca = text.split(' ')[1];
  }

  if (!ca) {
    return (ctx as any).reply('🛡️ Silakan masukkan alamat kontrak (CA) Solana.\nFormat: <code>/check [CA]</code>', { parse_mode: 'HTML' });
  }

  const loadingMsg = await ctx.reply(`🔍 Analyzing security for <code>${ca}</code>...`, { parse_mode: 'HTML' });

  try {
    const response = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${ca}/report`);
    const report = response.data;

    const riskLevel = report.score < 100 ? '✅ EXCELLENT' : report.score < 500 ? '⚠️ WARNING' : '🚨 DANGER';
    
    const message = [
      `🛡️ <b>RugCheck Security Report</b>`,
      ``,
      `CA: <code>${ca}</code>`,
      `Score: <b>${report.score}</b> (${riskLevel})`,
      ``,
      `<b>Risk Breakdown:</b>`,
      `• Mint Authority: ${!report.mintAuthority ? '🟢 Revoked' : '🔴 ACTIVE'}`,
      `• Freeze Authority: ${!report.freezeAuthority ? '🟢 Revoked' : '🔴 ACTIVE'}`,
      `• LP Burned: ${report.markets?.[0]?.lp?.lpBurned ? '🟢 Yes' : '🔴 No'}`,
      `• Top Holders: ${report.topHolders?.length || 0} analyzed`,
      ``,
      `<i>💡 Tap CA di atas buat copy alamatnya.</i>`,
    ].join('\n');

    const keyboard = new InlineKeyboard()
      .url('🌐 Full Report on RugCheck', `https://rugcheck.xyz/tokens/${ca}`).row()
      .text('🔄 Scan Again', `exec_check_${ca}`).row()
      .text('⬅️ Back to Menu', 'back_to_menu');

    await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, message, { parse_mode: 'HTML', reply_markup: keyboard });
  } catch (err) {
    await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, '❌ Gagal melakukan scan. Pastikan CA Solana valid.');
  }
}
