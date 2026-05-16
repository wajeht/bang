import { libs } from '../libs.js';
import { config } from '../config.js';
import { createDatabase } from '../db/db.js';
import { createLogger } from '../utils/logger.js';
import type { Knex } from 'knex';

const defaultColumnPreferences = {
    bookmarks: {
        title: true,
        url: true,
        default_per_page: 10,
        created_at: true,
        pinned: true,
        hidden: true,
    },
    actions: {
        name: true,
        trigger: true,
        url: true,
        default_per_page: 10,
        last_read_at: true,
        usage_count: true,
        created_at: true,
        hidden: true,
    },
    notes: {
        title: true,
        content: true,
        default_per_page: 10,
        created_at: true,
        pinned: true,
        view_type: 'table',
        hidden: true,
    },
    tabs: { title: true, trigger: true, items_count: true, default_per_page: 10, created_at: true },
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
};

const defaultUserProps = {
    default_search_provider: 'duckduckgo',
    timezone: 'America/Chicago',
    theme: 'system',
    column_preferences: JSON.stringify(defaultColumnPreferences),
};

export function createDb() {
    const logger = createLogger();
    return createDatabase({ config, logger, libs }).instance;
}

export interface CreateUserOptions {
    id?: number;
    isAdmin?: boolean;
    username?: string;
}

export async function createUser(db: Knex, email: string, options: CreateUserOptions = {}) {
    const { id, isAdmin = false, username = email.split('@')[0] } = options;

    let user = await db('users').where({ email }).first();

    if (!user) {
        const data: Record<string, unknown> = {
            username,
            email,
            is_admin: isAdmin,
            ...defaultUserProps,
        };

        if (id !== undefined) {
            data.id = id;
        }

        [user] = await db('users')
            .insert(data)
            .onConflict(id !== undefined ? 'id' : 'email')
            .ignore()
            .returning('*');

        if (!user) {
            user = await db('users').where({ email }).first();
        }
    }

    if (isAdmin && !user.is_admin) {
        await db('users').where({ id: user.id }).update({ is_admin: true });
        user.is_admin = true;
    }

    return user;
}

const DATA_TABLES = [
    'sessions',
    'tab_items',
    'reminders',
    'notes',
    'bangs',
    'bookmarks',
    'tabs',
    'settings',
    'users',
];

const FTS_TABLES = [
    'tab_items_fts',
    'tabs_fts',
    'reminders_fts',
    'notes_fts',
    'bangs_fts',
    'bookmarks_fts',
];

export async function cleanupTables(db: Knex) {
    await db.transaction(async (trx) => {
        await trx.raw('PRAGMA foreign_keys = OFF');

        const rows = (await trx
            .select('name')
            .from('sqlite_master')
            .where({ type: 'table' })
            .whereIn('name', [...DATA_TABLES, ...FTS_TABLES])) as Array<{ name: string }>;

        const existingTables = new Set(rows.map((row) => row.name));

        for (const name of DATA_TABLES) {
            if (existingTables.has(name)) {
                await trx(name).del();
            }
        }

        for (const name of FTS_TABLES) {
            if (existingTables.has(name)) {
                await trx(name).del();
            }
        }

        await trx.raw('PRAGMA foreign_keys = ON');
    });
}

export async function cleanupUserData(db: Knex, emailPattern: string = '%@example.com') {
    await db.transaction(async (trx) => {
        const testUsers = await trx('users').where('email', 'like', emailPattern).select('id');

        const userIds = testUsers.map((u) => u.id);
        if (userIds.length === 0) return;

        const tables = ['bangs', 'bookmarks', 'notes', 'reminders'];
        await Promise.all(
            tables.map((table) =>
                trx(table)
                    .whereIn('user_id', userIds)
                    .del()
                    .catch(() => {}),
            ),
        );

        await trx('sessions')
            .where('sess', 'like', '%test@example.com%')
            .del()
            .catch(() => {});

        await trx('users').whereIn('id', userIds).del();
    });
}
