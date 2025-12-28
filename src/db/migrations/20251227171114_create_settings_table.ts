import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('settings'))) {
        await knex.schema.createTable('settings', (table) => {
            table.string('key').primary().notNullable();
            table.text('value').notNullable();
            table.timestamps(true, true);
        });

        await knex('settings').insert([
            { key: 'branding.app_name', value: 'Bang' },
            { key: 'branding.app_url', value: '' },
            { key: 'branding.show_footer', value: 'true' },
            { key: 'branding.show_search_page', value: 'true' },
            { key: 'branding.show_about_page', value: 'true' },
        ]);
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('settings');
}
