import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex('bangs').whereNull('hidden').update({ hidden: false });
    await knex('bookmarks').whereNull('hidden').update({ hidden: false });
    await knex('notes').whereNull('hidden').update({ hidden: false });
}

export async function down(knex: Knex): Promise<void> {
    await knex('bangs').where('hidden', false).update({ hidden: null });
    await knex('bookmarks').where('hidden', false).update({ hidden: null });
    await knex('notes').where('hidden', false).update({ hidden: null });
}
