import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('tab_items', (table) => {
        table.index(['tab_id'], 'tab_items_tab_id_idx');
        table.index(['tab_id', 'created_at'], 'tab_items_tab_id_created_idx');
    });

    await knex.schema.alterTable('tabs', (table) => {
        table.index(['user_id', 'created_at'], 'tabs_user_created_idx');
    });

    await knex.schema.alterTable('notes', (table) => {
        table.index(['user_id', 'pinned', 'created_at'], 'notes_user_pinned_created_idx');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('tab_items', (table) => {
        table.dropIndex(['tab_id'], 'tab_items_tab_id_idx');
        table.dropIndex(['tab_id', 'created_at'], 'tab_items_tab_id_created_idx');
    });

    await knex.schema.alterTable('tabs', (table) => {
        table.dropIndex(['user_id', 'created_at'], 'tabs_user_created_idx');
    });

    await knex.schema.alterTable('notes', (table) => {
        table.dropIndex(['user_id', 'pinned', 'created_at'], 'notes_user_pinned_created_idx');
    });
}
