import dayjs from './dayjs';
import { db } from '../db/db';
import { logger } from './logger';
import { config } from '../config';
import type { User } from '../type';
import nodemailer from 'nodemailer';
import type { Request } from 'express';
import type { Attachment } from 'nodemailer/lib/mailer';
import { generateUserDataExport, generateBookmarkHtmlExport } from './util';

export const emailTransporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    auth:
        config.email.user && config.email.password
            ? {
                  user: config.email.user,
                  pass: config.email.password,
              }
            : undefined,
});

export async function isMailpitRunning(): Promise<boolean> {
    try {
        const url = process.env.DOCKER_CONTAINER
            ? 'http://mailpit:8025/'
            : 'http://localhost:8025/';
        const response = await fetch(url, {
            signal: AbortSignal.timeout(1500),
        });
        return response.ok;
    } catch {
        return false;
    }
}

export async function sendMagicLinkEmail({
    email,
    token,
    req,
}: {
    email: string;
    token: string;
    req: Request;
}): Promise<void> {
    const magicLink = `${req.protocol}://${req.get('host')}/auth/magic/${token}`;

    const mailOptions = {
        from: `Bang <${config.email.from}>`,
        to: email,
        subject: '🔗 Your Bang Magic Link',
        text: `Your Bang Magic Link

Click this link to log in:
${magicLink}

This link will expire in 15 minutes. If you didn't request this, you can safely ignore this email.

--
Bang Team
https://github.com/wajeht/bang`,
    };

    try {
        if (config.app.env === 'development' && (await isMailpitRunning()) === false) {
            logger.info(`We are on dev mode and mailpit is not running, magic link: ${magicLink}`);
        }
        await emailTransporter.sendMail(mailOptions);
        logger.info(`Magic link sent to ${email}`);
    } catch (error) {
        logger.error(`Failed to send magic link email: %o`, { error });
    }
}

export async function sendDataExportEmail({
    email,
    username,
    req,
    includeJson = true,
    includeHtml = true,
}: {
    email: string;
    username: string;
    req: Request;
    includeJson?: boolean;
    includeHtml?: boolean;
}): Promise<void> {
    try {
        if (!includeJson && !includeHtml) {
            logger.info(`No export options selected for ${email}, skipping export email`);
            return;
        }

        const userId = (req.user as User).id;
        const currentDate = dayjs().format('YYYY-MM-DD');
        const attachments: Attachment[] = [];
        const exportTypes: string[] = [];

        if (includeJson) {
            const jsonExportData = await generateUserDataExport(userId, {
                includeBookmarks: true,
                includeActions: true,
                includeNotes: true,
                includeUserPreferences: true,
                includeTabs: true,
                includeReminders: true,
            });
            const jsonBuffer = Buffer.from(JSON.stringify(jsonExportData, null, 2));
            attachments.push({
                filename: `bang-data-export-${currentDate}.json`,
                content: jsonBuffer,
                contentType: 'application/json',
            });
            exportTypes.push(
                'bang-data-export-' +
                    currentDate +
                    '.json - Complete data export including bookmarks, actions, notes, and user preferences',
            );
        }

        if (includeHtml) {
            const htmlBookmarksExport = await generateBookmarkHtmlExport(userId);
            const htmlBuffer = Buffer.from(htmlBookmarksExport);
            attachments.push({
                filename: `bookmarks-${currentDate}.html`,
                content: htmlBuffer,
                contentType: 'text/html',
            });
            exportTypes.push(
                'bookmarks-' +
                    currentDate +
                    '.html - HTML bookmarks file that can be imported into browsers',
            );
        }

        const attachmentsList = exportTypes
            .map((type, index) => `${index + 1}. ${type}`)
            .join('\n');

        const mailOptions = {
            from: `Bang <${config.email.from}>`,
            to: email,
            subject: '📦 Your Bang Data Export - Account Deletion',
            text: `Hello ${username},

As requested, we have prepared your data export from Bang before proceeding with your account deletion.

Attached to this email you will find:
${attachmentsList}

Your account has been deleted as requested. This action cannot be undone.

We hope Bang was useful to you. If you ever want to return, you can always create a new account.

Thank you for using Bang!

--
Bang Team
https://github.com/wajeht/bang`,
            attachments,
        };

        if (config.app.env === 'development' && (await isMailpitRunning()) === false) {
            logger.info(
                `We are on dev mode and mailpit is not running. Data export email would be sent to ${email} with ${attachments.length} attachment(s).`,
            );
            return;
        }

        await emailTransporter.sendMail(mailOptions);
        logger.info(
            `Data export email sent to ${email} before account deletion with ${attachments.length} attachment(s)`,
        );
    } catch (error) {
        logger.error(`Failed to send data export email: %o`, { error });
    }
}

