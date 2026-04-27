import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('assets', (t) => {
    t.increments('id').primary();
    t.bigInteger('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('symbol', 30).notNullable();
    t.enum('asset_type', ['crypto', 'stock', 'forex']).notNullable();
    t.decimal('amount', 20, 10).notNullable();
    t.decimal('avg_price', 20, 8).notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['user_id', 'symbol']);
    t.index(['user_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('assets');
}
