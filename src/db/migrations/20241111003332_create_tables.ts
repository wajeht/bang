import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('sessions', (table) => {
		table.string('sid', 255).primary().notNullable();
		table.json('sess').notNullable();
		table.timestamp('expired').notNullable();
		table.string('api_key').unique().nullable();
		table.integer('api_key_version').defaultTo(0).notNullable();
		table.timestamp('api_key_created_at').nullable();

		table.index('api_key');
		table.index(['expired'], 'sessions_expired_index');
	});

	await knex.schema.createTable('users', (table) => {
		table.increments('id').primary();
		table.string('username').unique().notNullable();
		table.string('email').unique().notNullable();
		table.boolean('is_admin').defaultTo(false);
		table.string('default_search_provider').defaultTo('duckduckgo');
		table.integer('default_per_page').defaultTo(10);
		table.timestamps(true, true);

		table.index(['email', 'is_admin', 'username']);
	});

	await knex.schema.createTable('action_types', (table) => {
		table.increments('id').primary();
		table.string('name').unique().notNullable();
		table.string('description');
		table.timestamps(true, true);
	});

	await knex.schema.createTable('bookmarks', (table) => {
		table.increments('id').primary();
		table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
		table.text('url').notNullable();
		table.string('title');
		table.timestamps(true, true);

		table.index(['user_id', 'created_at']);
	});

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

	await knex('action_types').insert([
		{ name: 'search' },
		{ name: 'redirect' },
		{ name: 'bookmark' },
	]);
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTableIfExists('bangs');
	await knex.schema.dropTableIfExists('bookmarks');
	await knex.schema.dropTableIfExists('action_types');
	await knex.schema.dropTableIfExists('users');
	await knex.schema.dropTableIfExists('sessions');
}
