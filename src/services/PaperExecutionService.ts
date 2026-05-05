import { db } from '../db';
import { PriceService } from './PriceService';
import { log } from '../utils/logger';
import { Bot } from 'grammy';
import { sendNotification } from '../utils/notifier';

export class PaperExecutionService {
  /**
   * Monitor all active paper positions and trigger TP/SL/Trailing Stop.
   */
  static async checkPositions(bot?: Bot): Promise<void> {
    try {
      const positions = await db('paper_positions').whereNotNull('tp_price')
        .orWhereNotNull('sl_price')
        .orWhereNotNull('trailing_stop_pct');

      if (positions.length === 0) return;

      for (const pos of positions) {
        try {
          const { price: currentPrice } = await PriceService.getPrice(pos.symbol);
          
          // 1. Take Profit Check
          if (pos.tp_price && currentPrice >= parseFloat(pos.tp_price)) {
            await this.executeClose(pos, currentPrice, 'TAKE_PROFIT', bot);
            continue;
          }

          // 2. Stop Loss Check
          if (pos.sl_price && currentPrice <= parseFloat(pos.sl_price)) {
            await this.executeClose(pos, currentPrice, 'STOP_LOSS', bot);
            continue;
          }

          // 3. Trailing Stop Check
          if (pos.trailing_stop_pct) {
            const highest = pos.highest_price ? parseFloat(pos.highest_price) : parseFloat(pos.avg_price);
            const tsPct = parseFloat(pos.trailing_stop_pct);
            
            // Update highest price if reached
            if (currentPrice > highest) {
              await db('paper_positions').where({ id: pos.id }).update({ highest_price: currentPrice });
            } else {
              // Check if price dropped below trailing stop threshold
              const stopPrice = highest * (1 - tsPct / 100);
              if (currentPrice <= stopPrice) {
                await this.executeClose(pos, currentPrice, 'TRAILING_STOP', bot);
                continue;
              }
            }
          }
        } catch (err) {
          log.warn(`PaperExecutionService: failed to check position ${pos.id}`, { symbol: pos.symbol, error: (err as Error).message });
        }
      }
    } catch (err) {
      log.error('PaperExecutionService: check failed', { error: (err as Error).message });
    }
  }

  private static async executeClose(pos: any, exitPrice: number, reason: string, bot?: Bot): Promise<void> {
    const amount = parseFloat(pos.amount);
    const valueUsd = amount * exitPrice;
    const pnl = valueUsd - (amount * parseFloat(pos.avg_price));

    log.info(`Paper Close Triggered: ${reason}`, { symbol: pos.symbol, exitPrice, pnl });

    await db.transaction(async (trx) => {
      // 1. Return balance
      await trx('users').where({ id: pos.user_id }).increment('paper_balance', valueUsd);

      // 2. Record trade
      await trx('paper_trades').insert({
        user_id: pos.user_id,
        symbol: pos.symbol,
        type: `SELL_${reason}`,
        amount: amount,
        price: exitPrice,
        total_value: valueUsd
      });

      // 3. Delete position
      await trx('paper_positions').where({ id: pos.id }).del();
    });

    if (bot) {
      try {
        const icon = pnl >= 0 ? '💰' : '📉';
        const msg = `${icon} <b>PAPER TRADE CLOSED: ${reason}</b>\n\n` +
                    `Symbol: <b>${pos.symbol}</b>\n` +
                    `Exit Price: $${exitPrice.toFixed(6)}\n` +
                    `PnL: <b>${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</b>`;
        
        // Send directly to user ID (DM) instead of using the channel-first notifier
        await bot.api.sendMessage(pos.user_id, msg, { parse_mode: 'HTML' });
      } catch (err) {
        log.warn('Failed to send private paper trade notification', { userId: pos.user_id, error: (err as Error).message });
      }
    }
  }
}
