import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS notes_visible_user_pinned_created_idx
        ON notes (user_id, pinned DESC, created_at DESC)
        WHERE hidden = 0 OR hidden IS NULL
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('DROP INDEX IF EXISTS notes_visible_user_pinned_created_idx');
}
