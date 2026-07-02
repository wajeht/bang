/// <reference lib="esnext.temporal" />

import { config } from '../config.js';
import { createMail } from './mail.js';
import { createAuth } from './auth.js';
import { createDate } from './date.js';
import { createHtml } from './html.js';
import { libs } from '../libs.js';
import { db } from '../tests/test-setup.js';
import { createLogger } from '../utils/logger.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vite-plus/test';

const logger = createLogger();

describe('Mail Utils', () => {
    const mockContext = {
        libs,
        config,
        logger,
        db,
        utils: {
            auth: createAuth({ libs, config, logger, db } as any),
            date: null as any,
            html: createHtml(),
        },
    } as any;
    mockContext.utils.date = createDate(mockContext);

    const mailUtils = createMail(mockContext);

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('processVerificationReminders', () => {
        it('should find unverified users who registered 7+ days ago', async () => {
            const eightDaysAgo = isoBeforeNow({ days: 8 });
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
            const eightDaysAgo = isoBeforeNow({ days: 8 });
            await db('users').insert({
                username: 'verified',
                email: 'verified@example.com',
                email_verified_at: isoNow(),
                created_at: eightDaysAgo,
                updated_at: eightDaysAgo,
            });

            const sendEmailSpy = vi.spyOn(mailUtils, 'sendVerificationReminderEmail');
            sendEmailSpy.mockResolvedValue();

            await mailUtils.processVerificationReminders('http://localhost:3000');

            expect(sendEmailSpy).not.toHaveBeenCalled();
        });

        it('should not send reminders to users who registered less than 7 days ago', async () => {
            const fiveDaysAgo = isoBeforeNow({ days: 5 });
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
            const eightDaysAgo = isoBeforeNow({ days: 8 });
            const tenDaysAgo = isoBeforeNow({ days: 10 });

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
            const eightDaysAgo = isoBeforeNow({ days: 8 });
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

            const decoded = await mockContext.utils.auth.verifyMagicLink(token);
            expect(decoded).not.toBeNull();
            expect(decoded?.email).toBe('unverified@example.com');
        });

        it('should handle mixed scenarios correctly', async () => {
            const eightDaysAgo = isoBeforeNow({ days: 8 });
            const fiveDaysAgo = isoBeforeNow({ days: 5 });
            const tenDaysAgo = isoBeforeNow({ days: 10 });

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
                    email_verified_at: isoNow(),
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

    describe('sendReminderDigestEmail', () => {
        let sendMailMock: ReturnType<typeof vi.fn>;
        let testMailUtils: ReturnType<typeof createMail>;

        beforeEach(async () => {
            const { createSettingsRepository } =
                await import('../routes/admin/settings.repository');

            sendMailMock = vi.fn().mockResolvedValue({ messageId: 'test-id' });

            const mockNodemailer = {
                createTransport: vi.fn().mockReturnValue({ sendMail: sendMailMock }),
            };

            const prodConfig = {
                ...config,
                app: { ...config.app, env: 'production' },
            };

            const mockLogger = {
                error: vi.fn(),
                info: vi.fn(),
                box: vi.fn(),
                table: vi.fn(),
                tag: vi.fn().mockReturnThis(),
            };

            const mailContext = {
                db,
                config: prodConfig,
                libs: { ...libs, nodemailer: mockNodemailer },
                logger: mockLogger,
                models: { settings: createSettingsRepository({ db, config, libs } as any) },
                utils: {
                    date: null as any,
                    html: createHtml(),
                },
            };
            mailContext.utils.date = createDate(mailContext as any);
            testMailUtils = createMail(mailContext as any);
        });

        it('should not send email when reminders array is empty', async () => {
            await testMailUtils.sendReminderDigestEmail({
                email: 'test@example.com',
                username: 'TestUser',
                reminders: [],
                date: '2025-08-16',
            });

            expect(sendMailMock).not.toHaveBeenCalled();
        });

        it('should send email with clickable links in HTML', async () => {
            const reminders = [
                {
                    id: 1,
                    title: 'AI Agent Best Practices',
                    url: 'https://forgecode.dev/blog/ai-agent-best-practices/',
                    reminder_type: 'recurring' as const,
                    frequency: 'weekly' as const,
                },
                {
                    id: 2,
                    title: 'Meeting with team',
                    reminder_type: 'once' as const,
                },
            ];

            await testMailUtils.sendReminderDigestEmail({
                email: 'test@example.com',
                username: 'TestUser',
                reminders,
                date: '2025-08-16',
            });

            expect(sendMailMock).toHaveBeenCalledTimes(1);
            const emailArgs = sendMailMock.mock.calls[0][0];

            expect(emailArgs.to).toBe('test@example.com');
            expect(emailArgs.subject).toContain('Reminders');
            expect(emailArgs.subject).toContain('Saturday, August 16, 2025');
            expect(emailArgs.html).toContain('Hello TestUser');
            expect(emailArgs.html).toContain(
                '<a href="https://forgecode.dev/blog/ai-agent-best-practices/">AI Agent Best Practices</a>',
            );
            expect(emailArgs.html).toContain('<li>Meeting with team</li>');
        });

        it('should show "weekly reminders" when all reminders are weekly recurring', async () => {
            const reminders = [
                {
                    id: 1,
                    title: 'Weekly Report',
                    reminder_type: 'recurring' as const,
                    frequency: 'weekly' as const,
                },
                {
                    id: 2,
                    title: 'Weekly Review',
                    reminder_type: 'recurring' as const,
                    frequency: 'weekly' as const,
                },
            ];

            await testMailUtils.sendReminderDigestEmail({
                email: 'test@example.com',
                username: 'TestUser',
                reminders,
                date: '2025-08-16',
            });

            const emailArgs = sendMailMock.mock.calls[0][0];
            expect(emailArgs.html).toContain('weekly reminders');
        });

        it('should show "reminders" when reminder types are mixed', async () => {
            const reminders = [
                {
                    id: 1,
                    title: 'Daily standup',
                    reminder_type: 'recurring' as const,
                    frequency: 'daily' as const,
                },
                {
                    id: 2,
                    title: 'Doctor appointment',
                    reminder_type: 'once' as const,
                },
                {
                    id: 3,
                    title: 'Weekly review',
                    reminder_type: 'recurring' as const,
                    frequency: 'weekly' as const,
                },
            ];

            await testMailUtils.sendReminderDigestEmail({
                email: 'test@example.com',
                username: 'TestUser',
                reminders,
                date: '2025-08-16',
            });

            const emailArgs = sendMailMock.mock.calls[0][0];
            expect(emailArgs.html).toContain('your reminders for');
            expect(emailArgs.html).not.toContain('weekly reminders');
            expect(emailArgs.html).not.toContain('daily reminders');
        });
    });

    describe('processReminderDigests', () => {
        let testUser: any;

        beforeEach(async () => {
            // Update the global test user for this test suite's needs
            await db('users').where({ id: 1 }).update({
                email_verified_at: isoNow(),
                timezone: 'UTC',
            });
            testUser = await db('users').where({ id: 1 }).first();
        });

        it('should process one-time reminders and delete them', async () => {
            const dueDate = isoFromNow({ minutes: 5 });

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
                    email: 'test@example.com',
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
            const dueDate = isoFromNow({ minutes: 5 });

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
            const expectedNextDue = zdt(dueDate).add({ days: 1 });
            const actualNextDue = zdt(updatedReminder.due_date);

            expect(secondsBetween(actualNextDue, expectedNextDue)).toBeLessThan(2);
        });

        it('should process weekly recurring reminders and reschedule them', async () => {
            const dueDate = isoFromNow({ minutes: 5 });

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
            const actualNextDue = zdt(updatedReminder.due_date);
            const originalDue = zdt(dueDate);

            expect(isAfter(actualNextDue, originalDue)).toBe(true);

            expect(actualNextDue.dayOfWeek).toBe(6);
        });

        it('should process monthly recurring reminders and reschedule them', async () => {
            const dueDate = isoFromNow({ minutes: 5 });

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
            const expectedNextDue = zdt(dueDate).add({ months: 1 }).with({ day: 1 });
            const actualNextDue = zdt(updatedReminder.due_date);

            // Monthly reminders should be rescheduled to the 1st of next month
            expect(actualNextDue.day).toBe(1);
            expect(actualNextDue.month).toBe(expectedNextDue.month);
            expect(isAfter(actualNextDue, dueDate)).toBe(true);
        });

        it('should group multiple reminders for the same user', async () => {
            const dueDate = isoFromNow({ minutes: 5 });

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
                    email: 'test@example.com',
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
                    email_verified_at: isoNow(),
                    timezone: 'UTC',
                })
                .returning('*');

            const dueDate = isoFromNow({ minutes: 5 });

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
                    email: 'test@example.com',
                }),
            );
            expect(sendEmailSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    email: 'testuser2@example.com',
                }),
            );
        });

        it('should not process reminders outside the 15 minute window', async () => {
            const tooSoon = isoBeforeNow({ minutes: 1 });
            const tooLate = isoFromNow({ minutes: 20 });

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

        it('should allow daily reminders to be processed multiple times', async () => {
            const dueDate = Temporal.Now.instant().add({ minutes: 5 });

            await db('reminders').insert({
                user_id: testUser.id,
                title: 'Multi-day daily reminder',
                content: 'Daily task',
                reminder_type: 'recurring',
                frequency: 'daily',
                due_date: dueDate.toString(),
            });

            const sendEmailSpy = vi.spyOn(mailUtils, 'sendReminderDigestEmail');
            sendEmailSpy.mockResolvedValue();

            await mailUtils.processReminderDigests();

            let reminder = await db('reminders').where('title', 'Multi-day daily reminder').first();
            expect(reminder).toBeTruthy();
            expect(isAfter(reminder.due_date, dueDate)).toBe(true);

            const nextDueDate = Temporal.Now.instant().add({ minutes: 5 });
            await db('reminders')
                .where('title', 'Multi-day daily reminder')
                .update({ due_date: nextDueDate.toString() });

            await mailUtils.processReminderDigests();

            reminder = await db('reminders').where('title', 'Multi-day daily reminder').first();
            expect(reminder).toBeTruthy();

            const originalChicago = zdt(nextDueDate, 'America/Chicago');
            const updatedChicago = zdt(reminder.due_date, 'America/Chicago');
            expect(updatedChicago.hour).toBe(originalChicago.hour);
            expect(updatedChicago.minute).toBe(originalChicago.minute);
            expect(updatedChicago.toPlainDate().since(originalChicago.toPlainDate()).days).toBe(1);
        });

        describe('DST handling', () => {
            it('should preserve local time for daily reminders during DST spring forward transition', async () => {
                const [chicagoUser] = await db('users')
                    .insert({
                        username: 'chicago_user',
                        email: 'chicago@example.com',
                        email_verified_at: isoNow(),
                        timezone: 'America/Chicago',
                    })
                    .returning('*');

                // Set a daily reminder for 6:00 AM Chicago time (before DST spring forward)
                // March 9, 2025 at 6:00 AM CST = 12:00 UTC
                const beforeDST = isoFromLocal('2025-03-09 06:00:00', 'America/Chicago');

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
                const nextDueChicago = zdt(updatedReminder.due_date, 'America/Chicago');

                expect(nextDueChicago.hour).toBe(6);
                expect(nextDueChicago.minute).toBe(0);
            });

            it('should preserve local time for daily reminders during DST fall back transition', async () => {
                // Create user in America/Chicago timezone
                const [chicagoUser] = await db('users')
                    .insert({
                        username: 'chicago_user2',
                        email: 'chicago2@example.com',
                        email_verified_at: isoNow(),
                        timezone: 'America/Chicago',
                    })
                    .returning('*');

                // Set a daily reminder for 6:00 AM Chicago time (before DST fall back)
                // November 2, 2025 at 6:00 AM CDT = 11:00 UTC
                const beforeDST = isoFromLocal('2025-11-02 06:00:00', 'America/Chicago');

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
                const nextDueChicago = zdt(updatedReminder.due_date, 'America/Chicago');

                expect(nextDueChicago.hour).toBe(6);
                expect(nextDueChicago.minute).toBe(0);
            });

            it('should preserve local time for weekly reminders across DST transitions', async () => {
                const [chicagoUser] = await db('users')
                    .insert({
                        username: 'chicago_user3',
                        email: 'chicago3@example.com',
                        email_verified_at: isoNow(),
                        timezone: 'America/Chicago',
                    })
                    .returning('*');

                // Saturday March 8, 2025 at 9:00 AM CST (before DST)
                const beforeDST = isoFromLocal('2025-03-08 09:00:00', 'America/Chicago');

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
                const nextDueChicago = zdt(updatedReminder.due_date, 'America/Chicago');

                expect(nextDueChicago.hour).toBe(9);
                expect(nextDueChicago.minute).toBe(0);
                expect(nextDueChicago.dayOfWeek).toBe(6); // Saturday
            });

            it('should preserve local time for monthly reminders across DST transitions', async () => {
                const [chicagoUser] = await db('users')
                    .insert({
                        username: 'chicago_user4',
                        email: 'chicago4@example.com',
                        email_verified_at: isoNow(),
                        timezone: 'America/Chicago',
                    })
                    .returning('*');

                // February 1, 2025 at 10:00 AM CST (before DST)
                const beforeDST = isoFromLocal('2025-02-01 10:00:00', 'America/Chicago');

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
                const nextDueChicago = zdt(updatedReminder.due_date, 'America/Chicago');

                expect(nextDueChicago.hour).toBe(10);
                expect(nextDueChicago.minute).toBe(0);
                expect(nextDueChicago.day).toBe(1); // First of month
            });

            it('should handle multiple daily reminders at same local time for DST timezone user', async () => {
                const [chicagoUser] = await db('users')
                    .insert({
                        username: 'chicago_batch',
                        email: 'chicago_batch@example.com',
                        email_verified_at: isoNow(),
                        timezone: 'America/Chicago',
                    })
                    .returning('*');

                // All reminders due in 5 minutes from now
                const dueDate = isoFromNow({ minutes: 5 });

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
                for (const nextDueDate of dueDates) {
                    const originalChicagoTime = zdt(dueDate, 'America/Chicago');
                    const nextChicagoTime = zdt(nextDueDate, 'America/Chicago');

                    // Should preserve the same hour and minute in local time
                    expect(nextChicagoTime.hour).toBe(originalChicagoTime.hour);
                    expect(nextChicagoTime.minute).toBe(originalChicagoTime.minute);

                    // Should be approximately 1 day later
                    const daysDiff = nextChicagoTime
                        .toPlainDate()
                        .since(originalChicagoTime.toPlainDate()).days;
                    expect(daysDiff).toBe(1);
                }
            });
        });
    });
});

