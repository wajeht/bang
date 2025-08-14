import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('reminders', (table) => {
        table.dropIndex(['due_date', 'processed'], 'reminders_due_date_processed_idx');
        table.dropColumn('processed');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('reminders', (table) => {
        table.boolean('processed').defaultTo(false);
        table.index(['due_date', 'processed'], 'reminders_due_date_processed_idx');
    });
}
