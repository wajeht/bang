process.env.APP_ENV = 'testing';
process.env.NODE_ENV = 'testing';

import { libs } from '../libs';
import { config } from '../config';
import { Database } from '../db/db';
import { createApp } from '../app';
import { Log, Logger } from '../utils/logger';
import type { Application } from 'express';
import type { AppContext } from '../type';
import { beforeAll, beforeEach, afterAll } from 'vitest';

Log.setLevel('SILENT');

const logger = Logger();
const database = Database({ config, logger, libs });
export const db = database.instance;

export let app: Application;
export let ctx: AppContext;

const defaultColumnPreferences = JSON.stringify({
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
});

async function cleanupAllTables() {
    await db.transaction(async (trx) => {
        await trx.raw('PRAGMA foreign_keys = OFF');

        const rows = await trx
            .select('name')
            .from('sqlite_master')
            .where({ type: 'table' })
            .whereNotIn('name', ['sqlite_sequence', 'knex_migrations', 'knex_migrations_lock']);

        for (const { name } of rows as Array<{ name: string }>) {
            await trx(name).del();
        }

        await trx.raw('PRAGMA foreign_keys = ON');
    });
}

export async function createTestUser(email: string, isAdmin: boolean = false) {
    let user = await db('users').where({ email }).first();

    if (!user) {
        [user] = await db('users')
            .insert({
                username: email.split('@')[0],
                email,
                is_admin: isAdmin,
                default_search_provider: 'duckduckgo',
                timezone: 'America/Chicago',
                theme: 'system',
                column_preferences: defaultColumnPreferences,
            })
            .onConflict('email')
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

async function seedTestUser() {
    // Use id=1 explicitly since some tests reference this user by id
    await db('users')
        .insert({
            id: 1,
            username: 'testuser',
            email: 'test@example.com',
            is_admin: false,
            default_search_provider: 'duckduckgo',
            timezone: 'America/Chicago',
            theme: 'system',
            column_preferences: defaultColumnPreferences,
        })
        .onConflict('id')
        .ignore();
}

beforeAll(async () => {
    try {
        await db.migrate.latest();
        if (!app) {
            ({ app, ctx } = await createApp());
        }
    } catch (error) {
        console.error('Error setting up test database:', error);
        throw error;
    }
});

beforeEach(async () => {
    try {
        await cleanupAllTables();
        await seedTestUser();
    } catch (error) {
        console.error('Error setting up test data:', error);
        throw error;
    }
});

afterAll(async () => {
    try {
        await db.destroy();
    } catch (error) {
        console.error('Error cleaning up test database:', error);
        throw error;
    }
});