function isoNow() {
    return Temporal.Now.instant().toString();
}

function isoFromNow(duration: Temporal.DurationLike) {
    return Temporal.Now.zonedDateTimeISO('UTC').add(duration).toInstant().toString();
}

function isoBeforeNow(duration: Temporal.DurationLike) {
    return Temporal.Now.zonedDateTimeISO('UTC').subtract(duration).toInstant().toString();
}

function zdt(value: string | Temporal.Instant | Temporal.ZonedDateTime, timezone: string = 'UTC') {
    if (value instanceof Temporal.ZonedDateTime) return value.withTimeZone(timezone);
    const instant = value instanceof Temporal.Instant ? value : Temporal.Instant.from(value);
    return instant.toZonedDateTimeISO(timezone);
}

function isoFromLocal(localDateTime: string, timezone: string) {
    return Temporal.PlainDateTime.from(localDateTime.replace(' ', 'T'))
        .toZonedDateTime(timezone)
        .toInstant()
        .toString();
}

function isAfter(
    actual: string | Temporal.Instant | Temporal.ZonedDateTime,
    expected: string | Temporal.Instant | Temporal.ZonedDateTime,
) {
    return Temporal.Instant.compare(zdt(actual).toInstant(), zdt(expected).toInstant()) > 0;
}

function secondsBetween(
    actual: string | Temporal.Instant | Temporal.ZonedDateTime,
    expected: string | Temporal.Instant | Temporal.ZonedDateTime,
) {
    return Math.abs(zdt(actual).epochMilliseconds - zdt(expected).epochMilliseconds) / 1000;
}
