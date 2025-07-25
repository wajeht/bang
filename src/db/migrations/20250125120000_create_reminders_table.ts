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
            table.date('specific_date').nullable(); // for one-time reminders
            table.timestamp('next_due').nullable(); // when next reminder should fire
            table.timestamp('last_sent').nullable(); // when last reminder was sent (for recurring reminders)
            table.boolean('is_active').defaultTo(true).notNullable(); // whether the reminder is active
            table.boolean('is_completed').defaultTo(false).notNullable(); // whether the reminder is completed
            table.string('category').defaultTo('auto'); // task, reading, link, or auto
            table.integer('reading_time_estimate').nullable(); // estimated reading time in minutes
            table.timestamps(true, true);

            // Indexes for performance
            table.index(['user_id', 'next_due']); // for finding due reminders
            table.index(['user_id', 'is_active']); // for active reminders
            table.index(['user_id', 'category']); // for filtering by type
            table.index(['next_due'], 'reminders_next_due_idx'); // for cron job queries
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('reminders');
}
