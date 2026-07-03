import type { Knex } from 'knex';

// Do NOT use knex's dropColumn() here: on SQLite it rebuilds the table via
// DROP TABLE, and since `PRAGMA foreign_keys = OFF` is ignored inside the
// migration transaction, the drop cascades into every table referencing
// users and deletes all user data. Native DROP COLUMN (SQLite 3.35+) does
// not rebuild the table, so no cascade can fire.
export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('users', 'api_key'))) {
        return;
    }

    await knex.raw('DROP INDEX IF EXISTS users_api_key_index');
    await knex.raw('DROP INDEX IF EXISTS users_api_key_unique');
    await knex.raw('ALTER TABLE users DROP COLUMN api_key');
    await knex.raw('ALTER TABLE users DROP COLUMN api_key_version');
    await knex.raw('ALTER TABLE users DROP COLUMN api_key_created_at');
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('users', 'api_key')) {
        return;
    }

    await knex.raw('ALTER TABLE users ADD COLUMN api_key varchar(255)');
    await knex.raw('ALTER TABLE users ADD COLUMN api_key_version integer NOT NULL DEFAULT 0');
    await knex.raw('ALTER TABLE users ADD COLUMN api_key_created_at datetime');
    await knex.raw('CREATE UNIQUE INDEX users_api_key_unique ON users (api_key)');
    await knex.raw('CREATE INDEX users_api_key_index ON users (api_key)');
}
