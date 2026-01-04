import type { Request } from 'express';
import type { User, PageType, AppContext } from '../type';

export function createRequest(context: AppContext) {
    const logger = context.logger.tag('service', 'request');
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
        async extractUser(req: Request): Promise<User> {
            if (this.isApiRequest(req) && req.apiKeyPayload) {
                try {
                    return await context.db
                        .select('*')
                        .from('users')
                        .where({ id: req.apiKeyPayload.userId })
                        .first();
                } catch (error) {
                    logger.tag('op', 'extract-user').error('Failed to extract user', { error });
                    throw new context.errors.HttpError(500, 'Failed to extract user!', req);
                }
            }

            if (req.session?.user) {
                return req.session.user;
            }

            throw new context.errors.HttpError(500, 'User not found from request!', req);
        },

        extractPaginationParams(req: Request, pageType: PageType | 'admin') {
            const user = req.user as User;

            const prefKey = PAGE_TYPE_TO_PREFERENCE[pageType];
            const prefs = user.column_preferences[prefKey];
            const defaultPerPage = prefs?.default_per_page || (pageType === 'reminders' ? 20 : 10);

            const rawDirection = (req.query.direction as string)?.toLowerCase();
            const direction = rawDirection === 'asc' ? 'asc' : 'desc';

            return {
                perPage: parseInt(req.query.per_page as string, 10) || defaultPerPage || 10,
                page: parseInt(req.query.page as string, 10) || 1,
                search: ((req.query.search as string) || '').toLowerCase(),
                sortKey: (req.query.sort_key as string) || 'created_at',
                direction,
            };
        },

        extractIdsForDelete(req: Request): number[] {
            let ids: number[] = [];

            // Check if ID is provided in params
            if (req.params.id) {
                ids = [parseInt(req.params.id as unknown as string)];
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

        canViewHiddenItems(req: Request, user: User) {
            const showHidden = req.query?.hidden === 'true';
            const hasVerifiedPassword = !!(
                (
                    req.session?.hiddenItemsVerified &&
                    req.session?.hiddenItemsVerifiedAt &&
                    Date.now() - req.session.hiddenItemsVerifiedAt < 30 * 60 * 1000
                ) // 30 minutes
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
