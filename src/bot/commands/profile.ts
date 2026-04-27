import { CommandContext, Context, InlineKeyboard } from 'grammy';
import { db } from '../../db';
import { RiskProfile, PreferredTimeframe } from '../../types';

// Usage: /profile → shows current profile + inline keyboard to change it
export async function handleProfile(ctx: CommandContext<Context>): Promise<void> {
  const userId = String(ctx.from!.id);

  const user = await db('users').where({ id: userId }).first();
  const riskProfile: RiskProfile = user?.risk_profile ?? 'moderate';
  const timeframe: PreferredTimeframe = user?.preferred_timeframe ?? 'swing';

  const args = ctx.match?.trim().split(/\s+/) ?? [];

  // /profile risk <conservative|moderate|aggressive>
  if (args[0] === 'risk' && args[1]) {
    const newRisk = args[1].toLowerCase() as RiskProfile;
    if (!['conservative', 'moderate', 'aggressive'].includes(newRisk)) {
      await ctx.reply('Invalid risk profile. Choose: conservative, moderate, or aggressive.');
      return;
    }
    await db('users').where({ id: userId }).update({ risk_profile: newRisk });
    await ctx.reply(`✅ Risk profile updated to <b>${newRisk}</b>.`, { parse_mode: 'HTML' });
    return;
  }

  // /profile timeframe <scalping|swing|long-term>
  if (args[0] === 'timeframe' && args[1]) {
    const newTf = args[1].toLowerCase() as PreferredTimeframe;
    if (!['scalping', 'swing', 'long-term'].includes(newTf)) {
      await ctx.reply('Invalid timeframe. Choose: scalping, swing, or long-term.');
      return;
    }
    await db('users').where({ id: userId }).update({ preferred_timeframe: newTf });
    await ctx.reply(`✅ Preferred timeframe updated to <b>${newTf}</b>.`, { parse_mode: 'HTML' });
    return;
  }

  // Show profile
  await ctx.reply(
    `<b>Your Trading Profile</b>\n\n` +
    `Risk Profile: <b>${riskProfile}</b>\n` +
    `Preferred Timeframe: <b>${timeframe}</b>\n\n` +
    `<b>To update:</b>\n` +
    `/profile risk &lt;conservative|moderate|aggressive&gt;\n` +
    `/profile timeframe &lt;scalping|swing|long-term&gt;\n\n` +
    `Your risk profile affects:\n` +
    `• Stop loss / take profit distance\n` +
    `• Position size recommendations\n` +
    `• Signal aggressiveness`,
    { parse_mode: 'HTML' }
  );
}
