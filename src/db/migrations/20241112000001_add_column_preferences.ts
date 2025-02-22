import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('users', (table) => {
		table.jsonb('column_preferences').defaultTo(
			JSON.stringify({
				actions: {
					name: true,
					trigger: true,
					url: true,
					action_type: true,
					created_at: true,
				},
				bookmarks: {
					title: true,
					url: true,
					created_at: true,
				},
			}),
		);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('users', (table) => {
		table.dropColumn('column_preferences');
	});
}
