import type { Request, Response } from 'express';
import type { User, ApiKeyPayload, AppContext } from '../../type';

export function SettingsRouter(ctx: AppContext) {
    const VALID_TIMEZONES = new Set([
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
    ]);
    const VALID_REMINDER_TIMINGS = new Set(['daily', 'weekly', 'monthly']);
    const VALID_NOTE_VIEW_TYPES = new Set(['card', 'table']);
    const VALID_ACTION_TYPES = new Set(['search', 'redirect']);
    const REGEX_TIME_FORMAT = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

    const router = ctx.libs.express.Router();

    router.get('/settings', ctx.middleware.authentication, async (_req: Request, res: Response) => {
        return res.redirect('/settings/account');
    });

    router.get(
        '/settings/account',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            return res.render('settings/settings-account.html', {
                user: req.session?.user,
                title: 'Settings Account',
                path: '/settings/account',
                layout: '_layouts/settings.html',
                defaultSearchProviders: Object.keys(
                    ctx.utils.search.searchConfig.defaultSearchProviders,
                ),
            });
        },
    );

    router.get(
        '/settings/data',
        ctx.middleware.authentication,
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
        ctx.middleware.authentication,
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
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const {
                username,
                email,
                default_search_provider,
                autocomplete_search_on_homepage,
                timezone,
                theme,
            } = req.body;

            if (!username) {
                throw new ctx.errors.ValidationError({ username: 'Username is required' });
            }

            if (!email) {
                throw new ctx.errors.ValidationError({ email: 'Email is required' });
            }

            if (!default_search_provider) {
                throw new ctx.errors.ValidationError({
                    default_search_provider: 'Default search provider is required',
                });
            }

            if (!ctx.utils.validation.isValidEmail(email)) {
                throw new ctx.errors.ValidationError({
                    email: 'Please enter a valid email address',
                });
            }

            if (!ctx.utils.search.searchConfig.validSearchProviders.has(default_search_provider)) {
                throw new ctx.errors.ValidationError({
                    default_search_provider: 'Invalid search provider selected',
                });
            }

            if (!timezone) {
                throw new ctx.errors.ValidationError({ timezone: 'Timezone is required' });
            }

            if (!VALID_TIMEZONES.has(timezone)) {
                throw new ctx.errors.ValidationError({ timezone: 'Invalid timezone selected' });
            }

            let parsedAutocompleteSearchOnHomepage = false;
            if (autocomplete_search_on_homepage === undefined) {
                parsedAutocompleteSearchOnHomepage = false;
            } else if (autocomplete_search_on_homepage !== 'on') {
                throw new ctx.errors.ValidationError({
                    autocomplete_search_on_homepage:
                        'Invalid autocomplete search on homepage format',
                });
            } else {
                parsedAutocompleteSearchOnHomepage = true;
            }

            const validThemes = ['system', 'light', 'dark'];
            if (!theme || !validThemes.includes(theme)) {
                throw new ctx.errors.ValidationError({ theme: 'Invalid theme selected' });
            }

            // Check if username is being changed and if it's already taken by another user
            const currentUserId = (req.user as User).id;
            if (username !== (req.user as User).username) {
                const existingUser = await ctx
                    .db('users')
                    .where({ username })
                    .whereNot({ id: currentUserId })
                    .first();
                if (existingUser) {
                    throw new ctx.errors.ValidationError({
                        username: 'Username is already taken',
                    });
                }
            }

            // Check if email is being changed and if it's already taken by another user
            if (email !== (req.user as User).email) {
                const existingUser = await ctx
                    .db('users')
                    .where({ email })
                    .whereNot({ id: currentUserId })
                    .first();
                if (existingUser) {
                    throw new ctx.errors.ValidationError({
                        email: 'Email address is already in use',
                    });
                }
            }

            const updatedUser = await ctx
                .db('users')
                .update({
                    email,
                    username,
                    default_search_provider,
                    autocomplete_search_on_homepage: parsedAutocompleteSearchOnHomepage,
                    timezone,
                    theme,
                })
                .where({ id: currentUserId })
                .returning('*');

            if (req.session?.user) {
                req.session.user = {
                    ...updatedUser[0],
                    column_preferences: ctx.utils.util.parseColumnPreferences(
                        updatedUser[0].column_preferences,
                    ),
                } as User;
                req.session.save();
            }

            if (req.user) {
                req.user = {
                    ...updatedUser[0],
                    column_preferences: ctx.utils.util.parseColumnPreferences(
                        updatedUser[0].column_preferences,
                    ),
                } as User;
            }

            req.flash('success', '🔄 updated!');
            return res.redirect('/settings/account');
        },
    );

    router.post(
        '/settings/display',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const { column_preferences } = req.body;

            if (!column_preferences || typeof column_preferences !== 'object') {
                throw new ctx.errors.ValidationError({
                    column_preferences: 'Column preferences must be an object',
                });
            }

            // bookmarks
            if (typeof column_preferences.bookmarks !== 'object') {
                throw new ctx.errors.ValidationError({
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
                throw new ctx.errors.ValidationError({
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
                throw new ctx.errors.ValidationError({
                    bookmarks: 'At least one bookmark column must be enabled',
                });
            }

            // actions
            if (typeof column_preferences.actions !== 'object') {
                throw new ctx.errors.ValidationError({ actions: 'Actions must be an object' });
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
                throw new ctx.errors.ValidationError({
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
                throw new ctx.errors.ValidationError({
                    actions: 'At least one action column must be enabled',
                });
            }

            // notes
            if (typeof column_preferences.notes !== 'object') {
                throw new ctx.errors.ValidationError({ notes: 'Notes must be an object' });
            }

            column_preferences.notes.title = column_preferences.notes.title === 'on';
            column_preferences.notes.content = column_preferences.notes.content === 'on';
            column_preferences.notes.created_at = column_preferences.notes.created_at === 'on';
            column_preferences.notes.pinned = column_preferences.notes.pinned === 'on';
            column_preferences.notes.hidden = column_preferences.notes.hidden === 'on';

            if (
                column_preferences.notes.view_type &&
                !VALID_NOTE_VIEW_TYPES.has(column_preferences.notes.view_type)
            ) {
                column_preferences.notes.view_type = 'table'; // Default to table if invalid
            }

            if (
                !column_preferences.notes.title &&
                !column_preferences.notes.content &&
                !column_preferences.notes.pinned &&
                !column_preferences.notes.hidden
            ) {
                throw new ctx.errors.ValidationError({
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
                throw new ctx.errors.ValidationError({
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
                    throw new ctx.errors.ValidationError({ tabs: 'Tabs must be an object' });
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
                    throw new ctx.errors.ValidationError({
                        tabs: 'Tabs per page must be greater than 0',
                    });
                }

                if (
                    !column_preferences.tabs.title &&
                    !column_preferences.tabs.trigger &&
                    !column_preferences.tabs.items_count &&
                    !column_preferences.tabs.created_at
                ) {
                    throw new ctx.errors.ValidationError({
                        tabs: 'At least one tab column must be enabled',
                    });
                }
            }

            // users (admin only)
            if (req.user?.is_admin && column_preferences.users) {
                if (typeof column_preferences.users !== 'object') {
                    throw new ctx.errors.ValidationError({ users: 'Users must be an object' });
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
                    throw new ctx.errors.ValidationError({
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
                    throw new ctx.errors.ValidationError({
                        users: 'At least one user column must be enabled',
                    });
                }
            }

            // reminders
            if (column_preferences.reminders) {
                if (typeof column_preferences.reminders !== 'object') {
                    throw new ctx.errors.ValidationError({
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
                    throw new ctx.errors.ValidationError({
                        reminders: 'Reminders per page must be greater than 0',
                    });
                }

                if (column_preferences.reminders.default_reminder_timing) {
                    if (
                        !VALID_REMINDER_TIMINGS.has(
                            column_preferences.reminders.default_reminder_timing,
                        )
                    ) {
                        throw new ctx.errors.ValidationError({
                            reminders: 'Invalid reminder timing. Must be daily, weekly, or monthly',
                        });
                    }
                }

                // Validate default_reminder_time (HH:MM format)
                if (column_preferences.reminders.default_reminder_time) {
                    if (
                        !REGEX_TIME_FORMAT.test(column_preferences.reminders.default_reminder_time)
                    ) {
                        throw new ctx.errors.ValidationError({
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
                    throw new ctx.errors.ValidationError({
                        reminders: 'At least one reminder column must be enabled',
                    });
                }
            }

            const user = req.user as User;
            const { path, hidden } = req.body;

            // Merge submitted preferences with existing user preferences to preserve unmodified sections
            const updatedPreferences = { ...user.column_preferences } as any;
            const sections = Object.keys(column_preferences);
            for (let i = 0; i < sections.length; i++) {
                const section = sections[i] as keyof typeof column_preferences;
                if (
                    column_preferences[section] &&
                    typeof column_preferences[section] === 'object'
                ) {
                    updatedPreferences[section] = {
                        ...updatedPreferences[section],
                        ...column_preferences[section],
                    };
                }
            }

            await ctx
                .db('users')
                .where('id', user.id)
                .update({
                    column_preferences: JSON.stringify(updatedPreferences),
                });

            req.session.user!.column_preferences = updatedPreferences;

            req.user!.column_preferences = updatedPreferences;

            req.flash('success', 'Column settings updated');

            const basePath = path || '/settings/preferences';
            const redirectUrl = hidden === 'true' ? `${basePath}?hidden=true` : basePath;
            return res.redirect(redirectUrl);
        },
    );

    router.post(
        '/settings/create-api-key',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const user = await ctx.db('users').where({ id: req.session.user?.id }).first();

            if (!user) {
                throw new ctx.errors.NotFoundError('User not found');
            }

            // Convert SQLite integer values to booleans
            user.is_admin = Boolean(user.is_admin);
            user.autocomplete_search_on_homepage = Boolean(user.autocomplete_search_on_homepage);

            const newKeyVersion = (user.api_key_version || 0) + 1;

            const payload: ApiKeyPayload = { userId: user.id, apiKeyVersion: newKeyVersion };

            const [updatedUser] = await ctx
                .db('users')
                .where({ id: req.session?.user?.id })
                .update({
                    api_key: await ctx.utils.auth.generateApiKey(payload),
                    api_key_version: newKeyVersion,
                    api_key_created_at: ctx.db.fn.now(),
                })
                .returning('*');

            if (req.session?.user) {
                req.session.user = {
                    ...updatedUser,
                    column_preferences: ctx.utils.util.parseColumnPreferences(
                        updatedUser.column_preferences,
                    ),
                } as User;
                req.session.save();
            }

            if (req.user) {
                req.user = {
                    ...updatedUser,
                    column_preferences: ctx.utils.util.parseColumnPreferences(
                        updatedUser.column_preferences,
                    ),
                } as User;
            }

            req.flash('success', '📱 api key created');
            return res.redirect(`/settings/account`);
        },
    );

    router.get(
        '/api/settings/api-key',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const user = await ctx.db('users').where({ id: req.session.user?.id }).first();

            if (!user || !user.api_key) {
                return res.status(404).json({ error: 'API key not found' });
            }

            return res.json({ api_key: user.api_key });
        },
    );

    router.post(
        '/settings/hidden-password',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const { currentPassword, newPassword, confirmPassword, removePassword } = req.body;
            const user = req.session.user as User;

            if (removePassword === 'on') {
                if (!user.hidden_items_password) {
                    throw new ctx.errors.ValidationError({
                        removePassword: 'No password to remove',
                    });
                }

                if (!currentPassword) {
                    throw new ctx.errors.ValidationError({
                        currentPassword: 'Current password is required to remove it',
                    });
                }

                const isValid = await ctx.libs.bcrypt.compare(
                    currentPassword,
                    user.hidden_items_password,
                );

                if (!isValid) {
                    throw new ctx.errors.ValidationError({
                        currentPassword: 'Incorrect password',
                    });
                }

                await ctx.db.transaction(async (trx) => {
                    await trx('users')
                        .where({ id: user.id })
                        .update({ hidden_items_password: null });
                    await trx('notes').where({ user_id: user.id }).update({ hidden: false });
                    await trx('bookmarks').where({ user_id: user.id }).update({ hidden: false });
                    await trx('bangs').where({ user_id: user.id }).update({ hidden: false });
                });

                if (req.session?.user) {
                    req.session.user.hidden_items_password = null;
                    req.session.save();
                }

                if (req.user) {
                    req.user.hidden_items_password = null;
                }

                req.flash('success', '🔓 Password removed and all items unhidden');
                return res.redirect('/settings/account');
            }

            if (user.hidden_items_password) {
                if (!currentPassword) {
                    throw new ctx.errors.ValidationError({
                        currentPassword: 'Current password is required',
                    });
                }

                const isValid = await ctx.libs.bcrypt.compare(
                    currentPassword,
                    user.hidden_items_password,
                );

                if (!isValid) {
                    throw new ctx.errors.ValidationError({
                        currentPassword: 'Incorrect password',
                    });
                }

                if (!newPassword) {
                    return res.redirect('/settings/account');
                }
            } else {
                if (!newPassword) {
                    throw new ctx.errors.ValidationError({
                        newPassword: 'Password is required',
                    });
                }
            }

            if (newPassword && newPassword.length < 4) {
                throw new ctx.errors.ValidationError({
                    newPassword: 'Password must be at least 4 characters',
                });
            }

            if (user.hidden_items_password && newPassword !== confirmPassword) {
                throw new ctx.errors.ValidationError({
                    confirmPassword: 'Passwords do not match',
                });
            }

            // NOTE: this will make testing way faster
            const saltRounds = ctx.config.app.env === 'testing' ? 4 : 10;
            const hashedPassword = await ctx.libs.bcrypt.hash(newPassword, saltRounds);

            await ctx
                .db('users')
                .where({ id: user.id })
                .update({ hidden_items_password: hashedPassword });

            if (req.session?.user) {
                req.session.user.hidden_items_password = hashedPassword;
                req.session.save();
            }

            if (req.user) {
                req.user.hidden_items_password = hashedPassword;
            }

            req.flash(
                'success',
                user.hidden_items_password ? '🔄 Password updated' : '🔐 Password set',
            );
            return res.redirect('/settings/account');
        },
    );

    router.post(
        '/settings/data/export',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const { options } = req.body;

            if (!options || !Array.isArray(options) || options.length === 0) {
                throw new ctx.errors.ValidationError({
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

            const exportData = await ctx.utils.util.generateUserDataExport(userId, {
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
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const { config } = req.body;

            if (!config) {
                throw new ctx.errors.ValidationError({ config: 'Please provide a config' });
            }

            let importData;
            try {
                importData = JSON.parse(req.body.config);
            } catch {
                throw new ctx.errors.ValidationError({ config: 'Invalid JSON format' });
            }

            if (!importData.version || importData.version !== '1.0') {
                throw new ctx.errors.ValidationError({ config: 'Config version must be 1.0' });
            }

            const userId = req.session.user?.id;

            try {
                await ctx.db.transaction(async (trx) => {
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
                                created_at: ctx.db.fn.now(),
                            }),
                        );
                        await trx('bookmarks').insert(bookmarks);
                    }

                    // Import actions
                    if (importData.actions?.length > 0) {
                        for (const action of importData.actions) {
                            if (VALID_ACTION_TYPES.has(action.action_type)) {
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
                                        created_at: ctx.db.fn.now(),
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
                                created_at: ctx.db.fn.now(),
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
                                        created_at: ctx.db.fn.now(),
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
                                        created_at: ctx.db.fn.now(),
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
                                created_at: ctx.db.fn.now(),
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
                            if (VALID_TIMEZONES.has(userPrefs.timezone)) {
                                updateData.timezone = userPrefs.timezone;
                            }
                        }
                        if (userPrefs.theme) {
                            const validThemes = ['system', 'light', 'dark'];
                            if (validThemes.includes(userPrefs.theme)) {
                                updateData.theme = userPrefs.theme;
                            }
                        }

                        if (Object.keys(updateData).length > 0) {
                            await trx('users').where('id', userId).update(updateData);

                            if (req.session?.user) {
                                if (updateData.username) {
                                    req.session.user.username = updateData.username;
                                }
                                if (updateData.default_search_provider) {
                                    req.session.user.default_search_provider =
                                        updateData.default_search_provider;
                                }
                                if (updateData.autocomplete_search_on_homepage !== undefined) {
                                    req.session.user.autocomplete_search_on_homepage =
                                        updateData.autocomplete_search_on_homepage;
                                }
                                if (updateData.column_preferences) {
                                    try {
                                        req.session.user.column_preferences =
                                            typeof updateData.column_preferences === 'string'
                                                ? JSON.parse(updateData.column_preferences)
                                                : updateData.column_preferences;
                                    } catch {
                                        // Handle parsing error gracefully
                                    }
                                }
                                if (updateData.timezone) {
                                    req.session.user.timezone = updateData.timezone;
                                }
                                if (updateData.theme) {
                                    req.session.user.theme = updateData.theme;
                                }
                                req.session.save();
                            }

                            if (req.user) {
                                if (updateData.username) {
                                    req.user.username = updateData.username;
                                }
                                if (updateData.default_search_provider) {
                                    req.user.default_search_provider =
                                        updateData.default_search_provider;
                                }
                                if (updateData.autocomplete_search_on_homepage !== undefined) {
                                    req.user.autocomplete_search_on_homepage =
                                        updateData.autocomplete_search_on_homepage;
                                }
                                if (updateData.column_preferences) {
                                    try {
                                        req.user.column_preferences =
                                            typeof updateData.column_preferences === 'string'
                                                ? JSON.parse(updateData.column_preferences)
                                                : updateData.column_preferences;
                                    } catch {
                                        // Handle parsing error gracefully
                                    }
                                }
                                if (updateData.timezone) {
                                    req.user.timezone = updateData.timezone;
                                }
                                if (updateData.theme) {
                                    req.user.theme = updateData.theme;
                                }
                            }
                        }
                    }
                });

                req.flash('success', 'Data imported successfully!');
            } catch (error) {
                ctx.logger.error('Import error', { error });
                req.flash('error', 'Failed to import data. Please check the format and try again.');
            }

            return res.redirect('/settings/data');
        },
    );

    router.post(
        '/settings/danger-zone/delete',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const user = req.session.user;

            if (!user) {
                throw new ctx.errors.NotFoundError('User not found');
            }

            const confirmation = req.body.confirmation?.trim();
            if (confirmation !== 'DELETE ACCOUNT') {
                throw new ctx.errors.ValidationError({
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
                    await ctx.utils.mail.sendDataExportEmail({
                        email: user.email,
                        username: user.username,
                        req,
                        includeJson,
                        includeHtml,
                    });
                } catch (error) {
                    ctx.logger.error('Failed to send export email before account deletion', {
                        error,
                    });
                }
            }

            await ctx.db('users').where({ id: user.id }).delete();

            if ((req.session && req.session.user) || req.user) {
                req.session.user = null;
                req.user = undefined;
                req.session.destroy((error) => {
                    if (error) {
                        throw new ctx.errors.HttpError(500, 'Failed to destroy session', req);
                    }
                });
            }

            return res.redirect(`/?toast=🗑️ You're account has been delted!`);
        },
    );

    router.post(
        '/settings/danger-zone/bulk-delete',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const user = req.session.user;

            if (!user) {
                throw new ctx.errors.NotFoundError('User not found');
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
                    throw new ctx.errors.ValidationError({
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
                throw new ctx.errors.ValidationError({
                    delete_options: 'Please select at least one data type to delete',
                });
            }

            try {
                await ctx.db.transaction(async (trx) => {
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
                        deleteCounts.api_keys = 1;

                        if (req.session?.user) {
                            req.session.user.api_key = null;
                            req.session.user.api_key_version = 0;
                            req.session.user.api_key_created_at = null;
                            req.session.save();
                        }

                        if (req.user) {
                            req.user.api_key = null;
                            req.user.api_key_version = 0;
                            req.user.api_key_created_at = null;
                        }
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
                ctx.logger.error('Bulk delete error', { error });
                req.flash('error', 'Failed to delete data. Please try again.');
            }

            return res.redirect('/settings/danger-zone');
        },
    );

    return router;
}
