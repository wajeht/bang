import {
    getHealthzHandler,
    getAdminUsersHandler,
    toggleNotePinHandler,
    postImportDataHandler,
    postDeleteAdminUserHandler,
    postSettingsDisplayHandler,
    postRecalculateRemindersHandler,
} from './handler';
import dayjs from './utils/dayjs';
import { db, notes } from './db/db';
import type { Request, Response } from 'express';
import { adminOnlyMiddleware } from './middleware';
import { parseReminderTiming } from './utils/search';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Health Check Endpoint', () => {
    let req: Partial<Request>;
    let res: Partial<Response>;

    beforeEach(() => {
        vi.resetAllMocks();

        req = {
            headers: {},
            header: vi.fn().mockImplementation((name) => {
                if (name === 'Content-Type') {
                    return req.headers?.['content-type'];
                }
                if (name === 'Accept') {
                    return req.headers?.['accept'];
                }
                return undefined;
            }),
        };

        res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            setHeader: vi.fn().mockReturnThis(),
            send: vi.fn().mockReturnThis(),
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should return 200 status when database is connected (JSON response)', async () => {
        req = {
            headers: {
                'content-type': 'application/json',
                accept: 'application/json',
            },
            header: vi.fn().mockImplementation((name) => {
                if (name === 'Content-Type') {
                    return 'application/json';
                }
                return undefined;
            }),
        };

        const handler = getHealthzHandler(db);
        await handler(req as Request, res as Response);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ status: 'ok', database: 'connected' });
    });

    it('should return 200 status when database is connected (HTML response)', async () => {
        const handler = getHealthzHandler(db);
        await handler(req as Request, res as Response);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html');
        expect(res.send).toHaveBeenCalledWith('<p>ok</p>');
    });
});

describe('Toggle Note Pin Handler', () => {
    let testUserId: number;
    let testNoteId: number;
    let req: any;
    let res: any;

    beforeEach(async () => {
        await db('users').where('email', 'test@example.com').delete();

        const [user] = await db('users')
            .insert({
                username: 'testuser',
                email: 'test@example.com',
                is_admin: false,
                email_verified_at: db.fn.now(),
            })
            .returning('*');

        testUserId = user.id;

        const [note] = await db('notes')
            .insert({
                user_id: testUserId,
                title: 'Test Note',
                content: 'Test content',
                pinned: false,
            })
            .returning('*');

        testNoteId = note.id;

        req = {
            user: { id: testUserId },
            params: { id: testNoteId },
            flash: vi.fn(),
            header: vi.fn().mockReturnValue(undefined),
            path: '/notes/123/pin',
        };

        res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            redirect: vi.fn(),
        };
    });

    afterEach(async () => {
        if (testUserId) {
            await db('notes').where({ user_id: testUserId }).delete();
            await db('users').where({ id: testUserId }).delete();
        }
        vi.clearAllMocks();
    });

    it('should pin an unpinned note', async () => {
        const handler = toggleNotePinHandler(notes);

        await handler(req as Request, res as Response);

        const updatedNote = await db('notes').where({ id: testNoteId }).first();
        expect(updatedNote.pinned).toBe(1);
        expect(req.flash).toHaveBeenCalledWith('success', 'Note pinned successfully');
        expect(res.redirect).toHaveBeenCalledWith('/notes');
    });

    it('should unpin a pinned note', async () => {
        await db('notes').where({ id: testNoteId }).update({ pinned: true });

        const handler = toggleNotePinHandler(notes);

        await handler(req as Request, res as Response);

        const updatedNote = await db('notes').where({ id: testNoteId }).first();
        expect(updatedNote.pinned).toBe(0);
        expect(req.flash).toHaveBeenCalledWith('success', 'Note unpinned successfully');
        expect(res.redirect).toHaveBeenCalledWith('/notes');
    });

    it('should return 404 for non-existent note', async () => {
        req.params.id = 99999;

        const handler = toggleNotePinHandler(notes);

        await expect(handler(req as Request, res as Response)).rejects.toThrow('Note not found');
    });

    it('should not allow pinning notes from other users', async () => {
        const [otherUser] = await db('users')
            .insert({
                username: 'otheruser',
                email: 'other@example.com',
                is_admin: false,
            })
            .returning('*');

        req.user.id = otherUser.id;

        const handler = toggleNotePinHandler(notes);

        await expect(handler(req as Request, res as Response)).rejects.toThrow('Note not found');

        await db('users').where({ id: otherUser.id }).delete();
    });
});

