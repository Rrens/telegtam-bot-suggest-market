import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('signal_history', (t) => {
    t.increments('id').primary();
    t.bigInteger('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.integer('signal_id').nullable().references('id').inTable('signals').onDelete('SET NULL');
    t.string('symbol', 30).notNullable();
    t.enum('outcome', ['win', 'loss', 'pending']).defaultTo('pending');
    t.decimal('entry_price', 20, 8).nullable();
    t.decimal('exit_price', 20, 8).nullable();
    t.decimal('return_pct', 8, 4).nullable();
    t.timestamp('resolved_at').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['user_id', 'symbol']);
    t.index(['symbol', 'outcome']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('signal_history');
}
