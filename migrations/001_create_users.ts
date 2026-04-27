import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (t) => {
    t.bigInteger('id').primary(); // Telegram user ID
    t.string('username', 100).nullable();
    t.enum('risk_profile', ['conservative', 'moderate', 'aggressive']).defaultTo('moderate');
    t.enum('preferred_timeframe', ['scalping', 'swing', 'long-term']).defaultTo('swing');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
}
