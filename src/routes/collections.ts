import express, { Request, Response } from 'express';
import { Actions, Bookmarks, Notes, Tabs, Reminders, User } from '../type';
import { extractPagination } from '../utils/util';

export function createCollectionsRoutes(
    actions: Actions,
    bookmarks: Bookmarks,
    notes: Notes,
    tabs: Tabs,
    reminders: Reminders,
) {
    const router = express.Router();

    router.get('/api/collections', async (req: Request, res: Response) => {
        const user = req.user as User;
        const actionsParams = extractPagination(req, 'actions');
        const bookmarksParams = extractPagination(req, 'bookmarks');
        const notesParams = extractPagination(req, 'notes');
        const tabsParams = extractPagination(req, 'tabs');
        const remindersParams = extractPagination(req, 'reminders');

        const [actionsResult, bookmarksResult, notesResult, tabsResult, remindersResult] =
            await Promise.all([
                actions.all({
                    user,
                    perPage: actionsParams.perPage,
                    page: actionsParams.page,
                    search: actionsParams.search,
                    sortKey: actionsParams.sortKey,
                    direction: actionsParams.direction,
                }),
                bookmarks.all({
                    user,
                    perPage: bookmarksParams.perPage,
                    page: bookmarksParams.page,
                    search: bookmarksParams.search,
                    sortKey: bookmarksParams.sortKey,
                    direction: bookmarksParams.direction,
                }),
                notes.all({
                    user,
                    perPage: notesParams.perPage,
                    page: notesParams.page,
                    search: notesParams.search,
                    sortKey: notesParams.sortKey,
                    direction: notesParams.direction,
                }),
                tabs.all({
                    user,
                    perPage: tabsParams.perPage,
                    page: tabsParams.page,
                    search: tabsParams.search,
                    sortKey: tabsParams.sortKey,
                    direction: tabsParams.direction,
                }),
                reminders.all({
                    user,
                    perPage: remindersParams.perPage,
                    page: remindersParams.page,
                    search: remindersParams.search,
                    sortKey: remindersParams.sortKey,
                    direction: remindersParams.direction,
                }),
            ]);

        res.json({
            actions: actionsResult,
            bookmarks: bookmarksResult,
            notes: notesResult,
            tabs: tabsResult,
            reminders: remindersResult,
            search: actionsParams.search,
            sortKey: actionsParams.sortKey,
            direction: actionsParams.direction,
        });
    });

    return router;
}
