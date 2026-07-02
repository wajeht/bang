import type { AppContext, AppContextContext, AppSession, PageType, User } from '../type.js';

export function createRequest(context: AppContext) {
    type PreferenceKey = 'actions' | 'bookmarks' | 'notes' | 'tabs' | 'reminders' | 'users';
    const PAGE_TYPE_TO_PREFERENCE: Record<PageType | 'admin', PreferenceKey> = {
        actions: 'actions',
        bookmarks: 'bookmarks',
        notes: 'notes',
        tabs: 'tabs',
        reminders: 'reminders',
        admin: 'users',
    };

    function getPaginationParams(
        user: User | undefined,
        query: Record<string, string | undefined>,
        pageType: PageType | 'admin',
    ) {
        if (!user) {
            throw new context.errors.HttpError(500, 'User not found from request!');
        }

        const prefKey = PAGE_TYPE_TO_PREFERENCE[pageType];
        const prefs = user.column_preferences[prefKey];
        const defaultPerPage = prefs?.default_per_page || (pageType === 'reminders' ? 20 : 10);
        const rawDirection = query.direction?.toLowerCase();
        const direction = rawDirection === 'asc' ? 'asc' : 'desc';

        return {
            perPage: parseInt(query.per_page ?? '', 10) || defaultPerPage || 10,
            page: parseInt(query.page ?? '', 10) || 1,
            search: (query.search || '').toLowerCase(),
            sortKey: query.sort_key || 'created_at',
            direction,
        };
    }

    function getIdsForDelete(
        params: Record<string, string | undefined>,
        body: Record<string, any>,
    ): number[] {
        let ids: number[] = [];

        if (params.id) {
            ids = [parseInt(params.id, 10)];
        }

        if (body.id) {
            if (Array.isArray(body.id)) {
                ids = [];
                for (const rawId of body.id) {
                    const parsed = parseInt(rawId, 10);
                    if (!isNaN(parsed)) {
                        ids.push(parsed);
                    }
                }
            } else {
                if (!params.id) {
                    throw new context.errors.ValidationError({ id: 'IDs array is required' });
                }
                ids = [parseInt(body.id, 10)];
            }
        }

        if (ids.length === 0) {
            throw new context.errors.ValidationError({ id: 'No valid IDs provided' });
        }

        return ids;
    }

    function canViewHiddenItemsFromState(
        query: Record<string, string | undefined>,
        session: AppSession | undefined,
        user: User,
    ) {
        const showHidden = query.hidden === 'true';
        const hasVerifiedPassword = !!(
            session?.hiddenItemsVerified &&
            session.hiddenItemsVerifiedAt &&
            Date.now() - session.hiddenItemsVerifiedAt < 30 * 60 * 1000
        );

        const canViewHidden = showHidden && hasVerifiedPassword && !!user?.hidden_items_password;

        return {
            canViewHidden,
            hasVerifiedPassword,
            showHidden,
        };
    }

    return {
        extractPaginationParamsFromContext(c: AppContextContext, pageType: PageType | 'admin') {
            return getPaginationParams(c.get('user'), c.req.query(), pageType);
        },

        extractIdsForDeleteFromContext(c: AppContextContext): number[] {
            return getIdsForDelete(c.req.param(), c.get('body') ?? {});
        },

        /**
         * Strip a user-controlled redirect target down to a same-origin pathname.
         * Prevents open-redirect via protocol-relative URLs like `//evil.com`.
         */
        getSafeRedirectPath(
            rawRedirect: string | undefined,
            extraQuery?: Record<string, string>,
        ): string {
            const url = new URL('http://localhost' + (rawRedirect || '/'));
            if (extraQuery) {
                for (const [key, value] of Object.entries(extraQuery)) {
                    url.searchParams.set(key, value);
                }
            }
            return url.pathname.replace(/^\/+/, '/') + url.search;
        },

        canViewHiddenItemsFromContext(c: AppContextContext, user: User) {
            return canViewHiddenItemsFromState(c.req.query(), c.get('session'), user);
        },
    };
}
