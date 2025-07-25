import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('reminders'))) {
        await knex.schema.createTable('reminders', (table) => {
            table.increments('id').primary();
            table
                .integer('user_id')
                .unsigned()
                .references('id')
                .inTable('users')
                .onDelete('CASCADE')
                .notNullable();
            table.string('title').notNullable(); // description/task
            table.text('url').nullable(); // optional URL
            table.string('reminder_type').defaultTo('once'); // once or recurring
            table.string('frequency').nullable(); // daily, weekly, biweekly, or monthly
            table.timestamp('next_due').nullable(); // when next reminder should fire
            table.boolean('is_completed').defaultTo(false).notNullable(); // whether the reminder is completed
            table.timestamps(true, true);

            // Indexes for performance
            table.index(['user_id', 'next_due']); // for finding due reminders
            table.index(['next_due'], 'reminders_next_due_idx'); // for cron job queries
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('reminders');
}
