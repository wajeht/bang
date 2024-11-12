import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('users', (table) => {
		table.increments('id').primary();
		table.string('username').unique().notNullable();
		table.string('email').unique().notNullable();
		table.boolean('is_admin').defaultTo(false);
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
		table.string('url').notNullable();
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
		table.string('url').notNullable();
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
}