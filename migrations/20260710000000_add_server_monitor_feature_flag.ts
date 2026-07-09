import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const exists = await knex('feature_flags').where({ key: 'serverMonitor' }).first();
  if (!exists) {
    await knex('feature_flags').insert({
      key: 'serverMonitor',
      enabled: true,
      description: 'System resource monitoring (CPU, RAM, Disk) and alerts',
      updated_at: knex.fn.now()
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex('feature_flags').where({ key: 'serverMonitor' }).del();
}