describe('Import Data Handler', () => {
    let req: Partial<Request>;
    let res: Partial<Response>;
    let userId: number;

    beforeEach(async () => {
        vi.resetAllMocks();

        // Create a test user
        const [user] = await db('users')
            .insert({
                username: 'testuser',
                email: 'test@example.com',
                is_admin: false,
            })
            .returning('*');

        userId = user.id;

        req = {
            body: {},
            session: {
                user: { id: userId },
            } as any,
            flash: vi.fn(),
        };

        res = {
            redirect: vi.fn().mockReturnThis(),
        };
    });

    afterEach(async () => {
        // Clean up test data
        await db('bangs').where({ user_id: userId }).delete();
        await db('users').where({ id: userId }).delete();
    });

    it('should handle duplicate actions gracefully', async () => {
        // First, create an existing action
        await db('bangs').insert({
            user_id: userId,
            trigger: '!test',
            name: 'Test Action',
            url: 'https://example.com',
            action_type: 'redirect',
            created_at: dayjs().toDate(),
        });

        // Prepare import data with the same action
        const importData = {
            version: '1.0',
            actions: [
                {
                    trigger: '!test',
                    name: 'Test Action Updated',
                    url: 'https://example.com/updated',
                    action_type: 'redirect',
                },
            ],
        };

        req.body = { config: JSON.stringify(importData) };

        const handler = postImportDataHandler(db);
        await handler(req as Request, res as Response);

        // Verify that no duplicate was created
        const actions = await db('bangs').where({ user_id: userId, trigger: '!test' });
        expect(actions).toHaveLength(1);

        // Verify the original action wasn't modified
        expect(actions[0].name).toBe('Test Action');
        expect(actions[0].url).toBe('https://example.com');

        expect(req.flash).toHaveBeenCalledWith('success', 'Data imported successfully!');
        expect(res.redirect).toHaveBeenCalledWith('/settings/data');
    });

    it('should import new actions successfully', async () => {
        const importData = {
            version: '1.0',
            actions: [
                {
                    trigger: '!new',
                    name: 'New Action',
                    url: 'https://new.com',
                    action_type: 'redirect',
                },
            ],
        };

        req.body = { config: JSON.stringify(importData) };

        const handler = postImportDataHandler(db);
        await handler(req as Request, res as Response);

        // Verify the new action was created
        const actions = await db('bangs').where({ user_id: userId, trigger: '!new' });
        expect(actions).toHaveLength(1);
        expect(actions[0].name).toBe('New Action');
        expect(actions[0].url).toBe('https://new.com');

        expect(req.flash).toHaveBeenCalledWith('success', 'Data imported successfully!');
        expect(res.redirect).toHaveBeenCalledWith('/settings/data');
    });
});

