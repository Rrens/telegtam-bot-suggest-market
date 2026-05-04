import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('chat_log', (table) => {
    table.increments('id').primary();
    table.string('user_id').notNullable().index();
    table.string('username').nullable();
    table.string('type').notNullable(); // 'command', 'message', 'callback'
    table.text('content').notNullable();
    table.jsonb('metadata').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('chat_log');
}
