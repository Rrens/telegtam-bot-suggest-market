import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('alerts', (t) => {
    t.increments('id').primary();
    t.bigInteger('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('symbol', 30).notNullable();
    t.enum('alert_type', ['price_target', 'pct_change', 'portfolio_threshold']).notNullable();
    t.enum('condition', ['gte', 'lte']).notNullable();
    t.decimal('target_value', 20, 8).notNullable();
    t.boolean('active').defaultTo(true);
    t.timestamp('triggered_at').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['user_id', 'active']);
    t.index(['symbol', 'active']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('alerts');
}
