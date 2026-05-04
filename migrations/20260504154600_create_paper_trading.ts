import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add balance to users table
  await knex.schema.alterTable('users', (table) => {
    table.decimal('paper_balance', 14, 2).defaultTo(10000.00); // Default $10k
  });

  // Create paper_trades table
  await knex.schema.createTable('paper_trades', (table) => {
    table.increments('id').primary();
    table.bigInteger('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.string('symbol').notNullable();
    table.string('type').notNullable(); // 'BUY' or 'SELL'
    table.decimal('amount', 18, 8).notNullable(); // Quantity
    table.decimal('price', 18, 8).notNullable();  // Execution price
    table.decimal('total_value', 14, 2).notNullable(); // USD Value
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Create paper_positions table
  await knex.schema.createTable('paper_positions', (table) => {
    table.increments('id').primary();
    table.bigInteger('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.string('symbol').notNullable();
    table.decimal('amount', 18, 8).notNullable(); // Current holding
    table.decimal('avg_price', 18, 8).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.unique(['user_id', 'symbol']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('paper_positions');
  await knex.schema.dropTableIfExists('paper_trades');
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('paper_balance');
  });
}
