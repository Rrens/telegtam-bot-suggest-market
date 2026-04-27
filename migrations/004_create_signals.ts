import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('signals', (t) => {
    t.increments('id').primary();
    t.string('symbol', 30).notNullable();
    t.string('timeframe', 10).defaultTo('1d');
    t.string('trend', 30).notNullable();
    t.decimal('confidence', 5, 2).notNullable();
    t.integer('signal_score').notNullable().defaultTo(0);
    t.enum('trade_bias', ['long', 'short', 'wait']).notNullable();
    t.decimal('rsi', 6, 2).nullable();
    t.decimal('macd_line', 20, 8).nullable();
    t.decimal('macd_signal', 20, 8).nullable();
    t.decimal('ma50', 20, 8).nullable();
    t.decimal('ma200', 20, 8).nullable();
    t.boolean('volume_spike').defaultTo(false);
    t.string('fundamental_rating', 20).nullable();
    t.string('news_sentiment', 20).nullable();
    t.jsonb('invalidation_conditions').defaultTo('[]');
    t.text('reasoning').nullable();
    t.decimal('stop_loss', 20, 8).nullable();
    t.decimal('take_profit', 20, 8).nullable();
    t.decimal('entry_price', 20, 8).nullable();
    t.decimal('risk_reward_ratio', 6, 2).nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['symbol', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('signals');
}
