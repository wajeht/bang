import { config } from '../config';
import { MailUtils } from './mail';
import { AuthUtils } from './auth';
import { dayjs, libs } from '../libs';
import { db } from '../tests/test-setup';
import { Logger } from '../utils/logger';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const logger = Logger();

describe('Mail Utils', () => {
    const mockContext = {
        libs,
        config,
        logger,
        db,
        utils: {
            auth: AuthUtils({ libs, config, logger, db } as any),
        },
    } as any;

    const mailUtils = MailUtils(mockContext);

    beforeEach(async () => {
        await db('users').del();
    });

    afterEach(async () => {
        await db('users').del();
        vi.restoreAllMocks();
    });

    describe('processVerificationReminders', () => {
        it('should find unverified users who registered 7+ days ago', async () => {
            const eightDaysAgo = dayjs().subtract(8, 'days').toISOString();
            await db('users').insert({
                username: 'unverified',
                email: 'unverified@example.com',
                email_verified_at: null,
                created_at: eightDaysAgo,
                updated_at: eightDaysAgo,
            });

            const sendEmailSpy = vi.spyOn(mailUtils, 'sendVerificationReminderEmail');
            sendEmailSpy.mockResolvedValue();

            await mailUtils.processVerificationReminders('http://localhost:3000');

            expect(sendEmailSpy).toHaveBeenCalledTimes(1);
            expect(sendEmailSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    email: 'unverified@example.com',
                    username: 'unverified',
                    token: expect.any(String),
                    baseUrl: 'http://localhost:3000',
                }),
            );
        });

        it('should not send reminders to verified users', async () => {
            const eightDaysAgo = dayjs().subtract(8, 'days').toISOString();
            await db('users').insert({
                username: 'verified',
                email: 'verified@example.com',
                email_verified_at: dayjs().toISOString(),
                created_at: eightDaysAgo,
                updated_at: eightDaysAgo,
            });

            const sendEmailSpy = vi.spyOn(mailUtils, 'sendVerificationReminderEmail');
            sendEmailSpy.mockResolvedValue();

            await mailUtils.processVerificationReminders('http://localhost:3000');

            expect(sendEmailSpy).not.toHaveBeenCalled();
        });

        it('should not send reminders to users who registered less than 7 days ago', async () => {
            const fiveDaysAgo = dayjs().subtract(5, 'days').toISOString();
            await db('users').insert({
                username: 'recent',
                email: 'recent@example.com',
                email_verified_at: null,
                created_at: fiveDaysAgo,
                updated_at: fiveDaysAgo,
            });

            const sendEmailSpy = vi.spyOn(mailUtils, 'sendVerificationReminderEmail');
            sendEmailSpy.mockResolvedValue();

            await mailUtils.processVerificationReminders('http://localhost:3000');

            expect(sendEmailSpy).not.toHaveBeenCalled();
        });

        it('should send reminders to multiple unverified users', async () => {
            const eightDaysAgo = dayjs().subtract(8, 'days').toISOString();
            const tenDaysAgo = dayjs().subtract(10, 'days').toISOString();

            await db('users').insert([
                {
                    username: 'unverified1',
                    email: 'unverified1@example.com',
                    email_verified_at: null,
                    created_at: eightDaysAgo,
                    updated_at: eightDaysAgo,
                },
                {
                    username: 'unverified2',
                    email: 'unverified2@example.com',
                    email_verified_at: null,
                    created_at: tenDaysAgo,
                    updated_at: tenDaysAgo,
                },
            ]);

            const sendEmailSpy = vi.spyOn(mailUtils, 'sendVerificationReminderEmail');
            sendEmailSpy.mockResolvedValue();

            await mailUtils.processVerificationReminders('http://localhost:3000');

            expect(sendEmailSpy).toHaveBeenCalledTimes(2);
            expect(sendEmailSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    email: 'unverified1@example.com',
                    username: 'unverified1',
                }),
            );
            expect(sendEmailSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    email: 'unverified2@example.com',
                    username: 'unverified2',
                }),
            );
        });

        it('should generate valid magic link tokens', async () => {
            const eightDaysAgo = dayjs().subtract(8, 'days').toISOString();
            await db('users').insert({
                username: 'unverified',
                email: 'unverified@example.com',
                email_verified_at: null,
                created_at: eightDaysAgo,
                updated_at: eightDaysAgo,
            });

            const sendEmailSpy = vi.spyOn(mailUtils, 'sendVerificationReminderEmail');
            sendEmailSpy.mockResolvedValue();

            await mailUtils.processVerificationReminders('http://localhost:3000');

            const callArgs = sendEmailSpy.mock.calls[0][0];
            const token = callArgs.token;

            const decoded = mockContext.utils.auth.verifyMagicLink(token);
            expect(decoded).not.toBeNull();
            expect(decoded?.email).toBe('unverified@example.com');
        });

        it('should handle mixed scenarios correctly', async () => {
            const eightDaysAgo = dayjs().subtract(8, 'days').toISOString();
            const fiveDaysAgo = dayjs().subtract(5, 'days').toISOString();
            const tenDaysAgo = dayjs().subtract(10, 'days').toISOString();

            await db('users').insert([
                {
                    username: 'unverified_old',
                    email: 'unverified_old@example.com',
                    email_verified_at: null,
                    created_at: eightDaysAgo,
                    updated_at: eightDaysAgo,
                },
                {
                    username: 'verified_old',
                    email: 'verified_old@example.com',
                    email_verified_at: dayjs().toISOString(),
                    created_at: tenDaysAgo,
                    updated_at: tenDaysAgo,
                },
                {
                    username: 'unverified_recent',
                    email: 'unverified_recent@example.com',
                    email_verified_at: null,
                    created_at: fiveDaysAgo,
                    updated_at: fiveDaysAgo,
                },
                {
                    username: 'unverified_very_old',
                    email: 'unverified_very_old@example.com',
                    email_verified_at: null,
                    created_at: tenDaysAgo,
                    updated_at: tenDaysAgo,
                },
            ]);

            const sendEmailSpy = vi.spyOn(mailUtils, 'sendVerificationReminderEmail');
            sendEmailSpy.mockResolvedValue();

            await mailUtils.processVerificationReminders('http://localhost:3000');

            expect(sendEmailSpy).toHaveBeenCalledTimes(2);

            const emailsSent = sendEmailSpy.mock.calls.map((call) => call[0].email);
            expect(emailsSent).toContain('unverified_old@example.com');
            expect(emailsSent).toContain('unverified_very_old@example.com');
            expect(emailsSent).not.toContain('verified_old@example.com');
            expect(emailsSent).not.toContain('unverified_recent@example.com');
        });

        it('should handle no unverified users gracefully', async () => {
            const sendEmailSpy = vi.spyOn(mailUtils, 'sendVerificationReminderEmail');
            sendEmailSpy.mockResolvedValue();

            await expect(
                mailUtils.processVerificationReminders('http://localhost:3000'),
            ).resolves.not.toThrow();

            expect(sendEmailSpy).not.toHaveBeenCalled();
        });
    });

    describe('processReminderDigests', () => {
        let testUser: any;

        beforeEach(async () => {
            [testUser] = await db('users')
                .insert({
                    username: 'testuser',
                    email: 'testuser@example.com',
                    email_verified_at: dayjs().toISOString(),
                    timezone: 'UTC',
                })
                .returning('*');
        });

        it('should process one-time reminders and delete them', async () => {
            const dueDate = dayjs.utc().add(5, 'minutes').toISOString();

            await db('reminders').insert({
                user_id: testUser.id,
                title: 'One-time reminder',
                content: 'https://example.com',
                reminder_type: 'once',
                due_date: dueDate,
            });

            const sendEmailSpy = vi.spyOn(mailUtils, 'sendReminderDigestEmail');
            sendEmailSpy.mockResolvedValue();

            await mailUtils.processReminderDigests();

            expect(sendEmailSpy).toHaveBeenCalledTimes(1);
            expect(sendEmailSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    email: 'testuser@example.com',
                    username: 'testuser',
                    reminders: expect.arrayContaining([
                        expect.objectContaining({
                            title: 'One-time reminder',
                            reminder_type: 'once',
                        }),
                    ]),
                }),
            );

            const remainingReminders = await db('reminders').where({ user_id: testUser.id });
            expect(remainingReminders).toHaveLength(0);
        });

        it('should process daily recurring reminders and reschedule them', async () => {
            const dueDate = dayjs.utc().add(5, 'minutes').toISOString();

            const [reminder] = await db('reminders')
                .insert({
                    user_id: testUser.id,
                    title: 'Daily reminder',
                    content: 'Do daily task',
                    reminder_type: 'recurring',
                    frequency: 'daily',
                    due_date: dueDate,
                })
                .returning('*');

            const sendEmailSpy = vi.spyOn(mailUtils, 'sendReminderDigestEmail');
            sendEmailSpy.mockResolvedValue();

            await mailUtils.processReminderDigests();

            expect(sendEmailSpy).toHaveBeenCalledTimes(1);

            const remainingReminders = await db('reminders').where({ id: reminder.id });
            expect(remainingReminders).toHaveLength(1);

            const updatedReminder = remainingReminders[0];
            const expectedNextDue = dayjs.utc(dueDate).add(1, 'day');
            const actualNextDue = dayjs.utc(updatedReminder.due_date);

            expect(Math.abs(actualNextDue.diff(expectedNextDue, 'seconds'))).toBeLessThan(2);
        });

        it('should process weekly recurring reminders and reschedule them', async () => {
            const dueDate = dayjs.utc().add(5, 'minutes').toISOString();

            const [reminder] = await db('reminders')
                .insert({
                    user_id: testUser.id,
                    title: 'Weekly reminder',
                    content: 'Weekly task',
                    reminder_type: 'recurring',
                    frequency: 'weekly',
                    due_date: dueDate,
                })
                .returning('*');

            const sendEmailSpy = vi.spyOn(mailUtils, 'sendReminderDigestEmail');
            sendEmailSpy.mockResolvedValue();

            await mailUtils.processReminderDigests();

            expect(sendEmailSpy).toHaveBeenCalledTimes(1);

            const remainingReminders = await db('reminders').where({ id: reminder.id });
            expect(remainingReminders).toHaveLength(1);

            const updatedReminder = remainingReminders[0];
            const actualNextDue = dayjs.utc(updatedReminder.due_date);
            const originalDue = dayjs.utc(dueDate);

            expect(actualNextDue.isAfter(originalDue)).toBe(true);

            expect(actualNextDue.day()).toBe(6);
        });

        it('should process monthly recurring reminders and reschedule them', async () => {
            const dueDate = dayjs.utc().add(5, 'minutes').toISOString();

            const [reminder] = await db('reminders')
                .insert({
                    user_id: testUser.id,
                    title: 'Monthly reminder',
                    content: 'Monthly task',
                    reminder_type: 'recurring',
                    frequency: 'monthly',
                    due_date: dueDate,
                })
                .returning('*');

            const sendEmailSpy = vi.spyOn(mailUtils, 'sendReminderDigestEmail');
            sendEmailSpy.mockResolvedValue();

            await mailUtils.processReminderDigests();

            expect(sendEmailSpy).toHaveBeenCalledTimes(1);

            const remainingReminders = await db('reminders').where({ id: reminder.id });
            expect(remainingReminders).toHaveLength(1);

            const updatedReminder = remainingReminders[0];
            const expectedNextDue = dayjs.utc(dueDate).add(1, 'month').date(1);
            const actualNextDue = dayjs.utc(updatedReminder.due_date);

            expect(actualNextDue.date()).toBe(1);
            expect(actualNextDue.isAfter(dayjs.utc(dueDate))).toBe(true);
        });

        it('should group multiple reminders for the same user', async () => {
            const dueDate = dayjs.utc().add(5, 'minutes').toISOString();

            await db('reminders').insert([
                {
                    user_id: testUser.id,
                    title: 'Reminder 1',
                    content: 'Task 1',
                    reminder_type: 'once',
                    due_date: dueDate,
                },
                {
                    user_id: testUser.id,
                    title: 'Reminder 2',
                    content: 'Task 2',
                    reminder_type: 'once',
                    due_date: dueDate,
                },
                {
                    user_id: testUser.id,
                    title: 'Reminder 3',
                    content: 'Task 3',
                    reminder_type: 'once',
                    due_date: dueDate,
                },
            ]);

            const sendEmailSpy = vi.spyOn(mailUtils, 'sendReminderDigestEmail');
            sendEmailSpy.mockResolvedValue();

            await mailUtils.processReminderDigests();

            expect(sendEmailSpy).toHaveBeenCalledTimes(1);
            expect(sendEmailSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    email: 'testuser@example.com',
                    reminders: expect.arrayContaining([
                        expect.objectContaining({ title: 'Reminder 1' }),
                        expect.objectContaining({ title: 'Reminder 2' }),
                        expect.objectContaining({ title: 'Reminder 3' }),
                    ]),
                }),
            );
        });

        it('should send separate emails to different users', async () => {
            const [testUser2] = await db('users')
                .insert({
                    username: 'testuser2',
                    email: 'testuser2@example.com',
                    email_verified_at: dayjs().toISOString(),
                    timezone: 'UTC',
                })
                .returning('*');

            const dueDate = dayjs.utc().add(5, 'minutes').toISOString();

            await db('reminders').insert([
                {
                    user_id: testUser.id,
                    title: 'User 1 reminder',
                    content: 'Task 1',
                    reminder_type: 'once',
                    due_date: dueDate,
                },
                {
                    user_id: testUser2.id,
                    title: 'User 2 reminder',
                    content: 'Task 2',
                    reminder_type: 'once',
                    due_date: dueDate,
                },
            ]);

            const sendEmailSpy = vi.spyOn(mailUtils, 'sendReminderDigestEmail');
            sendEmailSpy.mockResolvedValue();

            await mailUtils.processReminderDigests();

            expect(sendEmailSpy).toHaveBeenCalledTimes(2);
            expect(sendEmailSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    email: 'testuser@example.com',
                }),
            );
            expect(sendEmailSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    email: 'testuser2@example.com',
                }),
            );
        });

        it('should not process reminders outside the 15 minute window', async () => {
            const tooSoon = dayjs.utc().subtract(1, 'minute').toISOString();
            const tooLate = dayjs.utc().add(20, 'minutes').toISOString();

            await db('reminders').insert([
                {
                    user_id: testUser.id,
                    title: 'Past reminder',
                    content: 'Already passed',
                    reminder_type: 'once',
                    due_date: tooSoon,
                },
                {
                    user_id: testUser.id,
                    title: 'Future reminder',
                    content: 'Too far in future',
                    reminder_type: 'once',
                    due_date: tooLate,
                },
            ]);

            const sendEmailSpy = vi.spyOn(mailUtils, 'sendReminderDigestEmail');
            sendEmailSpy.mockResolvedValue();

            await mailUtils.processReminderDigests();

            expect(sendEmailSpy).not.toHaveBeenCalled();
        });

        it('should handle no due reminders gracefully', async () => {
            const sendEmailSpy = vi.spyOn(mailUtils, 'sendReminderDigestEmail');
            sendEmailSpy.mockResolvedValue();

            await expect(mailUtils.processReminderDigests()).resolves.not.toThrow();

            expect(sendEmailSpy).not.toHaveBeenCalled();
        });

        describe('DST handling', () => {
            it('should preserve local time for daily reminders during DST spring forward transition', async () => {
                const [chicagoUser] = await db('users')
                    .insert({
                        username: 'chicago_user',
                        email: 'chicago@example.com',
                        email_verified_at: dayjs().toISOString(),
                        timezone: 'America/Chicago',
                    })
                    .returning('*');

                // Set a daily reminder for 6:00 AM Chicago time (before DST spring forward)
                // March 9, 2025 at 6:00 AM CST = 12:00 UTC
                const beforeDST = dayjs
                    .tz('2025-03-09 06:00:00', 'America/Chicago')
                    .utc()
                    .toISOString();

                const [reminder] = await db('reminders')
                    .insert({
                        user_id: chicagoUser.id,
                        title: 'Daily 6am reminder',
                        content: 'Should always be 6am local',
                        reminder_type: 'recurring',
                        frequency: 'daily',
                        due_date: beforeDST,
                    })
                    .returning('*');

                const sendEmailSpy = vi.spyOn(mailUtils, 'sendReminderDigestEmail');
                sendEmailSpy.mockResolvedValue();

                await mailUtils.processReminderDigests();

                // Get the updated reminder
                const [updatedReminder] = await db('reminders').where({ id: reminder.id });

                // Next day is March 10, 2025 (after DST spring forward)
                // Should still be 6:00 AM CDT (now UTC-5), which is 11:00 UTC
                const nextDueChicago = dayjs
                    .tz(updatedReminder.due_date, 'UTC')
                    .tz('America/Chicago');

                expect(nextDueChicago.hour()).toBe(6);
                expect(nextDueChicago.minute()).toBe(0);
            });

            it('should preserve local time for daily reminders during DST fall back transition', async () => {
                // Create user in America/Chicago timezone
                const [chicagoUser] = await db('users')
                    .insert({
                        username: 'chicago_user2',
                        email: 'chicago2@example.com',
                        email_verified_at: dayjs().toISOString(),
                        timezone: 'America/Chicago',
                    })
                    .returning('*');

                // Set a daily reminder for 6:00 AM Chicago time (before DST fall back)
                // November 2, 2025 at 6:00 AM CDT = 11:00 UTC
                const beforeDST = dayjs
                    .tz('2025-11-02 06:00:00', 'America/Chicago')
                    .utc()
                    .toISOString();

                const [reminder] = await db('reminders')
                    .insert({
                        user_id: chicagoUser.id,
                        title: 'Daily 6am reminder',
                        content: 'Should always be 6am local',
                        reminder_type: 'recurring',
                        frequency: 'daily',
                        due_date: beforeDST,
                    })
                    .returning('*');

                const sendEmailSpy = vi.spyOn(mailUtils, 'sendReminderDigestEmail');
                sendEmailSpy.mockResolvedValue();

                await mailUtils.processReminderDigests();

                // Get the updated reminder
                const [updatedReminder] = await db('reminders').where({ id: reminder.id });

                // Next day is November 3, 2025 (after DST fall back)
                // Should still be 6:00 AM CST (now UTC-6), which is 12:00 UTC
                const nextDueChicago = dayjs
                    .tz(updatedReminder.due_date, 'UTC')
                    .tz('America/Chicago');

                expect(nextDueChicago.hour()).toBe(6);
                expect(nextDueChicago.minute()).toBe(0);
            });

            it('should preserve local time for weekly reminders across DST transitions', async () => {
                const [chicagoUser] = await db('users')
                    .insert({
                        username: 'chicago_user3',
                        email: 'chicago3@example.com',
                        email_verified_at: dayjs().toISOString(),
                        timezone: 'America/Chicago',
                    })
                    .returning('*');

                // Saturday March 8, 2025 at 9:00 AM CST (before DST)
                const beforeDST = dayjs
                    .tz('2025-03-08 09:00:00', 'America/Chicago')
                    .utc()
                    .toISOString();

                const [reminder] = await db('reminders')
                    .insert({
                        user_id: chicagoUser.id,
                        title: 'Weekly 9am reminder',
                        content: 'Weekly task',
                        reminder_type: 'recurring',
                        frequency: 'weekly',
                        due_date: beforeDST,
                    })
                    .returning('*');

                const sendEmailSpy = vi.spyOn(mailUtils, 'sendReminderDigestEmail');
                sendEmailSpy.mockResolvedValue();

                await mailUtils.processReminderDigests();

                const [updatedReminder] = await db('reminders').where({ id: reminder.id });

                // Next Saturday is March 15, 2025 (after DST spring forward)
                const nextDueChicago = dayjs
                    .tz(updatedReminder.due_date, 'UTC')
                    .tz('America/Chicago');

                expect(nextDueChicago.hour()).toBe(9);
                expect(nextDueChicago.minute()).toBe(0);
                expect(nextDueChicago.day()).toBe(6); // Saturday
            });

            it('should preserve local time for monthly reminders across DST transitions', async () => {
                const [chicagoUser] = await db('users')
                    .insert({
                        username: 'chicago_user4',
                        email: 'chicago4@example.com',
                        email_verified_at: dayjs().toISOString(),
                        timezone: 'America/Chicago',
                    })
                    .returning('*');

                // February 1, 2025 at 10:00 AM CST (before DST)
                const beforeDST = dayjs
                    .tz('2025-02-01 10:00:00', 'America/Chicago')
                    .utc()
                    .toISOString();

                const [reminder] = await db('reminders')
                    .insert({
                        user_id: chicagoUser.id,
                        title: 'Monthly 10am reminder',
                        content: 'Monthly task',
                        reminder_type: 'recurring',
                        frequency: 'monthly',
                        due_date: beforeDST,
                    })
                    .returning('*');

                const sendEmailSpy = vi.spyOn(mailUtils, 'sendReminderDigestEmail');
                sendEmailSpy.mockResolvedValue();

                await mailUtils.processReminderDigests();

                const [updatedReminder] = await db('reminders').where({ id: reminder.id });

                // Next month is March 1, 2025 (before DST, still CST)
                const nextDueChicago = dayjs
                    .tz(updatedReminder.due_date, 'UTC')
                    .tz('America/Chicago');

                expect(nextDueChicago.hour()).toBe(10);
                expect(nextDueChicago.minute()).toBe(0);
                expect(nextDueChicago.date()).toBe(1); // First of month
            });

            it('should handle multiple daily reminders at same local time for DST timezone user', async () => {
                const [chicagoUser] = await db('users')
                    .insert({
                        username: 'chicago_batch',
                        email: 'chicago_batch@example.com',
                        email_verified_at: dayjs().toISOString(),
                        timezone: 'America/Chicago',
                    })
                    .returning('*');

                // All reminders due in 5 minutes from now
                const dueDate = dayjs.utc().add(5, 'minutes').toISOString();

                await db('reminders').insert([
                    {
                        user_id: chicagoUser.id,
                        title: 'Reminder 1',
                        content: 'Task 1',
                        reminder_type: 'recurring',
                        frequency: 'daily',
                        due_date: dueDate,
                    },
                    {
                        user_id: chicagoUser.id,
                        title: 'Reminder 2',
                        content: 'Task 2',
                        reminder_type: 'recurring',
                        frequency: 'daily',
                        due_date: dueDate,
                    },
                    {
                        user_id: chicagoUser.id,
                        title: 'Reminder 3',
                        content: 'Task 3',
                        reminder_type: 'recurring',
                        frequency: 'daily',
                        due_date: dueDate,
                    },
                ]);

                const sendEmailSpy = vi.spyOn(mailUtils, 'sendReminderDigestEmail');
                sendEmailSpy.mockResolvedValue();

                await mailUtils.processReminderDigests();

                // Should send only ONE email with all 3 reminders grouped together
                expect(sendEmailSpy).toHaveBeenCalledTimes(1);
                expect(sendEmailSpy).toHaveBeenCalledWith(
                    expect.objectContaining({
                        email: 'chicago_batch@example.com',
                        reminders: expect.arrayContaining([
                            expect.objectContaining({ title: 'Reminder 1' }),
                            expect.objectContaining({ title: 'Reminder 2' }),
                            expect.objectContaining({ title: 'Reminder 3' }),
                        ]),
                    }),
                );

                // All reminders should be rescheduled to the same time
                const updatedReminders = await db('reminders').where({
                    user_id: chicagoUser.id,
                });

                expect(updatedReminders).toHaveLength(3);

                // Check they all have the same due_date
                const dueDates = updatedReminders.map((r: any) => r.due_date);
                expect(new Set(dueDates).size).toBe(1); // All same

                // Check they're all scheduled for the next day at the same local time
                dueDates.forEach((nextDueDate: string) => {
                    const originalChicagoTime = dayjs.tz(dueDate, 'UTC').tz('America/Chicago');
                    const nextChicagoTime = dayjs.tz(nextDueDate, 'UTC').tz('America/Chicago');

                    // Should preserve the same hour and minute in local time
                    expect(nextChicagoTime.hour()).toBe(originalChicagoTime.hour());
                    expect(nextChicagoTime.minute()).toBe(originalChicagoTime.minute());

                    // Should be approximately 1 day later
                    const daysDiff = nextChicagoTime.diff(originalChicagoTime, 'days');
                    expect(daysDiff).toBe(1);
                });
            });
        });
    });
});
