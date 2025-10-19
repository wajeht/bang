import type { Request } from 'express';
import type { User, PageType, AppContext } from '../type';

export function RequestUtils(context: AppContext) {
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
                    context.logger.error(`Failed to extract user: %o`, { error });
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
            let defaultPerPage = 10;

            if (pageType === 'actions') {
                defaultPerPage = user.column_preferences.actions.default_per_page;
            }

            if (pageType === 'bookmarks') {
                defaultPerPage = user.column_preferences.bookmarks.default_per_page;
            }

            if (pageType === 'notes') {
                defaultPerPage = user.column_preferences.notes.default_per_page;
            }

            if (pageType === 'tabs') {
                defaultPerPage = user.column_preferences.tabs?.default_per_page || 10;
            }

            if (pageType === 'reminders') {
                defaultPerPage = user.column_preferences.reminders?.default_per_page || 20;
            }

            if (pageType === 'admin') {
                defaultPerPage = user.column_preferences.users.default_per_page;
            }

            return {
                perPage: parseInt(req.query.per_page as string, 10) || defaultPerPage || 10,
                page: parseInt(req.query.page as string, 10) || 1,
                search: ((req.query.search as string) || '').toLowerCase(),
                sortKey: (req.query.sort_key as string) || 'created_at',
                direction: (req.query.direction as string) || 'desc',
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
                    ids = req.body.id
                        .map((id: string) => parseInt(id))
                        .filter((id: number) => !isNaN(id));
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
    };
}
