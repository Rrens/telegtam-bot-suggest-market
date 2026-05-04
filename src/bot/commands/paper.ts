import { CommandContext, Context } from 'grammy';
import { db } from '../../db';
import { PriceService } from '../../services/PriceService';
import { log } from '../../utils/logger';

export async function handlePaperStatus(ctx: CommandContext<Context>): Promise<void> {
  const userId = ctx.from!.id;

  try {
    const user = await db('users').where({ id: userId }).first();
    if (!user) {
      await ctx.reply('Silakan /start terlebih dahulu.');
      return;
    }

    const balance = parseFloat(user.paper_balance);
    const positions = await db('paper_positions').where({ user_id: userId });

    let totalValue = balance;
    let posText = '';

    if (positions.length === 0) {
      posText = '<i>Tidak ada posisi aktif.</i>';
    } else {
      for (const pos of positions) {
        try {
          const { price: currentPrice } = await PriceService.getPrice(pos.symbol);
          const value = pos.amount * currentPrice;
          const cost = pos.amount * pos.avg_price;
          const pnl = value - cost;
          const pnlPct = (pnl / cost) * 100;
          
          totalValue += value;
          const icon = pnl >= 0 ? '🟢' : '🔴';
          
          posText += `\n${icon} <b>${pos.symbol}</b>\n`;
          posText += `  Amt: ${parseFloat(pos.amount).toFixed(4)} | Avg: $${parseFloat(pos.avg_price).toFixed(2)}\n`;
          posText += `  Cur: $${currentPrice.toFixed(2)} | PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${pnlPct.toFixed(2)}%)`;
        } catch (e) {
          posText += `\n⚠️ <b>${pos.symbol}</b>: Gagal mengambil harga saat ini.`;
        }
      }
    }

    const totalPnl = totalValue - 10000;
    const totalPnlPct = (totalPnl / 10000) * 100;

    const msg = `
🎮 <b>PAPER TRADING PORTFOLIO</b> 🎮

💵 <b>Cash Balance:</b> $${balance.toFixed(2)}
📊 <b>Total Value:</b> $${totalValue.toFixed(2)}
📉 <b>Total PnL:</b> ${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)} (${totalPnlPct.toFixed(2)}%)

<b>Positions:</b>
${posText}

<i>Gunakan /paperbuy [simbol] [jumlah_usd] dan /papersell [simbol] [jumlah_aset]</i>
    `.trim();

    await ctx.reply(msg, { parse_mode: 'HTML' });
  } catch (err) {
    log.error('Paper status failed', { error: (err as Error).message });
    await ctx.reply('Terjadi kesalahan saat memuat portfolio paper trading.');
  }
}

