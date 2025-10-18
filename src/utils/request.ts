import type { Request } from 'express';
import type { User, PageType, AppContext } from '../type';

export function RequestUtils(context: AppContext) {
    async function extractUser(req: Request): Promise<User> {
        if (context.utils.auth.isApiRequest(req) && req.apiKeyPayload) {
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
    }

    function extractPaginationParams(req: Request, pageType: PageType | 'admin') {
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
    }

    return {
        extractUser,
        extractPaginationParams,
    };
}
