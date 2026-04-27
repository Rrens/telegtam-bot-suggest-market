import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('news_cache', (t) => {
    t.increments('id').primary();
    t.string('symbol', 30).notNullable();
    t.string('source', 100).notNullable();
    t.text('title').notNullable();
    t.text('url').notNullable();
    t.enum('sentiment', ['positive', 'neutral', 'negative']).defaultTo('neutral');
    t.decimal('sentiment_score', 6, 4).defaultTo(0);
    t.timestamp('published_at').notNullable();
    t.string('hash', 64).unique().notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['symbol', 'published_at']);
  });

  await knex.schema.createTable('news_alerts', (t) => {
    t.increments('id').primary();
    t.bigInteger('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('symbol', 30).notNullable();
    t.boolean('active').defaultTo(true);
    t.timestamp('last_alerted').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['user_id', 'symbol']);
    t.index(['symbol', 'active']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('news_alerts');
  await knex.schema.dropTableIfExists('news_cache');
}