export async function handlePaperBuy(ctx: CommandContext<Context>): Promise<void> {
  const userId = ctx.from!.id;
  const args = ctx.match?.split(' ') || [];

  if (args.length < 2) {
    await ctx.reply('Format: /paperbuy <simbol> <jumlah_usd>\nContoh: /paperbuy BTCUSDT 100');
    return;
  }

  const symbol = args[0].toUpperCase();
  const spendUsd = parseFloat(args[1]);

  if (isNaN(spendUsd) || spendUsd <= 0) {
    await ctx.reply('Jumlah USD tidak valid.');
    return;
  }

  try {
    const user = await db('users').where({ id: userId }).first();
    if (!user) return;

    if (parseFloat(user.paper_balance) < spendUsd) {
      await ctx.reply(`❌ Saldo tidak cukup. Cash Anda: $${parseFloat(user.paper_balance).toFixed(2)}`);
      return;
    }

    const { price: currentPrice } = await PriceService.getPrice(symbol);
    const amountToBuy = spendUsd / currentPrice;

    await db.transaction(async (trx) => {
      // Deduct balance
      await trx('users').where({ id: userId }).decrement('paper_balance', spendUsd);

      // Record trade
      await trx('paper_trades').insert({
        user_id: userId,
        symbol,
        type: 'BUY',
        amount: amountToBuy,
        price: currentPrice,
        total_value: spendUsd
      });

      // Update position
      const pos = await trx('paper_positions').where({ user_id: userId, symbol }).first();
      if (pos) {
        const totalAmount = parseFloat(pos.amount) + amountToBuy;
        const totalCost = (parseFloat(pos.amount) * parseFloat(pos.avg_price)) + spendUsd;
        const newAvg = totalCost / totalAmount;
        await trx('paper_positions').where({ id: pos.id }).update({
          amount: totalAmount,
          avg_price: newAvg,
          updated_at: trx.fn.now()
        });
      } else {
        await trx('paper_positions').insert({
          user_id: userId,
          symbol,
          amount: amountToBuy,
          avg_price: currentPrice
        });
      }
    });

    await ctx.reply(`✅ <b>BERHASIL DIBELI (PAPER)</b>\n\nSimbol: ${symbol}\nHarga: $${currentPrice.toFixed(4)}\nJumlah: ${amountToBuy.toFixed(6)}\nTotal: $${spendUsd.toFixed(2)}`, { parse_mode: 'HTML' });

  } catch (err) {
    log.error('Paper buy failed', { error: (err as Error).message });
    await ctx.reply('❌ Gagal melakukan pembelian. Pastikan simbol benar.');
  }
}

export async function handlePaperSell(ctx: CommandContext<Context>): Promise<void> {
  const userId = ctx.from!.id;
  const args = ctx.match?.split(' ') || [];

  if (args.length < 2) {
    await ctx.reply('Format: /papersell <simbol> <jumlah_aset>\nContoh: /papersell BTCUSDT 0.5\nAtau: /papersell BTCUSDT ALL');
    return;
  }

  const symbol = args[0].toUpperCase();
  const amtArg = args[1].toUpperCase();

  try {
    const pos = await db('paper_positions').where({ user_id: userId, symbol }).first();
    if (!pos || parseFloat(pos.amount) <= 0) {
      await ctx.reply('❌ Anda tidak memiliki posisi ini.');
      return;
    }

    const currentAmount = parseFloat(pos.amount);
    let amountToSell = amtArg === 'ALL' ? currentAmount : parseFloat(amtArg);

    if (isNaN(amountToSell) || amountToSell <= 0 || amountToSell > currentAmount) {
      await ctx.reply(`❌ Jumlah tidak valid. Maksimal yang bisa dijual: ${currentAmount}`);
      return;
    }

    const { price: currentPrice } = await PriceService.getPrice(symbol);
    const valueUsd = amountToSell * currentPrice;

    const pnl = valueUsd - (amountToSell * parseFloat(pos.avg_price));

    await db.transaction(async (trx) => {
      // Add balance
      await trx('users').where({ id: userId }).increment('paper_balance', valueUsd);

      // Record trade
      await trx('paper_trades').insert({
        user_id: userId,
        symbol,
        type: 'SELL',
        amount: amountToSell,
        price: currentPrice,
        total_value: valueUsd
      });

      // Update position
      const remaining = currentAmount - amountToSell;
      if (remaining <= 0.00000001) {
        await trx('paper_positions').where({ id: pos.id }).del();
      } else {
        await trx('paper_positions').where({ id: pos.id }).update({
          amount: remaining,
          updated_at: trx.fn.now()
        });
      }
    });

    await ctx.reply(`✅ <b>BERHASIL DIJUAL (PAPER)</b>\n\nSimbol: ${symbol}\nHarga: $${currentPrice.toFixed(4)}\nJumlah: ${amountToSell.toFixed(6)}\nTotal Cash didapat: $${valueUsd.toFixed(2)}\nRealized PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`, { parse_mode: 'HTML' });

  } catch (err) {
    log.error('Paper sell failed', { error: (err as Error).message });
    await ctx.reply('❌ Gagal melakukan penjualan.');
  }
}
