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
    createTurnstileMiddleware,
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

function assertProductionConfig(): void {
    const insecure: string[] = [];
    if (config.session.secret === 'bang') insecure.push('SESSION_SECRET');
    if (config.app.secretSalt === 'bang') insecure.push('APP_SECRET_SALT');
    if (config.app.apiKeySecret === 'bang') insecure.push('APP_API_KEY_SECRET');

    if (insecure.length > 0) {
        throw new Error(
            `Refusing to start in production with default secrets: ${insecure.join(', ')}. ` +
                `Set these environment variables to long random values. ` +
                `Leaving them at the 'bang' default makes session cookies and magic-link login tokens forgeable.`,
        );
    }

    // Magic-link emails are built from APP_URL in production; if it's left at the default
    // 'localhost' the links point at the recipient's own machine and nobody can log in.
    if (config.app.appUrl === 'localhost') {
        throw new Error(
            `Refusing to start in production with APP_URL unset (defaulting to 'localhost'). ` +
                `Set APP_URL to the full public origin (e.g. https://example.com) so magic-link login emails resolve.`,
        );
    }
}

export async function createContext(): Promise<AppContext> {
    if (!config) {
        throw new Error('Configuration required for app context');
    }

    if (config.app.env === 'production') {
        assertProductionConfig();
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

    const partialCtx = {
        libs,
        config,
        errors,
        logger,
        database,
        db: database.instance,
    } as any;

    const html = createHtml();
    const auth = createAuth(partialCtx);
    const date = createDate(partialCtx);
    const utils = createUtil(partialCtx);
    const validation = createValidation();
    const request = createRequest(partialCtx);
    const assets = createAssets();

    const utilities: Utilities = {
        date,
        html,
        auth,
        assets,
        request,
        validation,
        util: utils,
        mail: createMail(partialCtx),
        search: createSearch(partialCtx),
        template: createTemplate(partialCtx),
        ntfy: createNtfy(partialCtx),
    };

    partialCtx.utils = utilities;

    const models: Models = {
        tabs: createTabsRepository(partialCtx),
        notes: createNotesRepository(partialCtx),
        users: createUsersRepository(partialCtx),
        actions: createActionsRepository(partialCtx),
        bookmarks: createBookmarksRepository(partialCtx),
        reminders: createRemindersRepository(partialCtx),
        settings: createSettingsRepository(partialCtx),
    };

    partialCtx.models = models;

    const middlewares: Middlewares = {
        csrf: createCsrfMiddleware(partialCtx),
        helmet: createHelmetMiddleware(partialCtx),
        session: createSessionMiddleware(partialCtx),
        notFound: createNotFoundMiddleware(partialCtx),
        errorHandler: createErrorMiddleware(partialCtx),
        turnstile: createTurnstileMiddleware(partialCtx),
        rateLimit: createRateLimitMiddleware(partialCtx),
        adminOnly: createAdminOnlyMiddleware(partialCtx),
        staticAssets: createStaticAssetsMiddleware(partialCtx),
        appLocalState: createAppLocalStateMiddleware(partialCtx),
        authentication: createAuthenticationMiddleware(partialCtx),
        speculationRules: createSpeculationRulesMiddleware(),
        layout: createLayoutMiddleware({
            layoutsDir: '_layouts',
            defaultLayout: '_layouts/public.html',
        }),
        requestLogger: createRequestLoggerMiddleware(partialCtx),
    };

    partialCtx.middleware = middlewares;

    const services: Services = {
        crons: createCronService(partialCtx),
    };

    partialCtx.services = services;

    const ctx: AppContext = partialCtx as AppContext;

    return config.app.env === 'production' ? Object.freeze(ctx) : ctx;
}
