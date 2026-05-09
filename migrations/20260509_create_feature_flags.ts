import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('feature_flags', (t) => {
    t.string('key').primary();
    t.boolean('enabled').defaultTo(true);
    t.string('description').nullable();
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // Seed default values
  await knex('feature_flags').insert([
    { key: 'news', enabled: true, description: 'News monitoring and alerts' },
    { key: 'alerts', enabled: true, description: 'Price and technical alerts' },
    { key: 'signals', enabled: true, description: 'Trading signals generation' },
    { key: 'marketScan', enabled: true, description: 'Periodic market scanning' },
    { key: 'solanaScreener', enabled: true, description: 'Solana gem hunter' },
    { key: 'whaleTracker', enabled: true, description: 'Whale movement tracking' },
    { key: 'smartMoney', enabled: true, description: 'Smart money wallet tracking' },
    { key: 'pumpFun', enabled: true, description: 'Pump.fun graduation alerts' },
    { key: 'lpTracker', enabled: true, description: 'LP burn/lock tracker' },
    { key: 'dailySummary', enabled: true, description: 'Daily AI market recap' },
    { key: 'paperTrading', enabled: true, description: 'Paper trading simulation' },
    { key: 'marketAlerts', enabled: true, description: 'Auto-momentum market alerts' },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('feature_flags');
}
