import type { Request } from 'express';
import type { User, PageType, AppContext } from '../type.js';

interface HiddenItem {
    readonly id?: number;
    readonly user_id: number;
    readonly hidden?: boolean | number;
}

type HiddenItemType = 'note' | 'bookmark' | 'bang';

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

    return {
        requireUser(user: User | null | undefined): User {
            if (!user) throw new context.errors.UnauthorizedError();

            return user;
        },
        extractPaginationParams(req: Request, pageType: PageType | 'admin') {
            const user = this.requireUser(req.user);

            const prefKey = PAGE_TYPE_TO_PREFERENCE[pageType];
            const prefs = user.column_preferences[prefKey];
            const defaultPerPage = prefs?.default_per_page || (pageType === 'reminders' ? 20 : 10);

            const rawDirection = context.libs.z
                .string()
                .catch('')
                .parse(req.query.direction)
                ?.toLowerCase();

            const direction = rawDirection === 'asc' ? 'asc' : 'desc';

            return {
                perPage:
                    parseInt(context.libs.z.string().catch('').parse(req.query.per_page), 10) ||
                    defaultPerPage ||
                    10,
                page: parseInt(context.libs.z.string().catch('').parse(req.query.page), 10) || 1,
                search: (
                    context.libs.z.string().catch('').parse(req.query.search) || ''
                ).toLowerCase(),
                sortKey:
                    context.libs.z.string().catch('').parse(req.query.sort_key) || 'created_at',
                direction,
            };
        },

        extractIdsForDelete(req: Request): number[] {
            let ids: number[] = [];

            // Check if ID is provided in params
            if (req.params.id) {
                ids = [parseInt(String(req.params.id ?? ''))];
            }

            // Check if IDs are provided in body (for bulk delete)
            if (req.body.id) {
                if (Array.isArray(req.body.id)) {
                    const bodyIds = req.body.id;
                    ids = [];

                    for (let i = 0; i < bodyIds.length; i++) {
                        const parsed = parseInt(bodyIds[i]);

                        if (!isNaN(parsed)) {
                            ids.push(parsed);
                        }
                    }
                } else {
                    // If params.id is not set and body.id is not an array, it's an error
                    if (!req.params.id) {
                        throw new context.errors.ValidationError({ id: 'IDs array is required' });
                    }

                    ids = [parseInt(req.body.id)];
                }
            }

            if (ids.length === 0) {
                throw new context.errors.ValidationError({ id: 'No valid IDs provided' });
            }

            return ids;
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

        extractApiKey(req: Request): string | undefined {
            const apiKey = req.header('X-API-KEY');
            const authHeader = req.header('Authorization');

            if (authHeader?.startsWith('Bearer ')) {
                return authHeader.substring(7);
            }

            return apiKey;
        },

        expectsJson(req: Request): boolean {
            return req.header('Content-Type')?.includes('application/json') || false;
        },

        isApiRequest(req: Request): boolean {
            if (req.path.startsWith('/api/')) {
                return true;
            }

            if (this.extractApiKey(req)) {
                return true;
            }

            const acceptsJson = req.header('Accept')?.includes('application/json');
            const sendsJson = req.header('Content-Type')?.includes('application/json');

            if (req.method === 'GET' || req.method === 'HEAD') {
                return acceptsJson === true;
            }

            return acceptsJson === true && sendsJson === true;
        },

        canAccessHiddenItem(req: Request, item: HiddenItem, resourceType: HiddenItemType): boolean {
            if (!req.user || item.user_id !== req.user.id) return false;

            if (!item.hidden) return true;

            // Authentication middleware verifies this credential before protected handlers run.
            // Response negotiation and a session alone never grant API-key authority.
            if (this.extractApiKey(req)) return true;

            const now = Date.now();
            const verifiedAt = req.session?.hiddenItemsVerifiedAt;

            if (
                req.session?.hiddenItemsVerified &&
                verifiedAt != null &&
                now >= verifiedAt &&
                now - verifiedAt < 30 * 60 * 1000
            )
                return true;

            const expiresAt = req.session?.verifiedHiddenItems?.[`${resourceType}_${item.id}`];

            return expiresAt != null && expiresAt > now;
        },

        assertCanAccessHiddenItem(
            req: Request,
            item: HiddenItem,
            resourceType: HiddenItemType,
        ): void {
            if (!req.user || item.user_id !== req.user.id) {
                throw new context.errors.NotFoundError('Item not found');
            }

            if (!this.canAccessHiddenItem(req, item, resourceType)) {
                throw new context.errors.ForbiddenError(
                    'Verify your hidden-items password before accessing this item.',
                );
            }
        },

        canViewHiddenItems(req: Request, user: User) {
            const showHidden = req.query?.hidden === 'true';

            const hasVerifiedPassword = !!(
                req.session?.hiddenItemsVerified &&
                req.session?.hiddenItemsVerifiedAt &&
                Date.now() - req.session.hiddenItemsVerifiedAt < 30 * 60 * 1000 // 30 minutes
            );

            const canViewHidden =
                showHidden && hasVerifiedPassword && !!user?.hidden_items_password;

            return {
                canViewHidden,
                hasVerifiedPassword,
                showHidden,
            };
        },
    };
}
