// Migration: Create watchlist table for user token watchlists

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('watchlist', (t) => {
    t.increments('id').primary();
    t.bigInteger('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('symbol', 60).notNullable();
    t.string('asset_type', 20).defaultTo('crypto');  // 'crypto' | 'solana_token'
    t.string('note', 200).nullable();                 // Optional user note
    t.decimal('entry_price', 20, 8).nullable();       // Target entry price reminder
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['user_id', 'symbol']);
    t.index(['user_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('watchlist');
}
