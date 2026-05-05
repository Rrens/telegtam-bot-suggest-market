import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('paper_positions', (table) => {
    table.decimal('tp_price', 18, 8).nullable();           // Take Profit Price
    table.decimal('sl_price', 18, 8).nullable();           // Stop Loss Price
    table.decimal('trailing_stop_pct', 5, 2).nullable();   // Trailing Stop %
    table.decimal('highest_price', 18, 8).nullable();      // Highest price for trailing stop
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('paper_positions', (table) => {
    table.dropColumn('tp_price');
    table.dropColumn('sl_price');
    table.dropColumn('trailing_stop_pct');
    table.dropColumn('highest_price');
  });
}