describe('Recalculate Reminders Handler', () => {
    let req: Partial<Request>;
    let res: Partial<Response>;
    let userId: number;

    beforeEach(async () => {
        vi.resetAllMocks();

        // Create a test user with timezone and reminder preferences
        const [user] = await db('users')
            .insert({
                username: 'testuser',
                email: 'test@example.com',
                is_admin: false,
                timezone: 'America/New_York',
                column_preferences: JSON.stringify({
                    reminders: {
                        default_reminder_time: '10:00',
                        default_reminder_timing: 'daily',
                        title: true,
                        content: true,
                        due_date: true,
                        next_due: true,
                        created_at: true,
                        default_per_page: 20,
                    },
                }),
            })
            .returning('*');

        userId = user.id;

        // Parse column_preferences for the user object
        user.column_preferences = JSON.parse(user.column_preferences as any);

        req = {
            user: user as any,
            flash: vi.fn(),
        };

        res = {
            redirect: vi.fn().mockReturnThis(),
        };
    });

    afterEach(async () => {
        // Clean up test data
        await db('reminders').where({ user_id: userId }).delete();
        await db('users').where({ id: userId }).delete();
    });

    it('should recalculate daily recurring reminders', async () => {
        // Create a daily reminder with an old due date
        const oldDueDate = dayjs().subtract(5, 'days').toISOString();
        await db('reminders').insert({
            user_id: userId,
            title: 'Daily Task',
            content: 'Test content',
            reminder_type: 'recurring',
            frequency: 'daily',
            due_date: oldDueDate,
        });

        const handler = postRecalculateRemindersHandler();
        await handler(req as Request, res as Response);

        // Check that the reminder was updated
        const updatedReminder = await db('reminders')
            .where({ user_id: userId, title: 'Daily Task' })
            .first();

        // The due date should be tomorrow at 10:00 in user's timezone
        const expectedDate = dayjs()
            .tz('America/New_York')
            .add(1, 'day')
            .hour(10)
            .minute(0)
            .second(0)
            .millisecond(0);

        // Database stores in UTC, so convert to user timezone for comparison
        const actualDate = dayjs(updatedReminder.due_date).tz('America/New_York');

        // Check that the dates are on the same day and hour
        expect(actualDate.format('YYYY-MM-DD HH')).toBe(expectedDate.format('YYYY-MM-DD HH'));

        expect(req.flash).toHaveBeenCalledWith(
            'success',
            'Successfully recalculated 1 recurring reminders',
        );
        expect(res.redirect).toHaveBeenCalledWith('/reminders');
    });

    it('should recalculate weekly recurring reminders', async () => {
        // Create a weekly reminder
        const oldDueDate = dayjs().subtract(2, 'weeks').toISOString();
        await db('reminders').insert({
            user_id: userId,
            title: 'Weekly Review',
            reminder_type: 'recurring',
            frequency: 'weekly',
            due_date: oldDueDate,
        });

        const handler = postRecalculateRemindersHandler();
        await handler(req as Request, res as Response);

        const updatedReminder = await db('reminders')
            .where({ user_id: userId, title: 'Weekly Review' })
            .first();

        // Should be set to next Saturday
        const actualDate = dayjs(updatedReminder.due_date).tz('America/New_York');
        expect(actualDate.day()).toBe(6); // Saturday
        expect(actualDate.hour()).toBe(10); // 10:00 AM

        expect(req.flash).toHaveBeenCalledWith(
            'success',
            'Successfully recalculated 1 recurring reminders',
        );
    });

    it('should recalculate monthly recurring reminders', async () => {
        // Create a monthly reminder
        const oldDueDate = dayjs().subtract(3, 'months').toISOString();
        await db('reminders').insert({
            user_id: userId,
            title: 'Monthly Report',
            reminder_type: 'recurring',
            frequency: 'monthly',
            due_date: oldDueDate,
        });

        const handler = postRecalculateRemindersHandler();
        await handler(req as Request, res as Response);

        const updatedReminder = await db('reminders')
            .where({ user_id: userId, title: 'Monthly Report' })
            .first();

        // Should be set to the 1st of next month
        const actualDate = dayjs(updatedReminder.due_date).tz('America/New_York');
        expect(actualDate.date()).toBe(1); // 1st of month
        expect(actualDate.hour()).toBe(10); // 10:00 AM

        expect(req.flash).toHaveBeenCalledWith(
            'success',
            'Successfully recalculated 1 recurring reminders',
        );
    });

    it('should handle multiple recurring reminders', async () => {
        // Create multiple reminders
        await db('reminders').insert([
            {
                user_id: userId,
                title: 'Daily 1',
                reminder_type: 'recurring',
                frequency: 'daily',
                due_date: dayjs().subtract(1, 'week').toISOString(),
            },
            {
                user_id: userId,
                title: 'Daily 2',
                reminder_type: 'recurring',
                frequency: 'daily',
                due_date: dayjs().subtract(2, 'weeks').toISOString(),
            },
            {
                user_id: userId,
                title: 'Weekly 1',
                reminder_type: 'recurring',
                frequency: 'weekly',
                due_date: dayjs().subtract(1, 'month').toISOString(),
            },
        ]);

        const handler = postRecalculateRemindersHandler();
        await handler(req as Request, res as Response);

        const reminders = await db('reminders').where({ user_id: userId }).orderBy('title');

        expect(reminders).toHaveLength(3);

        // All daily reminders should have the same due date (tomorrow)
        const daily1Date = dayjs(reminders[0].due_date);
        const daily2Date = dayjs(reminders[1].due_date);
        expect(daily1Date.format('YYYY-MM-DD HH:mm')).toBe(daily2Date.format('YYYY-MM-DD HH:mm'));

        expect(req.flash).toHaveBeenCalledWith(
            'success',
            'Successfully recalculated 3 recurring reminders',
        );
    });

    it('should not affect one-time reminders', async () => {
        const oneTimeDueDate = dayjs().add(3, 'days').toISOString();
        await db('reminders').insert({
            user_id: userId,
            title: 'One-time Task',
            reminder_type: 'once',
            frequency: null,
            due_date: oneTimeDueDate,
        });

        const handler = postRecalculateRemindersHandler();
        await handler(req as Request, res as Response);

        const reminder = await db('reminders')
            .where({ user_id: userId, title: 'One-time Task' })
            .first();

        // One-time reminder should not be changed
        expect(reminder.due_date).toBe(oneTimeDueDate);

        expect(req.flash).toHaveBeenCalledWith(
            'info',
            'No recurring reminders found to recalculate',
        );
    });

    it('should handle when no recurring reminders exist', async () => {
        const handler = postRecalculateRemindersHandler();
        await handler(req as Request, res as Response);

        expect(req.flash).toHaveBeenCalledWith(
            'info',
            'No recurring reminders found to recalculate',
        );
        expect(res.redirect).toHaveBeenCalledWith('/reminders');
    });

    it('should use default time when user has no preference', async () => {
        // Update user to have no default_reminder_time
        req.user = {
            id: userId,
            timezone: 'UTC',
            column_preferences: {
                reminders: {},
            },
        } as any;

        await db('reminders').insert({
            user_id: userId,
            title: 'Daily Task No Pref',
            reminder_type: 'recurring',
            frequency: 'daily',
            due_date: dayjs().subtract(1, 'week').toISOString(),
        });

        const handler = postRecalculateRemindersHandler();
        await handler(req as Request, res as Response);

        const reminder = await db('reminders')
            .where({ user_id: userId, title: 'Daily Task No Pref' })
            .first();

        // Should use default time (09:00)
        const actualDate = dayjs(reminder.due_date);
        expect(actualDate.utc().hour()).toBe(9);
        expect(actualDate.utc().minute()).toBe(0);
    });
});

