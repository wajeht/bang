import {
    HttpError,
    NotFoundError,
    ForbiddenError,
    ValidationError,
    UnauthorizedError,
    UnimplementedFunctionError,
} from './error';
import {
    CsrfMiddleware,
    ErrorMiddleware,
    HelmetMiddleware,
    LayoutMiddleware,
    SessionMiddleware,
    NotFoundMiddleware,
    TurnstileMiddleware,
    RateLimitMiddleware,
    AdminOnlyMiddleware,
    StaticAssetsMiddleware,
    AppLocalStateMiddleware,
    AuthenticationMiddleware,
} from './routes/middleware';
import { libs } from './libs';
import { config } from './config';
import { Database } from './db/db';
import { Utils } from './utils/util';
import { CronService } from './crons';
import { logger } from './utils/logger';
import { DateUtils } from './utils/date';
import { HtmlUtils } from './utils/html';
import { AuthUtils } from './utils/auth';
import { MailUtils } from './utils/mail';
import { SearchUtils } from './utils/search';
import { RequestUtils } from './utils/request';
import { ValidationUtils } from './utils/validation';
import { TabsRepository } from './routes/tabs/tabs.repo';
import { NotesRepository } from './routes/notes/notes.repo';
import { UsersRepository } from './routes/admin/admin.repo';
import { SessionCleanupUtils } from './utils/session-cleanup';
import { ActionsRepository } from './routes/actions/actions.repo';
import { BookmarksRepository } from './routes/bookmarks/bookmarks.repo';
import { RemindersRepository } from './routes/reminders/reminders.repo';
import type { AppContext, Models, Services, Utilities, Middlewares } from './type';

export async function Context(): Promise<AppContext> {
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

    const database = Database({ config, logger, libs });

    const partialCtx = {
        libs,
        config,
        errors,
        logger,
        database,
        db: database.instance,
    } as any;

    const html = HtmlUtils();
    const auth = AuthUtils(partialCtx);
    const date = DateUtils(partialCtx);
    const utilUtils = Utils(partialCtx);
    const validation = ValidationUtils();
    const request = RequestUtils(partialCtx);

    const utilities: Utilities = {
        date,
        html,
        auth,
        request,
        validation,
        util: utilUtils,
        mail: MailUtils(partialCtx),
        search: SearchUtils(partialCtx),
        sessionCleanup: SessionCleanupUtils(partialCtx),
    };

    partialCtx.utils = utilities;

    const models: Models = {
        tabs: TabsRepository(partialCtx),
        notes: NotesRepository(partialCtx),
        users: UsersRepository(partialCtx),
        actions: ActionsRepository(partialCtx),
        bookmarks: BookmarksRepository(partialCtx),
        reminders: RemindersRepository(partialCtx),
    };

    partialCtx.models = models;

    const middlewares: Middlewares = {
        csrf: CsrfMiddleware(partialCtx),
        helmet: HelmetMiddleware(partialCtx),
        session: SessionMiddleware(partialCtx),
        notFound: NotFoundMiddleware(partialCtx),
        errorHandler: ErrorMiddleware(partialCtx),
        turnstile: TurnstileMiddleware(partialCtx),
        rateLimit: RateLimitMiddleware(partialCtx),
        adminOnly: AdminOnlyMiddleware(partialCtx),
        staticAssets: StaticAssetsMiddleware(partialCtx),
        appLocalState: AppLocalStateMiddleware(partialCtx),
        authentication: AuthenticationMiddleware(partialCtx),
        layout: LayoutMiddleware({ layoutsDir: '_layouts', defaultLayout: '_layouts/public.html' }),
    };

    partialCtx.middleware = middlewares;

    const services: Services = {
        crons: CronService(partialCtx),
    };

    partialCtx.services = services;

    const ctx: AppContext = partialCtx as AppContext;

    return config.app.env === 'production' ? Object.freeze(ctx) : ctx;
}
