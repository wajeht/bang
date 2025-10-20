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
    });
});