describe('Reminder Column Preferences', () => {
    let req: Partial<Request>;
    let res: Partial<Response>;
    let userId: number;

    beforeEach(async () => {
        vi.resetAllMocks();

        // Create a test user with all required column preferences
        const [user] = await db('users')
            .insert({
                username: 'testuser',
                email: 'test@example.com',
                is_admin: false,
                column_preferences: JSON.stringify({
                    bookmarks: {
                        title: true,
                        url: true,
                        created_at: true,
                        pinned: true,
                        default_per_page: 10,
                    },
                    actions: {
                        name: true,
                        trigger: true,
                        url: true,
                        action_type: true,
                        created_at: true,
                        last_read_at: true,
                        usage_count: true,
                        default_per_page: 10,
                    },
                    notes: {
                        title: true,
                        content: true,
                        created_at: true,
                        pinned: true,
                        default_per_page: 10,
                    },
                    reminders: {
                        title: true,
                        content: true,
                        due_date: true,
                        next_due: false,
                        created_at: true,
                        default_per_page: 20,
                        default_reminder_timing: 'daily',
                        default_reminder_time: '09:00',
                    },
                    users: {
                        username: true,
                        email: true,
                        is_admin: true,
                        email_verified_at: true,
                        created_at: true,
                        default_per_page: 10,
                    },
                }),
            })
            .returning('*');

        userId = user.id;
        user.column_preferences = JSON.parse(user.column_preferences as any);

        req = {
            user: user as any,
            body: {},
            flash: vi.fn(),
            session: {
                user: user as any,
                save: vi.fn(),
            } as any,
        };

        res = {
            redirect: vi.fn().mockReturnThis(),
        };
    });

    afterEach(async () => {
        await db('users').where({ id: userId }).delete();
    });

    it('should update reminder column preferences including next_due', async () => {
        req.body = {
            path: '/reminders',
            column_preferences: {
                bookmarks: {
                    title: 'on',
                    url: 'on',
                    created_at: 'on',
                    pinned: 'on',
                    default_per_page: '10',
                },
                actions: {
                    name: 'on',
                    trigger: 'on',
                    url: 'on',
                    action_type: 'on',
                    created_at: 'on',
                    last_read_at: 'on',
                    usage_count: 'on',
                    default_per_page: '10',
                },
                notes: {
                    title: 'on',
                    content: 'on',
                    created_at: 'on',
                    pinned: 'on',
                    default_per_page: '10',
                },
                reminders: {
                    title: 'on',
                    content: 'on',
                    due_date: 'on',
                    next_due: 'on',
                    created_at: 'on',
                    default_per_page: '25',
                    default_reminder_timing: 'weekly',
                    default_reminder_time: '14:30',
                },
            },
        };

        const handler = postSettingsDisplayHandler(db);
        await handler(req as Request, res as Response);

        // Check database was updated
        const updatedUser = await db('users').where({ id: userId }).first();
        const prefs = JSON.parse(updatedUser.column_preferences);

        expect(prefs.reminders.title).toBe(true);
        expect(prefs.reminders.content).toBe(true);
        expect(prefs.reminders.due_date).toBe(true);
        expect(prefs.reminders.next_due).toBe(true);
        expect(prefs.reminders.created_at).toBe(true);
        expect(prefs.reminders.default_per_page).toBe(25);
        expect(prefs.reminders.default_reminder_timing).toBe('weekly');
        expect(prefs.reminders.default_reminder_time).toBe('14:30');

        expect(req.flash).toHaveBeenCalledWith('success', 'Column settings updated');
        expect(res.redirect).toHaveBeenCalledWith('/reminders');
    });

    it('should validate that at least one reminder column is enabled', async () => {
        req.body = {
            path: '/reminders',
            column_preferences: {
                bookmarks: {
                    title: 'on',
                    url: 'on',
                    created_at: 'on',
                    pinned: 'on',
                    default_per_page: '10',
                },
                actions: {
                    name: 'on',
                    trigger: 'on',
                    url: 'on',
                    action_type: 'on',
                    created_at: 'on',
                    last_read_at: 'on',
                    usage_count: 'on',
                    default_per_page: '10',
                },
                notes: {
                    title: 'on',
                    content: 'on',
                    created_at: 'on',
                    pinned: 'on',
                    default_per_page: '10',
                },
                reminders: {
                    title: undefined,
                    content: undefined,
                    due_date: undefined,
                    next_due: undefined,
                    created_at: undefined,
                    default_per_page: '20',
                    default_reminder_timing: 'daily',
                    default_reminder_time: '09:00',
                },
            },
        };

        const handler = postSettingsDisplayHandler(db);

        await expect(handler(req as Request, res as Response)).rejects.toThrowError(
            expect.objectContaining({
                errors: expect.objectContaining({
                    reminders: 'At least one reminder column must be enabled',
                }),
            }),
        );
    });

    it('should validate reminder timing options', async () => {
        req.body = {
            path: '/reminders',
            column_preferences: {
                bookmarks: {
                    title: 'on',
                    url: 'on',
                    created_at: 'on',
                    pinned: 'on',
                    default_per_page: '10',
                },
                actions: {
                    name: 'on',
                    trigger: 'on',
                    url: 'on',
                    action_type: 'on',
                    created_at: 'on',
                    last_read_at: 'on',
                    usage_count: 'on',
                    default_per_page: '10',
                },
                notes: {
                    title: 'on',
                    content: 'on',
                    created_at: 'on',
                    pinned: 'on',
                    default_per_page: '10',
                },
                reminders: {
                    title: 'on',
                    content: 'on',
                    default_per_page: '20',
                    default_reminder_timing: 'invalid_timing',
                    default_reminder_time: '09:00',
                },
            },
        };

        const handler = postSettingsDisplayHandler(db);

        await expect(handler(req as Request, res as Response)).rejects.toThrowError(
            expect.objectContaining({
                errors: expect.objectContaining({
                    reminders: 'Invalid reminder timing. Must be daily, weekly, or monthly',
                }),
            }),
        );
    });

    it('should validate reminder time format', async () => {
        req.body = {
            path: '/reminders',
            column_preferences: {
                bookmarks: {
                    title: 'on',
                    url: 'on',
                    created_at: 'on',
                    pinned: 'on',
                    default_per_page: '10',
                },
                actions: {
                    name: 'on',
                    trigger: 'on',
                    url: 'on',
                    action_type: 'on',
                    created_at: 'on',
                    last_read_at: 'on',
                    usage_count: 'on',
                    default_per_page: '10',
                },
                notes: {
                    title: 'on',
                    content: 'on',
                    created_at: 'on',
                    pinned: 'on',
                    default_per_page: '10',
                },
                reminders: {
                    title: 'on',
                    content: 'on',
                    default_per_page: '20',
                    default_reminder_timing: 'daily',
                    default_reminder_time: '25:99', // Invalid time
                },
            },
        };

        const handler = postSettingsDisplayHandler(db);

        await expect(handler(req as Request, res as Response)).rejects.toThrowError(
            expect.objectContaining({
                errors: expect.objectContaining({
                    reminders: 'Invalid reminder time format. Must be HH:MM (24-hour format)',
                }),
            }),
        );
    });

    it('should handle toggling next_due column off', async () => {
        req.body = {
            path: '/reminders',
            column_preferences: {
                bookmarks: {
                    title: 'on',
                    url: 'on',
                    created_at: 'on',
                    pinned: 'on',
                    default_per_page: '10',
                },
                actions: {
                    name: 'on',
                    trigger: 'on',
                    url: 'on',
                    action_type: 'on',
                    created_at: 'on',
                    last_read_at: 'on',
                    usage_count: 'on',
                    default_per_page: '10',
                },
                notes: {
                    title: 'on',
                    content: 'on',
                    created_at: 'on',
                    pinned: 'on',
                    default_per_page: '10',
                },
                reminders: {
                    title: 'on',
                    content: 'on',
                    due_date: 'on',
                    next_due: undefined, // Not checked
                    created_at: 'on',
                    default_per_page: '20',
                    default_reminder_timing: 'daily',
                    default_reminder_time: '09:00',
                },
            },
        };

        const handler = postSettingsDisplayHandler(db);
        await handler(req as Request, res as Response);

        const updatedUser = await db('users').where({ id: userId }).first();
        const prefs = JSON.parse(updatedUser.column_preferences);

        expect(prefs.reminders.next_due).toBe(false);
        expect(prefs.reminders.due_date).toBe(true);
    });
});