export async function sendReminderDigestEmail({
    email,
    username,
    reminders,
    date,
}: {
    email: string;
    username: string;
    reminders: Array<{
        id: number;
        title: string;
        url?: string;
        reminder_type: 'once' | 'recurring';
        frequency?: 'daily' | 'weekly' | 'monthly';
    }>;
    date: string;
}): Promise<void> {
    if (reminders.length === 0) return;

    const formatDate = dayjs(date).format('dddd, MMMM D, YYYY');

    // Determine the frequency type for the header
    const frequencies = new Set(
        reminders.filter((r) => r.reminder_type === 'recurring').map((r) => r.frequency),
    );
    let reminderTypeText = 'reminders';
    if (frequencies.size === 1 && reminders.every((r) => r.reminder_type === 'recurring')) {
        const freq = Array.from(frequencies)[0];
        reminderTypeText = `${freq} reminders`;
    } else if (frequencies.size > 0) {
        reminderTypeText = 'reminders';
    }

    // HTML version with clickable links
    const formatReminderListHTML = reminders
        .map((reminder, index) => {
            const number = index + 1;
            const title = reminder.title;

            if (reminder.url && reminder.url !== 'null') {
                return `   <li><a href="${reminder.url}">${title}</a></li>`;
            } else {
                return `   <li>${title}</li>`;
            }
        })
        .join('\n');

    const emailBodyHTML = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
    <p>Hello ${username},</p>

    <p>Here are your ${reminderTypeText} for ${formatDate}:</p>

    <ol>
${formatReminderListHTML}
    </ol>

    <p>You can manage your reminders at your Bang dashboard.</p>

    <p>
        --<br>
        Bang Team<br>
        <a href="https://github.com/wajeht/bang">https://github.com/wajeht/bang</a>
    </p>
</body>
</html>`;

    const mailOptions = {
        from: `Bang <${config.email.from}>`,
        to: email,
        subject: `⏰ Reminders - ${formatDate}`,
        html: emailBodyHTML,
    };

    try {
        if (config.app.env === 'development' && (await isMailpitRunning()) === false) {
            logger.info(
                `Development mode: Reminder digest email for ${email} with ${reminders.length} reminders`,
            );
            logger.info(`Email content:\n${emailBodyHTML}`);
            return;
        }

        await emailTransporter.sendMail(mailOptions);
        logger.info(`Reminder digest email sent to ${email} with ${reminders.length} reminders`);
    } catch (error) {
        logger.error(`Failed to send reminder digest email: %o`, { error });
    }
}

export async function processReminderDigests(): Promise<void> {
    try {
        // Use UTC time for database queries since due_date is stored in UTC
        const now = dayjs.utc();
        const next15Min = now.add(15, 'minute');

        // Get all reminders due in the next 15 minutes
        // Use UTC ISO format for database comparison
        const nowFormatted = now.toISOString();
        const next15MinFormatted = next15Min.toISOString();

        const dueReminders = await db
            .select('reminders.*', 'users.email', 'users.username', 'users.timezone')
            .from('reminders')
            .join('users', 'reminders.user_id', 'users.id')
            .whereBetween('reminders.due_date', [nowFormatted, next15MinFormatted])
            .orderBy('users.id')
            .orderBy('reminders.created_at');

        if (dueReminders.length === 0) {
            logger.info('No reminders due in the next 15 minutes');
            return;
        }

        // Group reminders by user
        const remindersByUser = dueReminders.reduce(
            (
                acc: Record<
                    number,
                    { email: string; username: string; timezone: string; reminders: any[] }
                >,
                reminder: any,
            ) => {
                const userId = reminder.user_id;
                if (!acc[userId]) {
                    acc[userId] = {
                        email: reminder.email,
                        username: reminder.username,
                        timezone: reminder.timezone || 'UTC',
                        reminders: [],
                    };
                }
                acc[userId].reminders.push({
                    id: reminder.id,
                    title: reminder.title,
                    url: reminder.content, // Map content to url for email compatibility
                    reminder_type: reminder.reminder_type,
                    frequency: reminder.frequency,
                    due_date: reminder.due_date,
                });
                return acc;
            },
            {},
        );

        // Send digest emails to each user
        for (const userData of Object.values(remindersByUser)) {
            // Use user's timezone for email date formatting
            const userNow = now.tz(userData.timezone);
            await sendReminderDigestEmail({
                email: userData.email,
                username: userData.username,
                reminders: userData.reminders,
                date: userNow.format('YYYY-MM-DD'),
            });

            // Process each reminder
            for (const reminder of userData.reminders) {
                if (reminder.reminder_type === 'recurring' && reminder.frequency) {
                    // Calculate next due date for recurring reminders
                    // Use user's timezone for proper day/time calculations
                    const userTz = userData.timezone || 'UTC';
                    const currentDue = dayjs.tz(reminder.due_date, 'UTC').tz(userTz);
                    let nextDue: dayjs.Dayjs;

                    switch (reminder.frequency) {
                        case 'daily':
                            nextDue = currentDue.add(1, 'day');
                            break;
                        case 'weekly':
                            // Always move to next Saturday
                            nextDue = currentDue.add(1, 'week');
                            // Ensure it's still on Saturday (in case of DST changes)
                            if (nextDue.day() !== 6) {
                                // Find the next Saturday from current position
                                const daysUntilSaturday = (6 - nextDue.day() + 7) % 7;
                                nextDue = nextDue.add(daysUntilSaturday, 'day');
                            }
                            break;
                        case 'monthly':
                            // Always move to the 1st of next month
                            nextDue = currentDue.add(1, 'month').date(1);
                            break;
                        default:
                            continue; // Skip if frequency is not recognized
                    }

                    // Update recurring reminder with next due date (convert back to UTC)
                    await db('reminders').where('id', reminder.id).update({
                        due_date: nextDue.utc().toISOString(),
                        updated_at: db.fn.now(),
                    });
                } else {
                    // Delete one-time reminders since they're done
                    await db('reminders').where('id', reminder.id).delete();
                }
            }
        }

        const userSummary = Object.values(remindersByUser).map(userData => ({
            email: userData.email,
            username: userData.username,
            reminderCount: userData.reminders.length
        }));
        logger.table(userSummary);
        logger.info(`Processed reminder digests for ${Object.keys(remindersByUser).length} users`);
    } catch (error) {
        logger.error(`Failed to process reminder digests: %o`, { error });
    }
}
