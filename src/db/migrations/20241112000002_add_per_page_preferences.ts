import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('users', (table) => {
		// Rename existing column to bookmarks_per_page
		table.renameColumn('default_per_page', 'bookmarks_per_page');
		// Add new column for actions
		table.integer('actions_per_page').defaultTo(10);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('users', (table) => {
		table.renameColumn('bookmarks_per_page', 'default_per_page');
		table.dropColumn('actions_per_page');
	});
}
