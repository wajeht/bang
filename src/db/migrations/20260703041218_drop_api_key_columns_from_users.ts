import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('users', (table) => {
        table.dropIndex('api_key');
        table.dropUnique(['api_key']);
    });

    await knex.schema.alterTable('users', (table) => {
        table.dropColumn('api_key');
        table.dropColumn('api_key_version');
        table.dropColumn('api_key_created_at');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('users', (table) => {
        table.string('api_key').unique().nullable();
        table.integer('api_key_version').defaultTo(0).notNullable();
        table.timestamp('api_key_created_at').nullable();
    });

    await knex.schema.alterTable('users', (table) => {
        table.index('api_key');
    });
}
