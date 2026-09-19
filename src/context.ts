import {
    HttpError,
    NotFoundError,
    ForbiddenError,
    ValidationError,
    UnauthorizedError,
    UnimplementedFunctionError,
} from './error.js';
import {
    createCsrfMiddleware,
    createErrorMiddleware,
    createHelmetMiddleware,
    createLayoutMiddleware,
    createSessionMiddleware,
    createNotFoundMiddleware,
    createCapMiddleware,
    createRateLimitMiddleware,
    createAdminOnlyMiddleware,
    createStaticAssetsMiddleware,
    createRequestLoggerMiddleware,
    createAppLocalStateMiddleware,
    createAuthenticationMiddleware,
    createSpeculationRulesMiddleware,
} from './routes/middleware.js';
import { libs } from './libs.js';
import { config } from './config.js';
import { createDatabase } from './db/db.js';
import { createUtil } from './utils/util.js';
import { createCronService } from './crons.js';
import { createDate } from './utils/date.js';
import { createHtml } from './utils/html.js';
import { createAuth } from './utils/auth.js';
import { createMail } from './utils/mail.js';
import { createNtfy } from './utils/ntfy.js';
import { createAssets } from './utils/assets.js';
import { createLogger, Log } from './utils/logger.js';
import { createSearch } from './utils/search.js';
import { createRequest } from './utils/request.js';
import { createTemplate } from './utils/template.js';
import { createValidation } from './utils/validation.js';
import { createTabsRepository } from './routes/tabs/tabs.repository.js';
import { createNotesRepository } from './routes/notes/notes.repository.js';
import { createUsersRepository } from './routes/admin/admin.repository.js';
import { createActionsRepository } from './routes/actions/actions.repository.js';
import { createBookmarksRepository } from './routes/bookmarks/bookmarks.repository.js';
import { createRemindersRepository } from './routes/reminders/reminders.repository.js';
import { createSettingsRepository } from './routes/admin/settings.repository.js';
import type { AppContext, Models, Services, Utilities, Middlewares } from './type.js';

export async function createContext(): Promise<AppContext> {
    if (!config) {
        throw new Error('Configuration required for app context');
    }

    if (process.env.NODE_ENV === 'testing' || config.app.env === 'testing') {
        Log.setLevel('SILENT');
    } else {
        Log.setLevel(config.app.env === 'development' ? 'DEBUG' : 'INFO');
    }

    const logger = createLogger({ service: 'http' });

    const errors = {
        HttpError,
        NotFoundError,
        ForbiddenError,
        ValidationError,
        UnauthorizedError,
        UnimplementedFunctionError,
    };

    const database = createDatabase({ config, logger, libs });

    // Lazy references let mutually dependent factories share one fully typed context.
    const ctx: AppContext = {
        libs,
        config,
        errors,
        logger,
        database,
        db: database.instance,
        get utils() {
            return utilities;
        },
        get models() {
            return models;
        },
        get middleware() {
            return middlewares;
        },
        get services() {
            return services;
        },
    };

    const html = createHtml();
    const auth = createAuth(ctx);
    const date = createDate(ctx);
    const utils = createUtil(ctx);
    const validation = createValidation(ctx);
    const request = createRequest(ctx);
    const assets = createAssets();

    const utilities: Utilities = {
        date,
        html,
        auth,
        assets,
        request,
        validation,
        util: utils,
        mail: createMail(ctx),
        search: createSearch(ctx),
        template: createTemplate(ctx),
        ntfy: createNtfy(ctx),
    };

    const models: Models = {
        tabs: createTabsRepository(ctx),
        notes: createNotesRepository(ctx),
        users: createUsersRepository(ctx),
        actions: createActionsRepository(ctx),
        bookmarks: createBookmarksRepository(ctx),
        reminders: createRemindersRepository(ctx),
        settings: createSettingsRepository(ctx),
    };

    const middlewares: Middlewares = {
        csrf: createCsrfMiddleware(ctx),
        helmet: createHelmetMiddleware(ctx),
        session: createSessionMiddleware(ctx),
        notFound: createNotFoundMiddleware(ctx),
        errorHandler: createErrorMiddleware(ctx),
        cap: createCapMiddleware(ctx),
        rateLimit: createRateLimitMiddleware(ctx),
        adminOnly: createAdminOnlyMiddleware(ctx),
        staticAssets: createStaticAssetsMiddleware(ctx),
        appLocalState: createAppLocalStateMiddleware(ctx),
        authentication: createAuthenticationMiddleware(ctx),
        speculationRules: createSpeculationRulesMiddleware(),
        layout: createLayoutMiddleware({
            layoutsDir: '_layouts',
            defaultLayout: '_layouts/public.html',
        }),
        requestLogger: createRequestLoggerMiddleware(ctx),
    };

    const services: Services = {
        crons: createCronService(ctx),
    };

    return config.app.env === 'production' ? Object.freeze(ctx) : ctx;
}
