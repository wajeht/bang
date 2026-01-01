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
    RequestLoggerMiddleware,
    AppLocalStateMiddleware,
    AuthenticationMiddleware,
    SpeculationRulesMiddleware,
} from './routes/middleware';
import { libs } from './libs';
import { config } from './config';
import { Database } from './db/db';
import { Utils } from './utils/util';
import { CronService } from './crons';
import { DateUtils } from './utils/date';
import { HtmlUtils } from './utils/html';
import { AuthUtils } from './utils/auth';
import { MailUtils } from './utils/mail';
import { AssetUtils } from './utils/assets';
import { Logger, Log } from './utils/logger';
import { SearchUtils } from './utils/search';
import { RequestUtils } from './utils/request';
import { TemplateUtils } from './utils/template';
import { ValidationUtils } from './utils/validation';
import { TabsRepository } from './routes/tabs/tabs.repository';
import { NotesRepository } from './routes/notes/notes.repository';
import { UsersRepository } from './routes/admin/admin.repository';
import { ActionsRepository } from './routes/actions/actions.repository';
import { BookmarksRepository } from './routes/bookmarks/bookmarks.repository';
import { RemindersRepository } from './routes/reminders/reminders.repository';
import type { AppContext, Models, Services, Utilities, Middlewares } from './type';

export async function Context(): Promise<AppContext> {
    if (!config) {
        throw new Error('Configuration required for app context');
    }

    if (process.env.NODE_ENV === 'testing' || config.app.env === 'testing') {
        Log.setLevel('SILENT');
    } else {
        Log.setLevel(config.app.env === 'development' ? 'DEBUG' : 'INFO');
    }
    const logger = Logger({ service: 'http' });

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
    const utils = Utils(partialCtx);
    const validation = ValidationUtils();
    const request = RequestUtils(partialCtx);
    const assets = AssetUtils();

    const utilities: Utilities = {
        date,
        html,
        auth,
        assets,
        request,
        validation,
        util: utils,
        mail: MailUtils(partialCtx),
        search: SearchUtils(partialCtx),
        template: TemplateUtils(partialCtx),
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
        speculationRules: SpeculationRulesMiddleware(),
        layout: LayoutMiddleware({ layoutsDir: '_layouts', defaultLayout: '_layouts/public.html' }),
        requestLogger: RequestLoggerMiddleware(partialCtx),
    };

    partialCtx.middleware = middlewares;

    const services: Services = {
        crons: CronService(partialCtx),
    };

    partialCtx.services = services;

    const ctx: AppContext = partialCtx as AppContext;

    return config.app.env === 'production' ? Object.freeze(ctx) : ctx;
}
