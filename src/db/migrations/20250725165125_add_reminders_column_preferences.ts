import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.transaction(async (trx) => {
        const users = await trx('users').select('id', 'column_preferences');

        const updates = [];

        for (const user of users) {
            let columnPreferences;
            try {
                columnPreferences = JSON.parse(user.column_preferences || '{}');
            } catch (error) {
                columnPreferences = {};
            }

            if (!columnPreferences.reminders) {
                columnPreferences.reminders = {
                    title: true,
                    url: true,
                    next_due: true,
                    frequency: true,
                    status: true,
                    default_per_page: 20,
                    created_at: true,
                };

                updates.push({
                    id: user.id,
                    column_preferences: JSON.stringify(columnPreferences),
                });
            }
        }

        for (const update of updates) {
            await trx('users')
                .where('id', update.id)
                .update({ column_preferences: update.column_preferences });
        }
    });
}

export async function down(knex: Knex): Promise<void> {
    // We don't want to remove reminders configuration once added
}