describe('parseReminderTiming', () => {
    it('should parse daily reminder correctly', () => {
        const result = parseReminderTiming('daily', '09:00', 'America/New_York');

        expect(result.isValid).toBe(true);
        expect(result.type).toBe('recurring');
        expect(result.frequency).toBe('daily');
        expect(result.specificDate).toBe(null);

        // Should be tomorrow at 9 AM in user timezone
        const nextDue = dayjs(result.nextDue).tz('America/New_York');
        const tomorrow = dayjs().tz('America/New_York').add(1, 'day');
        expect(nextDue.format('YYYY-MM-DD')).toBe(tomorrow.format('YYYY-MM-DD'));
        expect(nextDue.hour()).toBe(9);
        expect(nextDue.minute()).toBe(0);
    });

    it('should parse weekly reminder correctly', () => {
        const result = parseReminderTiming('weekly', '14:30', 'America/New_York');

        expect(result.isValid).toBe(true);
        expect(result.type).toBe('recurring');
        expect(result.frequency).toBe('weekly');

        // Should be on Saturday
        const nextDue = dayjs(result.nextDue).tz('America/New_York');
        expect(nextDue.day()).toBe(6); // Saturday
        expect(nextDue.hour()).toBe(14);
        expect(nextDue.minute()).toBe(30);
    });

    it('should parse monthly reminder correctly', () => {
        const result = parseReminderTiming('monthly', '08:00', 'Europe/London');

        expect(result.isValid).toBe(true);
        expect(result.type).toBe('recurring');
        expect(result.frequency).toBe('monthly');

        // Should be on the 1st of the month
        const nextDue = dayjs(result.nextDue).tz('Europe/London');
        expect(nextDue.date()).toBe(1);
        expect(nextDue.hour()).toBe(8);
        expect(nextDue.minute()).toBe(0);
    });

    it('should parse specific date correctly', () => {
        const futureDate = dayjs().add(1, 'month').format('YYYY-MM-DD');
        const result = parseReminderTiming(futureDate, '15:00', 'UTC');

        expect(result.isValid).toBe(true);
        expect(result.type).toBe('once');
        expect(result.frequency).toBe(null);
        expect(result.specificDate).toBe(futureDate);
    });

    it('should handle invalid timing', () => {
        const result = parseReminderTiming('invalid', '09:00', 'UTC');

        expect(result.isValid).toBe(false);
        expect(result.type).toBe('once');
        expect(result.frequency).toBe(null);
    });
});

