import type { Request, Response } from 'express';
import type { User, ApiKeyPayload, AppContext } from '../../type';

export function createSettingsRouter(context: AppContext) {
    const router = context.libs.express.Router();

    router.get(
        '/settings',
        context.middleware.authentication,
        async (_req: Request, res: Response) => {
            return res.redirect('/settings/account');
        },
    );

    router.get(
        '/settings/account',
        context.middleware.authentication,
        async (req: Request, res: Response) => {
            return res.render('settings/settings-account.html', {
                user: req.session?.user,
                title: 'Settings Account',
                path: '/settings/account',
                layout: '_layouts/settings.html',
                defaultSearchProviders: Object.keys(
                    context.utils.search.searchConfig.defaultSearchProviders,
                ),
            });
        },
    );

    router.get(
        '/settings/data',
        context.middleware.authentication,
        async (req: Request, res: Response) => {
            return res.render('settings/settings-data.html', {
                user: req.session?.user,
                title: 'Settings Data',
                path: '/settings/data',
                layout: '_layouts/settings.html',
            });
        },
    );

    router.get(
        '/settings/danger-zone',
        context.middleware.authentication,
        async (req: Request, res: Response) => {
            return res.render('settings/settings-danger-zone.html', {
                user: req.session?.user,
                title: 'Settings Danger Zone',
                path: '/settings/danger-zone',
                layout: '_layouts/settings.html',
            });
        },
    );

    router.post(
        '/settings/account',
        context.middleware.authentication,
        async (req: Request, res: Response) => {
            const {
                username,
                email,
                default_search_provider,
                autocomplete_search_on_homepage,
                timezone,
            } = req.body;

            if (!username) {
                throw new context.errors.ValidationError({ username: 'Username is required' });
            }

            if (!email) {
                throw new context.errors.ValidationError({ email: 'Email is required' });
            }

            if (!default_search_provider) {
                throw new context.errors.ValidationError({
                    default_search_provider: 'Default search provider is required',
                });
            }

            if (!context.utils.validation.isValidEmail(email)) {
                throw new context.errors.ValidationError({
                    email: 'Please enter a valid email address',
                });
            }

            if (
                !Object.keys(context.utils.search.searchConfig.defaultSearchProviders).includes(
                    default_search_provider,
                )
            ) {
                throw new context.errors.ValidationError({
                    default_search_provider: 'Invalid search provider selected',
                });
            }

            if (!timezone) {
                throw new context.errors.ValidationError({ timezone: 'Timezone is required' });
            }

            const validTimezones = [
                'UTC',
                'America/New_York',
                'America/Chicago',
                'America/Denver',
                'America/Los_Angeles',
                'Europe/London',
                'Europe/Paris',
                'Europe/Berlin',
                'Asia/Tokyo',
                'Asia/Shanghai',
                'Asia/Kolkata',
                'Australia/Sydney',
            ];
            if (!validTimezones.includes(timezone)) {
                throw new context.errors.ValidationError({ timezone: 'Invalid timezone selected' });
            }

            let parsedAutocompleteSearchOnHomepage = false;
            if (autocomplete_search_on_homepage === undefined) {
                parsedAutocompleteSearchOnHomepage = false;
            } else if (autocomplete_search_on_homepage !== 'on') {
                throw new context.errors.ValidationError({
                    autocomplete_search_on_homepage:
                        'Invalid autocomplete search on homepage format',
                });
            } else {
                parsedAutocompleteSearchOnHomepage = true;
            }

            // Check if username is being changed and if it's already taken by another user
            const currentUserId = (req.user as User).id;
            if (username !== (req.user as User).username) {
                const existingUser = await context
                    .db('users')
                    .where({ username })
                    .whereNot({ id: currentUserId })
                    .first();
                if (existingUser) {
                    throw new context.errors.ValidationError({
                        username: 'Username is already taken',
                    });
                }
            }

            // Check if email is being changed and if it's already taken by another user
            if (email !== (req.user as User).email) {
                const existingUser = await context
                    .db('users')
                    .where({ email })
                    .whereNot({ id: currentUserId })
                    .first();
                if (existingUser) {
                    throw new context.errors.ValidationError({
                        email: 'Email address is already in use',
                    });
                }
            }

            const updatedUser = await context
                .db('users')
                .update({
                    email,
                    username,
                    default_search_provider,
                    autocomplete_search_on_homepage: parsedAutocompleteSearchOnHomepage,
                    timezone,
                })
                .where({ id: currentUserId })
                .returning('*');

            if (req.session?.user) {
                req.session.user = updatedUser[0] as User;
                req.session.save();
            }

            if (req.user) {
                req.user = updatedUser[0] as User;
            }

            req.flash('success', '🔄 updated!');
            return res.redirect('/settings/account');
        },
    );

    router.post(
        '/settings/display',
        context.middleware.authentication,
        async (req: Request, res: Response) => {
            const { column_preferences } = req.body;

            if (!column_preferences || typeof column_preferences !== 'object') {
                throw new context.errors.ValidationError({
                    column_preferences: 'Column preferences must be an object',
                });
            }

            // bookmarks
            if (typeof column_preferences.bookmarks !== 'object') {
                throw new context.errors.ValidationError({
                    bookmarks: 'Bookmarks must be an object',
                });
            }

            column_preferences.bookmarks.title = column_preferences.bookmarks.title === 'on';
            column_preferences.bookmarks.url = column_preferences.bookmarks.url === 'on';
            column_preferences.bookmarks.created_at =
                column_preferences.bookmarks.created_at === 'on';
            column_preferences.bookmarks.pinned = column_preferences.bookmarks.pinned === 'on';
            column_preferences.bookmarks.hidden = column_preferences.bookmarks.hidden === 'on';

            column_preferences.bookmarks.default_per_page = parseInt(
                column_preferences.bookmarks.default_per_page,
                10,
            );

            if (
                isNaN(column_preferences.bookmarks.default_per_page) ||
                column_preferences.bookmarks.default_per_page < 1
            ) {
                throw new context.errors.ValidationError({
                    bookmarks: 'Bookmarks per page must be greater than 0',
                });
            }

            if (
                !column_preferences.bookmarks.title &&
                !column_preferences.bookmarks.url &&
                !column_preferences.bookmarks.created_at &&
                !column_preferences.bookmarks.pinned &&
                !column_preferences.bookmarks.hidden
            ) {
                throw new context.errors.ValidationError({
                    bookmarks: 'At least one bookmark column must be enabled',
                });
            }

            // actions
            if (typeof column_preferences.actions !== 'object') {
                throw new context.errors.ValidationError({ actions: 'Actions must be an object' });
            }

            column_preferences.actions.name = column_preferences.actions.name === 'on';
            column_preferences.actions.trigger = column_preferences.actions.trigger === 'on';
            column_preferences.actions.url = column_preferences.actions.url === 'on';
            column_preferences.actions.action_type =
                column_preferences.actions.action_type === 'on';
            column_preferences.actions.created_at = column_preferences.actions.created_at === 'on';
            column_preferences.actions.last_read_at =
                column_preferences.actions.last_read_at === 'on';
            column_preferences.actions.usage_count =
                column_preferences.actions.usage_count === 'on';
            column_preferences.actions.hidden = column_preferences.actions.hidden === 'on';

            column_preferences.actions.default_per_page = parseInt(
                column_preferences.actions.default_per_page,
                10,
            );

            if (
                isNaN(column_preferences.actions.default_per_page) ||
                column_preferences.actions.default_per_page < 1
            ) {
                throw new context.errors.ValidationError({
                    actions: 'Actions per page must be greater than 0',
                });
            }

            if (
                !column_preferences.actions.name &&
                !column_preferences.actions.trigger &&
                !column_preferences.actions.url &&
                !column_preferences.actions.action_type &&
                !column_preferences.actions.last_read_at &&
                !column_preferences.actions.usage_count &&
                !column_preferences.actions.hidden &&
                !column_preferences.actions.created_at
            ) {
                throw new context.errors.ValidationError({
                    actions: 'At least one action column must be enabled',
                });
            }

            // notes
            if (typeof column_preferences.notes !== 'object') {
                throw new context.errors.ValidationError({ notes: 'Notes must be an object' });
            }

            column_preferences.notes.title = column_preferences.notes.title === 'on';
            column_preferences.notes.content = column_preferences.notes.content === 'on';
            column_preferences.notes.created_at = column_preferences.notes.created_at === 'on';
            column_preferences.notes.pinned = column_preferences.notes.pinned === 'on';
            column_preferences.notes.hidden = column_preferences.notes.hidden === 'on';

            // Handle view_type preference
            if (
                column_preferences.notes.view_type &&
                !['card', 'table'].includes(column_preferences.notes.view_type)
            ) {
                column_preferences.notes.view_type = 'table'; // Default to table if invalid
            }

            if (
                !column_preferences.notes.title &&
                !column_preferences.notes.content &&
                !column_preferences.notes.pinned &&
                !column_preferences.notes.hidden
            ) {
                throw new context.errors.ValidationError({
                    notes: 'At least one note column must be enabled',
                });
            }

            column_preferences.notes.default_per_page = parseInt(
                column_preferences.notes.default_per_page,
                10,
            );

            if (
                isNaN(column_preferences.notes.default_per_page) ||
                column_preferences.notes.default_per_page < 1
            ) {
                throw new context.errors.ValidationError({
                    notes: 'Notes per page must be greater than 0',
                });
            }

            // Preserve the view_type if it's not in the form submission
            if (
                !column_preferences.notes.view_type &&
                req.session?.user?.column_preferences?.notes?.view_type
            ) {
                column_preferences.notes.view_type =
                    req.session.user.column_preferences.notes.view_type;
            }

            // tabs
            if (column_preferences.tabs) {
                if (typeof column_preferences.tabs !== 'object') {
                    throw new context.errors.ValidationError({ tabs: 'Tabs must be an object' });
                }

                column_preferences.tabs.title = column_preferences.tabs.title === 'on';
                column_preferences.tabs.trigger = column_preferences.tabs.trigger === 'on';
                column_preferences.tabs.items_count = column_preferences.tabs.items_count === 'on';
                column_preferences.tabs.created_at = column_preferences.tabs.created_at === 'on';

                column_preferences.tabs.default_per_page = parseInt(
                    column_preferences.tabs.default_per_page,
                    10,
                );

                if (
                    isNaN(column_preferences.tabs.default_per_page) ||
                    column_preferences.tabs.default_per_page < 1
                ) {
                    throw new context.errors.ValidationError({
                        tabs: 'Tabs per page must be greater than 0',
                    });
                }

                if (
                    !column_preferences.tabs.title &&
                    !column_preferences.tabs.trigger &&
                    !column_preferences.tabs.items_count &&
                    !column_preferences.tabs.created_at
                ) {
                    throw new context.errors.ValidationError({
                        tabs: 'At least one tab column must be enabled',
                    });
                }
            }

            // users (admin only)
            if (req.user?.is_admin && column_preferences.users) {
                if (typeof column_preferences.users !== 'object') {
                    throw new context.errors.ValidationError({ users: 'Users must be an object' });
                }

                column_preferences.users.username = column_preferences.users.username === 'on';
                column_preferences.users.email = column_preferences.users.email === 'on';
                column_preferences.users.is_admin = column_preferences.users.is_admin === 'on';
                column_preferences.users.email_verified_at =
                    column_preferences.users.email_verified_at === 'on';
                column_preferences.users.created_at = column_preferences.users.created_at === 'on';

                column_preferences.users.default_per_page = parseInt(
                    column_preferences.users.default_per_page,
                    10,
                );

                if (
                    isNaN(column_preferences.users.default_per_page) ||
                    column_preferences.users.default_per_page < 1
                ) {
                    throw new context.errors.ValidationError({
                        users: 'Users per page must be greater than 0',
                    });
                }

                if (
                    !column_preferences.users.username &&
                    !column_preferences.users.email &&
                    !column_preferences.users.is_admin &&
                    !column_preferences.users.email_verified_at &&
                    !column_preferences.users.created_at
                ) {
                    throw new context.errors.ValidationError({
                        users: 'At least one user column must be enabled',
                    });
                }
            }

            // reminders
            if (column_preferences.reminders) {
                if (typeof column_preferences.reminders !== 'object') {
                    throw new context.errors.ValidationError({
                        reminders: 'Reminders must be an object',
                    });
                }

                column_preferences.reminders.title = column_preferences.reminders.title === 'on';
                column_preferences.reminders.content =
                    column_preferences.reminders.content === 'on';
                column_preferences.reminders.due_date =
                    column_preferences.reminders.due_date === 'on';
                column_preferences.reminders.next_due =
                    column_preferences.reminders.next_due === 'on';
                column_preferences.reminders.frequency =
                    column_preferences.reminders.frequency === 'on';
                column_preferences.reminders.created_at =
                    column_preferences.reminders.created_at === 'on';

                column_preferences.reminders.default_per_page = parseInt(
                    column_preferences.reminders.default_per_page,
                    10,
                );

                if (
                    isNaN(column_preferences.reminders.default_per_page) ||
                    column_preferences.reminders.default_per_page < 1
                ) {
                    throw new context.errors.ValidationError({
                        reminders: 'Reminders per page must be greater than 0',
                    });
                }

                // Validate default_reminder_timing
                if (column_preferences.reminders.default_reminder_timing) {
                    const validTimings = ['daily', 'weekly', 'monthly'];
                    if (
                        !validTimings.includes(column_preferences.reminders.default_reminder_timing)
                    ) {
                        throw new context.errors.ValidationError({
                            reminders: 'Invalid reminder timing. Must be daily, weekly, or monthly',
                        });
                    }
                }

                // Validate default_reminder_time (HH:MM format)
                if (column_preferences.reminders.default_reminder_time) {
                    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
                    if (!timeRegex.test(column_preferences.reminders.default_reminder_time)) {
                        throw new context.errors.ValidationError({
                            reminders:
                                'Invalid reminder time format. Must be HH:MM (24-hour format)',
                        });
                    }
                }

                if (
                    !column_preferences.reminders.title &&
                    !column_preferences.reminders.content &&
                    !column_preferences.reminders.due_date &&
                    !column_preferences.reminders.next_due &&
                    !column_preferences.reminders.frequency &&
                    !column_preferences.reminders.created_at
                ) {
                    throw new context.errors.ValidationError({
                        reminders: 'At least one reminder column must be enabled',
                    });
                }
            }

            const user = req.user as User;
            const { path, hidden } = req.body;

            // Merge submitted preferences with existing user preferences to preserve unmodified sections
            const updatedPreferences = { ...user.column_preferences } as any;
            Object.keys(column_preferences).forEach((section) => {
                if (
                    column_preferences[section as keyof typeof column_preferences] &&
                    typeof column_preferences[section as keyof typeof column_preferences] ===
                        'object'
                ) {
                    updatedPreferences[section] = {
                        ...updatedPreferences[section],
                        ...column_preferences[section as keyof typeof column_preferences],
                    };
                }
            });

            await context
                .db('users')
                .where('id', user.id)
                .update({
                    column_preferences: JSON.stringify(updatedPreferences),
                });

            req.session.user!.column_preferences = updatedPreferences;

            req.user!.column_preferences = updatedPreferences;

            req.flash('success', 'Column settings updated');

            const redirectUrl = hidden === 'true' ? `${path}?hidden=true` : path;
            return res.redirect(redirectUrl);
        },
    );

    router.post(
        '/settings/create-api-key',
        context.middleware.authentication,
        async (req: Request, res: Response) => {
            const user = await context.db('users').where({ id: req.session.user?.id }).first();

            if (!user) {
                throw new context.errors.NotFoundError('User not found');
            }

            // Convert SQLite integer values to booleans
            user.is_admin = Boolean(user.is_admin);
            user.autocomplete_search_on_homepage = Boolean(user.autocomplete_search_on_homepage);

            const newKeyVersion = (user.api_key_version || 0) + 1;

            const payload: ApiKeyPayload = { userId: user.id, apiKeyVersion: newKeyVersion };

            await context
                .db('users')
                .where({ id: req.session?.user?.id })
                .update({
                    api_key: await context.utils.auth.generateApiKey(payload),
                    api_key_version: newKeyVersion,
                    api_key_created_at: context.db.fn.now(),
                });

            req.flash('success', '📱 api key created');
            return res.redirect(`/settings/account`);
        },
    );

    router.post(
        '/settings/hidden-password',
        context.middleware.authentication,
        async (req: Request, res: Response) => {
            const { currentPassword, newPassword, confirmPassword, removePassword } = req.body;
            const user = req.session.user as User;

            if (removePassword === 'on') {
                if (!user.hidden_items_password) {
                    throw new context.errors.ValidationError({
                        removePassword: 'No password to remove',
                    });
                }

                if (!currentPassword) {
                    throw new context.errors.ValidationError({
                        currentPassword: 'Current password is required to remove it',
                    });
                }

                const isValid = await context.libs.bcrypt.compare(
                    currentPassword,
                    user.hidden_items_password,
                );

                if (!isValid) {
                    throw new context.errors.ValidationError({
                        currentPassword: 'Incorrect password',
                    });
                }

                await context.db.transaction(async (trx) => {
                    await trx('users')
                        .where({ id: user.id })
                        .update({ hidden_items_password: null });
                    await trx('notes').where({ user_id: user.id }).update({ hidden: false });
                    await trx('bookmarks').where({ user_id: user.id }).update({ hidden: false });
                    await trx('bangs').where({ user_id: user.id }).update({ hidden: false });
                });

                req.flash('success', '🔓 Password removed and all items unhidden');
                return res.redirect('/settings/account');
            }

            if (user.hidden_items_password) {
                if (!currentPassword) {
                    throw new context.errors.ValidationError({
                        currentPassword: 'Current password is required',
                    });
                }

                const isValid = await context.libs.bcrypt.compare(
                    currentPassword,
                    user.hidden_items_password,
                );

                if (!isValid) {
                    throw new context.errors.ValidationError({
                        currentPassword: 'Incorrect password',
                    });
                }

                if (!newPassword) {
                    return res.redirect('/settings/account');
                }
            } else {
                if (!newPassword) {
                    throw new context.errors.ValidationError({
                        newPassword: 'Password is required',
                    });
                }
            }

            if (newPassword && newPassword.length < 4) {
                throw new context.errors.ValidationError({
                    newPassword: 'Password must be at least 4 characters',
                });
            }

            if (user.hidden_items_password && newPassword !== confirmPassword) {
                throw new context.errors.ValidationError({
                    confirmPassword: 'Passwords do not match',
                });
            }

            const hashedPassword = await context.libs.bcrypt.hash(newPassword, 10);

            await context
                .db('users')
                .where({ id: user.id })
                .update({ hidden_items_password: hashedPassword });

            req.flash(
                'success',
                user.hidden_items_password ? '🔄 Password updated' : '🔐 Password set',
            );
            return res.redirect('/settings/account');
        },
    );

    router.post(
        '/settings/data/export',
        context.middleware.authentication,
        async (req: Request, res: Response) => {
            const { options } = req.body;

            if (!options || !Array.isArray(options) || options.length === 0) {
                throw new context.errors.ValidationError({
                    options: 'Please select at least one data type to export',
                });
            }

            const userId = (req.user as User).id;
            const includeBookmarks = req.body.options.includes('bookmarks');
            const includeActions = req.body.options.includes('actions');
            const includeNotes = req.body.options.includes('notes');
            const includeTabs = req.body.options.includes('tabs');
            const includeReminders = req.body.options.includes('reminders');
            const includeUserPreferences = req.body.options.includes('user_preferences');

            const exportData = await context.utils.util.generateUserDataExport(userId, {
                includeBookmarks,
                includeActions,
                includeNotes,
                includeUserPreferences,
                includeTabs,
                includeReminders,
            });

            res.setHeader(
                'Content-Disposition',
                `attachment; filename=bang-data-export-${exportData.exported_at}.json`,
            )
                .setHeader('Content-Type', 'application/json')
                .send(JSON.stringify(exportData, null, 2));
            return;
        },
    );

    router.post(
        '/settings/data/import',
        context.middleware.authentication,
        async (req: Request, res: Response) => {
            const { config } = req.body;

            if (!config) {
                throw new context.errors.ValidationError({ config: 'Please provide a config' });
            }

            let importData;
            try {
                importData = JSON.parse(req.body.config);
            } catch (error) {
                throw new context.errors.ValidationError({ config: 'Invalid JSON format' });
            }

            if (!importData.version || importData.version !== '1.0') {
                throw new context.errors.ValidationError({ config: 'Config version must be 1.0' });
            }

            const userId = req.session.user?.id;

            try {
                await context.db.transaction(async (trx) => {
                    // Import bookmarks
                    if (importData.bookmarks?.length > 0) {
                        const bookmarks = importData.bookmarks.map(
                            (bookmark: {
                                title: string;
                                url: string;
                                pinned?: boolean;
                                hidden?: boolean;
                            }) => ({
                                user_id: userId,
                                title: bookmark.title,
                                url: bookmark.url,
                                pinned: bookmark.pinned || false,
                                hidden: bookmark.hidden || false,
                                created_at: context.db.fn.now(),
                            }),
                        );
                        await trx('bookmarks').insert(bookmarks);
                    }

                    // Import actions
                    if (importData.actions?.length > 0) {
                        for (const action of importData.actions) {
                            if (['search', 'redirect'].includes(action.action_type)) {
                                // Check if action already exists for this user
                                const existingAction = await trx('bangs')
                                    .where({
                                        user_id: userId,
                                        trigger: action.trigger,
                                    })
                                    .first();

                                // Only insert if it doesn't already exist
                                if (!existingAction) {
                                    await trx('bangs').insert({
                                        user_id: userId,
                                        trigger: action.trigger,
                                        name: action.name,
                                        url: action.url,
                                        action_type: action.action_type,
                                        hidden: action.hidden || false,
                                        created_at: context.db.fn.now(),
                                    });
                                }
                            }
                        }
                    }

                    // Import notes
                    if (importData.notes?.length > 0) {
                        const notes = importData.notes.map(
                            (note: {
                                title: string;
                                content: string;
                                pinned?: boolean;
                                hidden?: boolean;
                            }) => ({
                                user_id: userId,
                                title: note.title,
                                content: note.content,
                                pinned: note.pinned || false,
                                hidden: note.hidden || false,
                                created_at: context.db.fn.now(),
                            }),
                        );

                        await trx('notes').insert(notes);
                    }

                    // Import tabs and tab items
                    if (importData.tabs?.length > 0) {
                        for (const tabData of importData.tabs) {
                            // Check if tab already exists for this user
                            const existingTab = await trx('tabs')
                                .where({
                                    user_id: userId,
                                    trigger: tabData.trigger,
                                })
                                .first();

                            let tabId;
                            if (!existingTab) {
                                // Insert the tab if it doesn't exist
                                const [newTabId] = await trx('tabs')
                                    .insert({
                                        user_id: userId,
                                        trigger: tabData.trigger,
                                        title: tabData.title,
                                        created_at: context.db.fn.now(),
                                    })
                                    .returning('id');
                                tabId = newTabId;
                            } else {
                                tabId = existingTab.id;
                            }

                            // Insert the tab items if they exist
                            if (tabData.items?.length > 0) {
                                const tabItems = tabData.items.map(
                                    (item: { title: string; url: string }) => ({
                                        tab_id: typeof tabId === 'object' ? tabId.id : tabId,
                                        title: item.title,
                                        url: item.url,
                                        created_at: context.db.fn.now(),
                                    }),
                                );

                                await trx('tab_items').insert(tabItems);
                            }
                        }
                    }

                    // Import reminders
                    if (importData.reminders?.length > 0) {
                        const reminders = importData.reminders.map(
                            (reminder: {
                                title: string;
                                content?: string;
                                reminder_type: string;
                                frequency?: string;
                                due_date?: string;
                            }) => ({
                                user_id: userId,
                                title: reminder.title,
                                content: reminder.content || null,
                                reminder_type: reminder.reminder_type,
                                frequency: reminder.frequency || null,
                                due_date: reminder.due_date || null,
                                created_at: context.db.fn.now(),
                            }),
                        );
                        await trx('reminders').insert(reminders);
                    }

                    // Import user preferences
                    if (importData.user_preferences) {
                        const userPrefs = importData.user_preferences;
                        const updateData: any = {};

                        // Only update allowed fields
                        if (userPrefs.username) {
                            updateData.username = userPrefs.username;
                        }
                        if (userPrefs.default_search_provider) {
                            updateData.default_search_provider = userPrefs.default_search_provider;
                        }
                        if (userPrefs.autocomplete_search_on_homepage !== undefined) {
                            updateData.autocomplete_search_on_homepage =
                                userPrefs.autocomplete_search_on_homepage;
                        }
                        if (userPrefs.column_preferences) {
                            updateData.column_preferences =
                                typeof userPrefs.column_preferences === 'string'
                                    ? userPrefs.column_preferences
                                    : JSON.stringify(userPrefs.column_preferences);
                        }
                        if (userPrefs.timezone) {
                            // Validate timezone before importing
                            const validTimezones = [
                                'UTC',
                                'America/New_York',
                                'America/Chicago',
                                'America/Denver',
                                'America/Los_Angeles',
                                'Europe/London',
                                'Europe/Paris',
                                'Europe/Berlin',
                                'Asia/Tokyo',
                                'Asia/Shanghai',
                                'Asia/Kolkata',
                                'Australia/Sydney',
                            ];
                            if (validTimezones.includes(userPrefs.timezone)) {
                                updateData.timezone = userPrefs.timezone;
                            }
                        }

                        if (Object.keys(updateData).length > 0) {
                            await trx('users').where('id', userId).update(updateData);

                            // Update session with new preferences
                            if (req.session?.user) {
                                if (updateData.column_preferences) {
                                    try {
                                        req.session.user.column_preferences =
                                            typeof updateData.column_preferences === 'string'
                                                ? JSON.parse(updateData.column_preferences)
                                                : updateData.column_preferences;
                                    } catch (error) {
                                        // Handle parsing error gracefully
                                    }
                                }
                                if (updateData.timezone) {
                                    req.session.user.timezone = updateData.timezone;
                                }
                            }
                        }
                    }
                });

                req.flash('success', 'Data imported successfully!');
            } catch (error) {
                context.logger.error('Import error: %o', error);
                req.flash('error', 'Failed to import data. Please check the format and try again.');
            }

            return res.redirect('/settings/data');
        },
    );

    router.post(
        '/settings/danger-zone/delete',
        context.middleware.authentication,
        async (req: Request, res: Response) => {
            const user = req.session.user;

            if (!user) {
                throw new context.errors.NotFoundError('User not found');
            }

            const confirmation = req.body.confirmation?.trim();
            if (confirmation !== 'DELETE ACCOUNT') {
                throw new context.errors.ValidationError({
                    confirmation: 'You must type "DELETE ACCOUNT" to confirm account deletion',
                });
            }

            const exportOptions = req.body.export_options || [];
            const includeJson = Array.isArray(exportOptions)
                ? exportOptions.includes('json')
                : exportOptions === 'json';
            const includeHtml = Array.isArray(exportOptions)
                ? exportOptions.includes('html')
                : exportOptions === 'html';

            if (includeJson || includeHtml) {
                try {
                    await context.utils.mail.sendDataExportEmail({
                        email: user.email,
                        username: user.username,
                        req,
                        includeJson,
                        includeHtml,
                    });
                } catch (error) {
                    context.logger.error(
                        'Failed to send export email before account deletion: %o',
                        {
                            error,
                        },
                    );
                }
            }

            await context.db('users').where({ id: user.id }).delete();

            if ((req.session && req.session.user) || req.user) {
                req.session.user = null;
                req.user = undefined;
                req.session.destroy((error) => {
                    if (error) {
                        throw new context.errors.HttpError(500, 'Failed to destroy session', req);
                    }
                });
            }

            return res.redirect(`/?toast=🗑️ You're account has been delted!`);
        },
    );

    router.post(
        '/settings/danger-zone/bulk-delete',
        context.middleware.authentication,
        async (req: Request, res: Response) => {
            const user = req.session.user;

            if (!user) {
                throw new context.errors.NotFoundError('User not found');
            }

            const deleteOptions = req.body.delete_options || [];
            const deleteActions = Array.isArray(deleteOptions)
                ? deleteOptions.includes('actions')
                : deleteOptions === 'actions';
            const deleteTabs = Array.isArray(deleteOptions)
                ? deleteOptions.includes('tabs')
                : deleteOptions === 'tabs';
            const deleteBookmarks = Array.isArray(deleteOptions)
                ? deleteOptions.includes('bookmarks')
                : deleteOptions === 'bookmarks';
            const deleteNotes = Array.isArray(deleteOptions)
                ? deleteOptions.includes('notes')
                : deleteOptions === 'notes';
            const deleteReminders = Array.isArray(deleteOptions)
                ? deleteOptions.includes('reminders')
                : deleteOptions === 'reminders';
            const deleteApiKeys = Array.isArray(deleteOptions)
                ? deleteOptions.includes('api_keys')
                : deleteOptions === 'api_keys';

            // Check if all options are selected - if so, require confirmation
            const allOptionsSelected =
                deleteActions &&
                deleteTabs &&
                deleteBookmarks &&
                deleteNotes &&
                deleteReminders &&
                deleteApiKeys;

            if (allOptionsSelected) {
                const confirmation = req.body.confirmation?.trim();
                if (confirmation !== 'DELETE DATA') {
                    throw new context.errors.ValidationError({
                        confirmation:
                            'You must type "DELETE DATA" to confirm bulk deletion of all data',
                    });
                }
            }

            if (
                !deleteActions &&
                !deleteTabs &&
                !deleteBookmarks &&
                !deleteNotes &&
                !deleteReminders &&
                !deleteApiKeys
            ) {
                throw new context.errors.ValidationError({
                    delete_options: 'Please select at least one data type to delete',
                });
            }

            try {
                await context.db.transaction(async (trx) => {
                    const deleteCounts: { [key: string]: number } = {};

                    if (deleteActions) {
                        const count = await trx('bangs').where({ user_id: user.id }).delete();
                        deleteCounts.actions = count;
                    }

                    if (deleteTabs) {
                        const count = await trx('tabs').where({ user_id: user.id }).delete();
                        deleteCounts.tabs = count;
                    }

                    if (deleteBookmarks) {
                        const count = await trx('bookmarks').where({ user_id: user.id }).delete();
                        deleteCounts.bookmarks = count;
                    }

                    if (deleteNotes) {
                        const count = await trx('notes').where({ user_id: user.id }).delete();
                        deleteCounts.notes = count;
                    }

                    if (deleteReminders) {
                        const count = await trx('reminders').where({ user_id: user.id }).delete();
                        deleteCounts.reminders = count;
                    }

                    if (deleteApiKeys) {
                        await trx('users').where({ id: user.id }).update({
                            api_key: null,
                            api_key_version: 0,
                            api_key_created_at: null,
                        });
                        deleteCounts.api_keys = 1; // Always 1 since it's per user
                    }

                    const processedItems = [];
                    if (deleteActions) {
                        const count = deleteCounts.actions ?? 0;
                        processedItems.push(count > 0 ? `${count} actions` : '0 actions');
                    }
                    if (deleteTabs) {
                        const count = deleteCounts.tabs ?? 0;
                        processedItems.push(count > 0 ? `${count} tabs` : '0 tabs');
                    }
                    if (deleteBookmarks) {
                        const count = deleteCounts.bookmarks ?? 0;
                        processedItems.push(count > 0 ? `${count} bookmarks` : '0 bookmarks');
                    }
                    if (deleteNotes) {
                        const count = deleteCounts.notes ?? 0;
                        processedItems.push(count > 0 ? `${count} notes` : '0 notes');
                    }
                    if (deleteReminders) {
                        const count = deleteCounts.reminders ?? 0;
                        processedItems.push(count > 0 ? `${count} reminders` : '0 reminders');
                    }
                    if (deleteApiKeys) {
                        processedItems.push('API keys');
                    }

                    if (processedItems.length > 0) {
                        req.flash(
                            'success',
                            `🗑️ Successfully processed: ${processedItems.join(', ')}`,
                        );
                    } else {
                        req.flash('info', 'No data types were selected for deletion');
                    }
                });
            } catch (error) {
                context.logger.error('Bulk delete error: %o', error);
                req.flash('error', 'Failed to delete data. Please try again.');
            }

            return res.redirect('/settings/danger-zone');
        },
    );

    return router;
}
