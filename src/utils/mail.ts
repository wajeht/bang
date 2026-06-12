import { styleText } from 'node:util';
import type { Request } from 'express';
import type { User, AppContext } from '../type.js';
import type { Attachment } from 'nodemailer/lib/mailer/index.js';

export function createMail(context: AppContext) {
    const logger = context.logger.tag('service', 'mail');
    const DEV_ENVIRONMENTS = new Set(['development', 'staging', 'test', 'testing', 'ci', 'dev']);

    // In production the magic-link base URL must come from trusted config, never the
    // request's Host/X-Forwarded-Host header — otherwise an attacker can poison the
    // header so the emailed login link points at a domain they control and steal the token.
    function getTrustedBaseUrl(req: Request): string {
        if (context.config.app.env === 'production') {
            const configured = context.config.app.appUrl;
            const withProtocol = /^https?:\/\//i.test(configured)
                ? configured
                : `https://${configured}`;
            try {
                // Reduce to the origin so a path-suffixed APP_URL (e.g. https://host/app)
                // can't produce a magic link the root-mounted /auth/magic route won't serve.
                return new URL(withProtocol).origin;
            } catch {
                return withProtocol.replace(/\/+$/, '');
            }
        }
        return `${req.protocol}://${req.get('host')}`;
    }

    // Advance a recurring reminder's due date by one period, preserving the local clock time
    // across the step (handles DST). Returns null for an unrecognized frequency.
    function advanceReminderOccurrence(
        from: ReturnType<typeof context.libs.dayjs>,
        frequency: string,
        userTz: string,
    ): ReturnType<typeof context.libs.dayjs> | null {
        const hour = from.hour();
        const minute = from.minute();
        const second = from.second();
        let next: ReturnType<typeof context.libs.dayjs>;
        switch (frequency) {
            case 'daily':
                next = from.add(1, 'day').hour(hour).minute(minute).second(second);
                break;
            case 'weekly':
                next = from.add(1, 'week').hour(hour).minute(minute).second(second);
                if (next.day() !== 6) {
                    const daysUntilSaturday = (6 - next.day() + 7) % 7;
                    next = next.add(daysUntilSaturday, 'day');
                }
                break;
            case 'monthly':
                next = from.add(1, 'month').date(1).hour(hour).minute(minute).second(second);
                break;
            default:
                return null;
        }
        // Re-apply timezone rules for the target date while keeping local clock time,
        // preventing stale offsets from shifting across DST.
        return next.tz(userTz, true);
    }

    const emailTransporter = context.libs.nodemailer.createTransport({
        host: context.config.email.host,
        port: context.config.email.port,
        secure: context.config.email.secure,
        auth:
            context.config.email.user && context.config.email.password
                ? {
                      user: context.config.email.user,
                      pass: context.config.email.password,
                  }
                : undefined,
    });

    return {
        async sendEmailWithFallback(mailOptions: any, emailType: string): Promise<void> {
            if (
                DEV_ENVIRONMENTS.has(context.config.app.env) &&
                (await this.isMailpitRunning()) === false
            ) {
                this.logEmailToConsole(mailOptions, emailType);
                return;
            }

            await emailTransporter.sendMail(mailOptions);
        },

        logEmailToConsole(mailOptions: any, emailType: string): void {
            const timestamp = context.libs.dayjs().format('h:mm:ss A');
            const width = process.stdout.columns || 100;
            const divider = styleText('dim', '─'.repeat(width - 4));

            // Email headers
            const headerLines = [
                styleText('yellow', 'From:    ') + styleText('white', mailOptions.from),
                styleText('yellow', 'To:      ') + styleText('white', mailOptions.to),
                styleText('yellow', 'Subject: ') + styleText('white', mailOptions.subject),
            ];

            // Attachments if any
            if (mailOptions.attachments && mailOptions.attachments.length > 0) {
                headerLines.push(divider);
                headerLines.push(styleText('blue', '📎 Attachments:'));
                for (let i = 0; i < mailOptions.attachments.length; i++) {
                    const att = mailOptions.attachments[i] as {
                        filename: string;
                        contentType: string;
                    };
                    headerLines.push(
                        styleText('dim', `  ${i + 1}. `) +
                            styleText('white', att.filename) +
                            styleText('dim', ` (${att.contentType})`),
                    );
                }
            }

            headerLines.push(divider);
            headerLines.push(styleText('green', '✉️  Message Body:'));
            headerLines.push(divider);

            // Format the content - handle both text and HTML
            let content = mailOptions.text || '';

            // If it's HTML, decode HTML entities for console display
            if (mailOptions.html && !mailOptions.text) {
                content = context.utils.html.decodeHtmlEntities(mailOptions.html);
            }

            const contentLines = content.split('\n');
            const footerLines = [
                divider,
                styleText('yellow', '⚠️  Mailpit not running') +
                    ' - ' +
                    styleText('red', 'Email NOT sent') +
                    ' ' +
                    styleText('dim', '(Development mode)'),
                styleText('dim', '💡 Tip: Start Mailpit with ') +
                    styleText('cyan', 'docker compose up -d mailpit'),
            ];

            const allLines = [...headerLines, ...contentLines, ...footerLines];

            const title =
                styleText('cyan', '📧 EMAIL PREVIEW') +
                ' ' +
                styleText('magenta', `[${emailType}]`) +
                ' ' +
                styleText('dim', `@ ${timestamp}`);

            logger.box(title, allLines);
        },

        async isMailpitRunning(): Promise<boolean> {
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
        },

        async sendMagicLinkEmail({
            email,
            token,
            req,
        }: {
            email: string;
            token: string;
            req: Request;
        }): Promise<void> {
            const branding = await context.models.settings.getBranding();
            const magicLink = `${getTrustedBaseUrl(req)}/auth/magic/${token}`;

            const mailOptions = {
                from: `${branding.appName} <${context.config.email.from}>`,
                to: email,
                subject: `🔗 Your ${branding.appName} Magic Link`,
                text: `Your ${branding.appName} Magic Link

Click this link to log in:
${magicLink}

This link will expire in 15 minutes. If you didn't request this, you can safely ignore this email.

--
${branding.appName} Team
${branding.appUrl}`,
            };

            try {
                await this.sendEmailWithFallback(mailOptions, 'Magic Link');
                logger.info('Magic link sent', { email });
            } catch (error) {
                logger.error('Failed to send magic link email', { error, email });
            }
        },

        async sendVerificationReminderEmail({
            email,
            username,
            token,
            baseUrl,
        }: {
            email: string;
            username: string;
            token: string;
            baseUrl: string;
        }): Promise<void> {
            const branding = await context.models.settings.getBranding();
            const magicLink = `${baseUrl}/auth/magic/${token}`;

            const mailOptions = {
                from: `${branding.appName} <${context.config.email.from}>`,
                to: email,
                subject: `👋 Verify your ${branding.appName} account`,
                text: `Hello ${username},

We noticed you haven't verified your ${branding.appName} account yet. Verifying your email helps secure your account and ensures you can receive important updates.

Click this link to verify your account:
${magicLink}

This link will expire in 15 minutes.

If you didn't create a ${branding.appName} account, you can safely ignore this email.

--
${branding.appName} Team
${branding.appUrl}`,
            };

            try {
                await this.sendEmailWithFallback(mailOptions, 'Verification Reminder');
                logger.info('Verification reminder sent', { email });
            } catch (error) {
                logger.error('Failed to send verification reminder email', {
                    error,
                    email,
                });
            }
        },

        async sendDataExportEmail({
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

                const branding = await context.models.settings.getBranding();
                const userId = (req.user as User).id;
                const currentDate = context.libs.dayjs().format('YYYY-MM-DD');
                const attachments: Attachment[] = [];
                const exportTypes: string[] = [];
                const appNameLower = branding.appName.toLowerCase();

                if (includeJson) {
                    const jsonExportData = await context.utils.util.generateUserDataExport(userId, {
                        includeBookmarks: true,
                        includeActions: true,
                        includeNotes: true,
                        includeUserPreferences: true,
                        includeTabs: true,
                        includeReminders: true,
                    });
                    const jsonBuffer = Buffer.from(JSON.stringify(jsonExportData, null, 2));
                    attachments.push({
                        filename: `${appNameLower}-data-export-${currentDate}.json`,
                        content: jsonBuffer,
                        contentType: 'application/json',
                    });
                    exportTypes.push(
                        `${appNameLower}-data-export-` +
                            currentDate +
                            '.json - Complete data export including bookmarks, actions, notes, and user preferences',
                    );
                }

                if (includeHtml) {
                    const htmlBookmarksExport =
                        await context.utils.util.generateBookmarkHtmlExport(userId);
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
                    from: `${branding.appName} <${context.config.email.from}>`,
                    to: email,
                    subject: `📦 Your ${branding.appName} Data Export - Account Deletion`,
                    text: `Hello ${username},

As requested, we have prepared your data export from ${branding.appName} before proceeding with your account deletion.

Attached to this email you will find:
${attachmentsList}

Your account has been deleted as requested. This action cannot be undone.

We hope ${branding.appName} was useful to you. If you ever want to return, you can always create a new account.

Thank you for using ${branding.appName}!

--
${branding.appName} Team
${branding.appUrl}`,
                    attachments,
                };

                await this.sendEmailWithFallback(mailOptions, 'Data Export');
                logger.info('Data export email sent', {
                    email,
                    attachmentCount: attachments.length,
                });
            } catch (error) {
                logger.error('Failed to send data export email', { error, email });
            }
        },

        async sendReminderDigestEmail({
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

            const branding = await context.models.settings.getBranding();
            const formatDate = context.libs.dayjs(date).format('dddd, MMMM D, YYYY');

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
                .map((reminder) => {
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

    <p>You can manage your reminders at your ${branding.appName} dashboard.</p>

    <p>
        --<br>
        ${branding.appName} Team<br>
        <a href="${branding.appUrl}">${branding.appUrl}</a>
    </p>
</body>
</html>`;

            const mailOptions = {
                from: `${branding.appName} <${context.config.email.from}>`,
                to: email,
                subject: `⏰ Reminders - ${formatDate}`,
                html: emailBodyHTML,
            };

            try {
                await this.sendEmailWithFallback(
                    { ...mailOptions, text: emailBodyHTML },
                    'Reminder Digest',
                );
                logger.info('Reminder digest email sent', {
                    email,
                    reminderCount: reminders.length,
                });
            } catch (error) {
                logger.error('Failed to send reminder digest email', { error, email });
                // Re-throw so the caller does NOT delete/advance reminders whose email never
                // sent — the next run retries delivery (at-least-once) instead of losing them.
                throw error;
            }
        },

        async processReminderDigests(): Promise<void> {
            try {
                // Use UTC time for database queries since due_date is stored in UTC
                const now = context.libs.dayjs.utc();
                const next15Min = now.add(15, 'minute');

                // Select every reminder due AT OR BEFORE the next window boundary (no lower
                // bound). Using a lower bound of `now` permanently drops any reminder whose
                // due_date slipped into the past while the server was down/deploying or that was
                // created with a near-term time between runs. Overdue rows are safe to include
                // because each is either deleted (one-time) or advanced to a future date
                // (recurring) below, so they are processed exactly once.
                const next15MinFormatted = next15Min.toISOString();

                const dueReminders = await context.db
                    .select('reminders.*', 'users.email', 'users.username', 'users.timezone')
                    .from('reminders')
                    .join('users', 'reminders.user_id', 'users.id')
                    .where('reminders.due_date', '<=', next15MinFormatted)
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
                    try {
                        await this.sendReminderDigestEmail({
                            email: userData.email,
                            username: userData.username,
                            reminders: userData.reminders,
                            date: userNow.format('YYYY-MM-DD'),
                        });
                    } catch (error) {
                        // Delivery failed: leave this user's reminders untouched so the next run
                        // retries them (the query now includes overdue rows). Do not delete/advance.
                        logger.error('Skipping reminder state update; digest email failed', {
                            error,
                            email: userData.email,
                        });
                        continue;
                    }

                    // Process each reminder
                    for (const reminder of userData.reminders) {
                        if (reminder.reminder_type === 'recurring' && reminder.frequency) {
                            const userTz = userData.timezone || 'UTC';
                            const frequency = reminder.frequency;

                            // Advance from the stored due date, catching up past multiple missed
                            // periods (e.g. after a long outage) so the reminder lands in the
                            // future and is not re-sent every run. Bounded as a safety net.
                            let nextDue = context.libs.dayjs
                                .tz(reminder.due_date, 'UTC')
                                .tz(userTz);
                            let advanced = 0;
                            for (let i = 0; i < 1000; i++) {
                                const stepped = advanceReminderOccurrence(
                                    nextDue,
                                    frequency,
                                    userTz,
                                );
                                if (!stepped) break; // unrecognized frequency
                                nextDue = stepped;
                                advanced++;
                                if (nextDue.utc().valueOf() > now.valueOf()) break;
                            }

                            if (advanced === 0) continue; // unrecognized frequency: leave as-is

                            // If the reminder was overdue beyond the catch-up bound and is still
                            // in the past, advance from now so it lands in the future instead of
                            // being re-selected and re-sent on every run.
                            if (nextDue.utc().valueOf() <= now.valueOf()) {
                                const fromNow = advanceReminderOccurrence(
                                    now.tz(userTz),
                                    frequency,
                                    userTz,
                                );
                                if (fromNow) nextDue = fromNow;
                            }

                            await context.db('reminders').where('id', reminder.id).update({
                                due_date: nextDue.utc().toISOString(),
                                updated_at: context.db.fn.now(),
                            });
                        } else {
                            // Delete one-time reminders since they're done
                            await context.db('reminders').where('id', reminder.id).delete();
                        }
                    }
                }

                const userSummary = Object.values(remindersByUser).map((userData) => ({
                    email: userData.email,
                    username: userData.username,
                    reminderCount: userData.reminders.length,
                }));
                logger.table(userSummary);
                logger.info('Processed reminder digests', {
                    userCount: Object.keys(remindersByUser).length,
                });
            } catch (error) {
                logger.error('Failed to process reminder digests', { error });
            }
        },

        async processVerificationReminders(baseUrl: string): Promise<void> {
            try {
                const now = context.libs.dayjs.utc();
                const sevenDaysAgo = now.subtract(7, 'days').toISOString();

                const unverifiedUsers = await context
                    .db('users')
                    .select('id', 'email', 'username')
                    .whereNull('email_verified_at')
                    .where('created_at', '<', sevenDaysAgo)
                    .orderBy('created_at', 'asc');

                if (unverifiedUsers.length === 0) {
                    logger.info('No unverified users found who need reminders');
                    return;
                }

                logger.info('Found unverified users needing reminders', {
                    count: unverifiedUsers.length,
                });

                const emailsSent: string[] = [];
                for (const user of unverifiedUsers) {
                    const token = context.utils.auth.generateMagicLink({ email: user.email });

                    await this.sendVerificationReminderEmail({
                        email: user.email,
                        username: user.username,
                        token,
                        baseUrl,
                    });

                    emailsSent.push(user.email);
                }

                const userSummary = unverifiedUsers.map((user) => ({
                    email: user.email,
                    username: user.username,
                }));
                logger.table(userSummary);
                logger.info('Sent verification reminders', {
                    count: emailsSent.length,
                });
            } catch (error) {
                logger.error('Failed to process verification reminders', { error });
            }
        },
    };
}
