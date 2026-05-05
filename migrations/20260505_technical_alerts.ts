// Migration: Extend alerts table to support technical indicator alert types
// (RSI thresholds and MA cross events)

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Add new alert_types by recreating the enum constraint
  // PostgreSQL does not allow adding values to enum mid-transaction in older versions,
  // so we use a text column approach and validate in the application layer.
  await knex.schema.alterTable('alerts', (t) => {
    // Add extra metadata column for technical alerts (stores indicator name, timeframe, etc.)
    t.string('indicator', 20).nullable();      // 'rsi' | 'ma_cross' | 'macd'
    t.string('timeframe', 10).nullable();       // '1h' | '4h' | '1d'
    t.text('description').nullable();           // Human-readable description of the alert
  });

  // 2. Create technical_alert_log table to track which alerts have already fired
  // (prevents re-alerting the same RSI condition every 15 minutes)
  await knex.schema.createTable('technical_alert_log', (t) => {
    t.increments('id').primary();
    t.integer('alert_id').notNullable().references('id').inTable('alerts').onDelete('CASCADE');
    t.timestamp('fired_at').defaultTo(knex.fn.now());
    t.index(['alert_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('technical_alert_log');
  await knex.schema.alterTable('alerts', (t) => {
    t.dropColumn('indicator');
    t.dropColumn('timeframe');
    t.dropColumn('description');
  });
}
