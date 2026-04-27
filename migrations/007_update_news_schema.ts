import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('news_cache', (table) => {
    table.text('summary').nullable();
    table.text('impact').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('news_cache', (table) => {
    table.dropColumn('summary');
    table.dropColumn('impact');
  });
}
