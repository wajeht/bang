import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
	const hasSessionsTable = await knex.schema.hasTable('sessions');
	if (!hasSessionsTable) {
		await knex.schema.createTable('sessions', (table) => {
			table.string('sid', 255).primary().notNullable();
			table.json('sess').notNullable();
			table.timestamp('expired').notNullable();

			table.index(['expired'], 'sessions_expired_index');
		});
	}

	const hasUsersTable = await knex.schema.hasTable('users');
	if (!hasUsersTable) {
		await knex.schema.createTable('users', (table) => {
			table.increments('id').primary();
			table.string('username').unique().notNullable();
			table.string('email').unique().notNullable();
			table.boolean('is_admin').defaultTo(false);
			table.string('default_search_provider').defaultTo('duckduckgo');
			table.string('api_key').unique().nullable();
			table.integer('api_key_version').defaultTo(0).notNullable();
			table.timestamp('api_key_created_at').nullable();
			table.json('column_preferences').defaultTo(
				JSON.stringify({
					bookmarks: {
						id: true,
						title: true,
						url: true,
						default_per_page: 10,
						created_at: true,
						updated_at: true,
					},
					actions: {
						id: true,
						name: true,
						trigger: true,
						url: true,
						default_per_page: 10,
						created_at: true,
						updated_at: true,
					},
				}),
			);
			table.timestamps(true, true);

			table.index('api_key');
			table.index(['email', 'is_admin', 'username']);
		});
	}

	const hasActionTypesTable = await knex.schema.hasTable('action_types');
	if (!hasActionTypesTable) {
		await knex.schema.createTable('action_types', (table) => {
			table.increments('id').primary();
			table.string('name').unique().notNullable();
			table.string('description');
			table.timestamps(true, true);
		});
	}

	const hasBookmarksTable = await knex.schema.hasTable('bookmarks');
	if (!hasBookmarksTable) {
		await knex.schema.createTable('bookmarks', (table) => {
			table.increments('id').primary();
			table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
			table.text('url').notNullable();
			table.string('title');
			table.timestamps(true, true);

			table.index(['user_id', 'created_at']);
		});
	}

	const hasBangsTable = await knex.schema.hasTable('bangs');
	if (!hasBangsTable) {
		await knex.schema.createTable('bangs', (table) => {
			table.increments('id').primary();
			table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
			table.string('trigger').notNullable();
			table.string('name').notNullable();
			table.integer('action_type_id').unsigned().references('id').inTable('action_types');
			table.text('url').notNullable();
			table.timestamps(true, true);

			table.unique(['user_id', 'trigger']);
			table.index(['user_id', 'trigger']);
		});
	}

	// Insert default action types
	await knex('action_types').insert([
		{ name: 'search' },
		{ name: 'redirect' },
		{ name: 'bookmark' },
	]);
}

export async function down(knex: Knex): Promise<void> {
	for (const table of ['bangs', 'bookmarks', 'action_types', 'users', 'sessions']) {
		await knex.schema.dropTableIfExists(table);
	}
}
