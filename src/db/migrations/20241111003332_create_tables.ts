import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('sessions'))) {
        await knex.schema.createTable('sessions', (table) => {
            table.string('sid', 255).primary().notNullable();
            table.json('sess').notNullable();
            table.timestamp('expired').notNullable();

            table.index(['expired'], 'sessions_expired_index');
        });
    }

    if (!(await knex.schema.hasTable('users'))) {
        await knex.schema.createTable('users', (table) => {
            table.increments('id').primary();
            table.string('username').unique().notNullable();
            table.string('email').unique().notNullable();
            table.boolean('is_admin').defaultTo(false);
            table.boolean('autocomplete_search_on_homepage').defaultTo(false);
            table.string('default_search_provider').defaultTo('duckduckgo');
            table.string('api_key').unique().nullable();
            table.integer('api_key_version').defaultTo(0).notNullable();
            table.timestamp('api_key_created_at').nullable();
            table.json('column_preferences').defaultTo(
                JSON.stringify({
                    bookmarks: {
                        title: true,
                        url: true,
                        default_per_page: 10,
                        created_at: true,
                        pinned: true,
                    },
                    actions: {
                        name: true,
                        trigger: true,
                        url: true,
                        default_per_page: 10,
                        last_read_at: true,
                        usage_count: true,
                        created_at: true,
                    },
                    notes: {
                        title: true,
                        content: true,
                        default_per_page: 10,
                        created_at: true,
                        pinned: true,
                        view_type: 'table',
                    },
                    tabs: {
                        title: true,
                        trigger: true,
                        items_count: true,
                        default_per_page: 10,
                        created_at: true,
                    },
                    reminders: {
                        title: true,
                        content: true,
                        due_date: true,
                        frequency: true,
                        default_per_page: 10,
                        created_at: true,
                        default_reminder_timing: 'daily',
                        default_reminder_time: '09:00',
                    },
                    users: {
                        username: true,
                        email: true,
                        is_admin: true,
                        default_per_page: 10,
                        email_verified_at: true,
                        created_at: true,
                    },
                }),
            );
            table.timestamp('email_verified_at').nullable();
            table.string('timezone').defaultTo('UTC');
            table.timestamps(true, true);

            table.index('api_key');
            table.index(['email', 'is_admin', 'username']);
        });
    }

    if (!(await knex.schema.hasTable('bookmarks'))) {
        await knex.schema.createTable('bookmarks', (table) => {
            table.increments('id').primary();
            table
                .integer('user_id')
                .unsigned()
                .references('id')
                .inTable('users')
                .onDelete('CASCADE');
            table.text('url').notNullable();
            table.string('title');
            table.boolean('pinned').defaultTo(false);
            table.timestamps(true, true);

            table.index(['user_id', 'created_at']);
            table.index(['user_id', 'pinned', 'created_at']);
        });
    }

    if (!(await knex.schema.hasTable('bangs'))) {
        await knex.schema.createTable('bangs', (table) => {
            table.increments('id').primary();
            table
                .integer('user_id')
                .unsigned()
                .references('id')
                .inTable('users')
                .onDelete('CASCADE');
            table.string('trigger').notNullable();
            table.string('name').notNullable();
            table.string('action_type').notNullable().defaultTo('redirect');
            table.text('url').notNullable();
            table.timestamps(true, true);
            table.timestamp('last_read_at').nullable();
            table.integer('usage_count').defaultTo(0).notNullable();

            table.index(['user_id', 'last_read_at']);
            table.unique(['user_id', 'trigger']);
            table.index(['user_id', 'trigger']);
            table.index(['trigger'], 'bangs_trigger_idx');
            table.index(['user_id', 'created_at'], 'bangs_user_created_idx');
            table.index(['action_type'], 'bangs_action_type_idx');
            table.index(['user_id', 'usage_count'], 'bangs_user_usage_idx');
            table.index(['user_id', 'trigger', 'last_read_at'], 'bangs_user_trigger_last_read_idx');
        });
    }

    if (!(await knex.schema.hasTable('notes'))) {
        await knex.schema.createTable('notes', (table) => {
            table.increments('id').primary();
            table
                .integer('user_id')
                .unsigned()
                .references('id')
                .inTable('users')
                .onDelete('CASCADE');
            table.string('title').notNullable();
            table.text('content').notNullable();
            table.boolean('pinned').defaultTo(false);
            table.timestamps(true, true);

            table.index(['user_id', 'created_at']);
            table.index(['user_id', 'pinned', 'created_at']);
        });
    }

    if (!(await knex.schema.hasTable('tabs'))) {
        await knex.schema.createTable('tabs', (table) => {
            table.increments('id').primary();
            table
                .integer('user_id')
                .unsigned()
                .references('id')
                .inTable('users')
                .onDelete('CASCADE');
            table.string('trigger').notNullable(); // e.g., 'worktabs'
            table.string('title').notNullable(); // e.g., 'Work Tabs'
            table.unique(['user_id', 'trigger']);
            table.timestamps(true, true);
        });
    }

    if (!(await knex.schema.hasTable('tab_items'))) {
        await knex.schema.createTable('tab_items', (table) => {
            table.increments('id').primary();
            table.integer('tab_id').unsigned().references('id').inTable('tabs').onDelete('CASCADE');
            table.string('title').notNullable();
            table.text('url').notNullable();
            table.timestamps(true, true);
        });
    }

    if (!(await knex.schema.hasTable('reminders'))) {
        await knex.schema.createTable('reminders', (table) => {
            table.increments('id').primary();
            table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable(); // prettier-ignore
            table.string('title').notNullable(); // description/task
            table.text('content').nullable();
            table.string('reminder_type').defaultTo('once'); // once or recurring
            table.string('frequency').nullable(); // daily, weekly, or monthly
            table.timestamp('due_date').nullable();
            table.timestamps(true, true);

            table.index(['user_id', 'due_date']); // finding due reminders
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    for (const table of [
        'reminders',
        'tab_items',
        'tabs',
        'notes',
        'bangs',
        'bookmarks',
        'users',
        'sessions',
    ]) {
        await knex.schema.dropTableIfExists(table);
    }
}
