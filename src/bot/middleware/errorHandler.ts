// ─────────────────────────────────────────────────────────────────────────────
// Bot middleware: Global error handler.
// ─────────────────────────────────────────────────────────────────────────────

import { BotError, GrammyError, HttpError } from 'grammy';
import { log } from '../../utils/logger';

export function errorHandler(err: BotError): void {
  const ctx = err.ctx;
  const e = err.error;

  log.error('Bot error', {
    error: (e as Error).message,
    userId: ctx.from?.id,
    command: ctx.message?.text,
  });

  if (e instanceof GrammyError) {
    log.error('Grammy API error', { description: e.description });
  } else if (e instanceof HttpError) {
    log.error('HTTP error', { error: e.error });
  }
}