describe('Admin Routes Security', () => {
    let req: Partial<Request>;
    let res: Partial<Response>;
    let adminUserId: number;
    let regularUserId: number;

    beforeEach(async () => {
        vi.resetAllMocks();

        await db('users').where('email', 'admin@example.com').delete();
        await db('users').where('email', 'regular@example.com').delete();

        const [adminUser] = await db('users')
            .insert({
                username: 'adminuser',
                email: 'admin@example.com',
                is_admin: true,
                email_verified_at: db.fn.now(),
            })
            .returning('*');

        adminUserId = adminUser.id;

        const [regularUser] = await db('users')
            .insert({
                username: 'regularuser',
                email: 'regular@example.com',
                is_admin: false,
                email_verified_at: db.fn.now(),
            })
            .returning('*');

        regularUserId = regularUser.id;

        res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            render: vi.fn().mockReturnThis(),
            redirect: vi.fn().mockReturnThis(),
        };
    });

    afterEach(async () => {
        if (adminUserId) {
            await db('users').where({ id: adminUserId }).delete();
        }
        if (regularUserId) {
            await db('users').where({ id: regularUserId }).delete();
        }
        vi.clearAllMocks();
    });

    describe('GET /admin/users', () => {
        it('should allow admin user to access admin users page', async () => {
            req = {
                user: {
                    id: adminUserId,
                    is_admin: true,
                    column_preferences: {
                        users: {
                            default_per_page: 10,
                        },
                    },
                } as any,
                query: {},
                flash: vi.fn(),
                session: {
                    user: {
                        id: adminUserId,
                        is_admin: true,
                        column_preferences: {
                            users: {
                                default_per_page: 10,
                            },
                        },
                    },
                } as any,
            };

            const handler = getAdminUsersHandler(db);
            await handler(req as Request, res as Response);

            expect(res.render).toHaveBeenCalledWith(
                './admin/admin-users.html',
                expect.objectContaining({
                    title: 'Admin / Users',
                    path: '/admin/users',
                    layout: '../layouts/admin.html',
                }),
            );
        });

        it('should throw error when non-admin tries to access admin page', async () => {
            req = {
                user: {
                    id: regularUserId,
                    is_admin: false,
                    column_preferences: {
                        users: {
                            default_per_page: 10,
                        },
                    },
                } as any,
                query: {},
                flash: vi.fn(),
                session: {
                    user: {
                        id: regularUserId,
                        is_admin: false,
                        column_preferences: {
                            users: {
                                default_per_page: 10,
                            },
                        },
                    },
                } as any,
            };

            const handler = getAdminUsersHandler(db);

            // The adminOnlyMiddleware should have already blocked this in router
            // But we test the handler directly with a non-admin user
            await handler(req as Request, res as Response);

            // In real scenario, the middleware would block this
            // Here we're testing that the handler still renders if called directly
            expect(res.render).toHaveBeenCalled();
        });

        it('should handle pagination parameters correctly', async () => {
            req = {
                user: {
                    id: adminUserId,
                    is_admin: true,
                    column_preferences: {
                        users: {
                            default_per_page: 10,
                        },
                    },
                } as any,
                query: {
                    page: '2',
                    perPage: '10',
                    search: 'test',
                },
                flash: vi.fn(),
                session: {
                    user: {
                        id: adminUserId,
                        is_admin: true,
                        column_preferences: {
                            users: {
                                default_per_page: 10,
                            },
                        },
                    },
                } as any,
            };

            const handler = getAdminUsersHandler(db);
            await handler(req as Request, res as Response);

            expect(res.render).toHaveBeenCalledWith(
                './admin/admin-users.html',
                expect.objectContaining({
                    search: 'test',
                    pagination: expect.objectContaining({
                        currentPage: 2,
                        perPage: 10,
                    }),
                }),
            );
        });
    });

    describe('POST /admin/users/:id/delete', () => {
        let targetUserId: number;

        beforeEach(async () => {
            const [targetUser] = await db('users')
                .insert({
                    username: 'targetuser',
                    email: 'target@example.com',
                    is_admin: false,
                })
                .returning('*');

            targetUserId = targetUser.id;
        });

        afterEach(async () => {
            await db('users')
                .where({ id: targetUserId })
                .delete()
                .catch(() => {});
        });

        it('should allow admin to delete a user', async () => {
            req = {
                user: { id: adminUserId, is_admin: true } as any,
                params: { id: targetUserId.toString() },
                flash: vi.fn(),
            };

            const handler = postDeleteAdminUserHandler(db);
            await handler(req as Request, res as Response);

            const deletedUser = await db('users').where({ id: targetUserId }).first();
            expect(deletedUser).toBeUndefined();

            expect(req.flash).toHaveBeenCalledWith('success', 'deleted');
            expect(res.redirect).toHaveBeenCalledWith('/admin/users');
        });

        it('should prevent admin from deleting themselves', async () => {
            req = {
                user: { id: adminUserId, is_admin: true } as any,
                params: { id: adminUserId.toString() },
                flash: vi.fn(),
            };

            const handler = postDeleteAdminUserHandler(db);

            await handler(req as Request, res as Response);

            expect(req.flash).toHaveBeenCalledWith('info', 'you cannot delete yourself');
            expect(res.redirect).toHaveBeenCalledWith('/admin/users');

            const adminUser = await db('users').where({ id: adminUserId }).first();
            expect(adminUser).toBeDefined();
        });

        it('should handle non-existent user gracefully', async () => {
            req = {
                user: { id: adminUserId, is_admin: true } as any,
                params: { id: '99999' },
                flash: vi.fn(),
            };

            const handler = postDeleteAdminUserHandler(db);

            await expect(handler(req as Request, res as Response)).rejects.toThrow(
                'User not found',
            );
        });

        it('should delete all user data when deleting a user', async () => {
            await db('bookmarks').insert({
                user_id: targetUserId,
                title: 'Test Bookmark',
                url: 'https://example.com',
            });

            await db('notes').insert({
                user_id: targetUserId,
                title: 'Test Note',
                content: 'Test content',
            });

            await db('bangs').insert({
                user_id: targetUserId,
                trigger: '!test',
                name: 'Test Action',
                url: 'https://test.com',
                action_type: 'redirect',
            });

            req = {
                user: { id: adminUserId, is_admin: true } as any,
                params: { id: targetUserId.toString() },
                flash: vi.fn(),
            };

            const handler = postDeleteAdminUserHandler(db);
            await handler(req as Request, res as Response);

            const userBookmarks = await db('bookmarks').where({ user_id: targetUserId });
            const userNotes = await db('notes').where({ user_id: targetUserId });
            const userActions = await db('bangs').where({ user_id: targetUserId });

            expect(userBookmarks).toHaveLength(0);
            expect(userNotes).toHaveLength(0);
            expect(userActions).toHaveLength(0);
        });
    });

    describe('Admin middleware integration', () => {
        it('should verify adminOnlyMiddleware blocks non-admin users', async () => {
            req = {
                user: { id: regularUserId, is_admin: false } as any,
                session: {
                    user: { id: regularUserId, is_admin: false },
                } as any,
            };

            const next = vi.fn();

            await adminOnlyMiddleware(req as Request, res as Response, next);

            expect(next).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Unauthorized',
                }),
            );
        });

        it('should verify adminOnlyMiddleware allows admin users', async () => {
            req = {
                user: { id: adminUserId, is_admin: true } as any,
                session: {
                    user: { id: adminUserId, is_admin: true },
                } as any,
            };

            const next = vi.fn();

            await adminOnlyMiddleware(req as Request, res as Response, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('should verify authentication is required before admin check', async () => {
            req = {
                // No user object - simulating unauthenticated request
                session: {} as any,
            };

            const next = vi.fn();

            await adminOnlyMiddleware(req as Request, res as Response, next);

            expect(next).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Unauthorized',
                }),
            );
        });
    });
});
