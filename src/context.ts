import {
    HttpError,
    NotFoundError,
    ForbiddenError,
    ValidationError,
    UnauthorizedError,
    UnimplementedFunctionError,
} from './error';
import {
    helmetMiddleware,
    layoutMiddleware,
    createCsrfMiddleware,
    createErrorMiddleware,
    staticAssetsMiddleware,
    createSessionMiddleware,
    createNotFoundMiddleware,
    createTurnstileMiddleware,
    createRateLimitMiddleware,
    createAdminOnlyMiddleware,
    createAppLocalStateMiddleware,
    createAuthenticationMiddleware,
} from './routes/middleware';
import { libs } from './libs';
import { config } from './config';
import { logger } from './utils/logger';
import { createDatabase } from './db/db';
import { createCronService } from './crons';
import { createDateUtils } from './utils/date';
import { createHtmlUtils } from './utils/html';
import { createAuthUtils } from './utils/auth';
import { createMailUtils } from './utils/mail';
import { createUtilUtils } from './utils/util';
import { createSearchUtils } from './utils/search';
import { createRequestUtils } from './utils/request';
import { createSessionCleanupUtils } from './utils/session-cleanup';
import { createTabsRepo } from './routes/tabs/tabs.repo';
import { createValidationUtils } from './utils/validation';
import { createNotesRepo } from './routes/notes/notes.repo';
import { createUsersRepo } from './routes/admin/admin.repo';
import { createActionsRepo } from './routes/actions/actions.repo';
import { createBookmarksRepo } from './routes/bookmarks/bookmarks.repo';
import { createRemindersRepo } from './routes/reminders/reminders.repo';
import type { AppContext, Models, Services, Utilities, Middlewares } from './type';

export async function createContext(): Promise<AppContext> {
    if (!config) {
        throw new Error('Configuration required for app context');
    }

    if (!logger) {
        throw new Error('Logger required for app context');
    }

    const errors = {
        HttpError,
        NotFoundError,
        ForbiddenError,
        ValidationError,
        UnauthorizedError,
        UnimplementedFunctionError,
    };

    const database = createDatabase({ config, logger, libs });

    const partialCtx = {
        config,
        logger,
        db: database.instance,
        database,
        errors,
        libs,
    } as any;

    const auth = createAuthUtils(partialCtx);
    const date = createDateUtils(partialCtx);
    const html = createHtmlUtils(partialCtx);
    const utilUtils = createUtilUtils(partialCtx);
    const request = createRequestUtils(partialCtx);
    const validation = createValidationUtils(partialCtx);

    const utilities: Utilities = {
        date,
        html,
        auth,
        request,
        validation,
        util: utilUtils,
        mail: createMailUtils(partialCtx),
        search: createSearchUtils(partialCtx),
        sessionCleanup: createSessionCleanupUtils(partialCtx),
    };

    partialCtx.utils = utilities;

    const models: Models = {
        tabs: createTabsRepo(partialCtx),
        notes: createNotesRepo(partialCtx),
        users: createUsersRepo(partialCtx),
        actions: createActionsRepo(partialCtx),
        bookmarks: createBookmarksRepo(partialCtx),
        reminders: createRemindersRepo(partialCtx),
    };

    partialCtx.models = models;

    const middlewares: Middlewares = {
        notFound: createNotFoundMiddleware(partialCtx),
        errorHandler: createErrorMiddleware(partialCtx),
        turnstile: createTurnstileMiddleware(partialCtx),
        adminOnly: createAdminOnlyMiddleware(partialCtx),
        authentication: createAuthenticationMiddleware(partialCtx),
        helmet: helmetMiddleware(partialCtx),
        session: createSessionMiddleware(partialCtx),
        csrf: createCsrfMiddleware(partialCtx),
        rateLimit: createRateLimitMiddleware(partialCtx),
        appLocalState: createAppLocalStateMiddleware(partialCtx),
        staticAssets: staticAssetsMiddleware(partialCtx),
        layout: layoutMiddleware({
            defaultLayout: '_layouts/public.html',
            layoutsDir: '_layouts',
        }),
    };

    partialCtx.middleware = middlewares;

    const services: Services = {
        crons: createCronService(partialCtx),
    };

    partialCtx.services = services;

    const ctx: AppContext = partialCtx as AppContext;

    return config.app.env === 'production' ? Object.freeze(ctx) : ctx;
}
