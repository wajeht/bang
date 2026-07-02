import type { Context, ErrorHandler, MiddlewareHandler, NotFoundHandler } from 'hono';
import type { Knex } from 'knex';
import type { config } from './config.js';
import type { CronService as CronServiceType } from './crons.js';
import { createDatabase } from './db/db.js';
import type { Libs } from './libs.js';
import { createAssets } from './utils/assets.js';
import { createAuth } from './utils/auth.js';
import { createDate } from './utils/date.js';
import { createHtml } from './utils/html.js';
import { createMail } from './utils/mail.js';
import { createNtfy } from './utils/ntfy.js';
import { createRequest } from './utils/request.js';
import { createSearch } from './utils/search.js';
import { createUtil } from './utils/util.js';
import { createValidation } from './utils/validation.js';

export type DefaultSearchProviders = 'duckduckgo' | 'google' | 'yahoo' | 'bing';

export type PageType = 'actions' | 'bookmarks' | 'notes' | 'tabs' | 'reminders';

export type ActionTypes = 'redirect' | 'search';

export type MagicLinkPayload = { email: string; exp?: number };

export type ReminderType = 'once' | 'recurring';

export type ReminderFrequency = 'daily' | 'weekly' | 'monthly';

export type Env = 'production' | 'development' | 'testing';

export interface AppSessionData {
    redirectTo?: string | null;
    user?: User | null;
    input?: Record<string, unknown> | null;
    errors?: Record<string, unknown> | null;
    searchCount?: number;
    cumulativeDelay?: number;
    verifiedHiddenItems?: Record<string, number>;
    hiddenItemsVerified?: boolean;
    hiddenItemsVerifiedAt?: number;
    userCachedAt?: number;
    csrfToken?: string;
    flash?: Record<string, string[]>;
}

export interface AppSession extends AppSessionData {
    id: string;
    save(callback?: (error?: Error) => void): void;
    destroy(callback?: (error?: Error) => void): void;
    regenerate(callback?: (error?: Error) => void): void;
}

export interface AppLocals {
    state?: Record<string, any>;
    utils?: Record<string, any>;
    csrfToken?: string;
}

export interface AppEnv {
    Variables: {
        body: any;
        locals: AppLocals;
        session: AppSession;
        sessionChanged: boolean;
        sessionDestroyed: boolean;
        requestId: string;
        user: User | undefined;
        logger: Logger;
    };
}

export type AppContextContext = Context<AppEnv>;
export type AppMiddleware = MiddlewareHandler<AppEnv>;

export type Bang = {
    /** Category of the bang (e.g., "Multimedia", "Online Services"). */
    c: string;
    /** Domain or website associated with the bang (e.g., "www.4fitnessrules.com", "fiverr.com"). */
    d: string;
    /** Rank or priority of the bang (e.g., 70, 54). */
    r: number;
    /** Name or title of the bang (e.g., "4 Fitness Rules", "Fiverr"). */
    s: string;
    /** Subcategory of the bang (e.g., "Video", "Jobs"). */
    sc: string;
    /** Trigger or shortcut keyword for the bang (e.g., "4", "5"). */
    t: string;
    /** URL template for the search query. The `{{{s}}}` placeholder is replaced with the user's search term. */
    u: string;
};

export type ColumnPreferences = {
    bookmarks: {
        title: boolean;
        url: boolean;
        default_per_page: number;
        created_at: boolean;
        pinned: boolean;
        hidden: boolean;
    };
    actions: {
        name: boolean;
        trigger: boolean;
        url: boolean;
        action_type: boolean;
        usage_count: boolean;
        default_per_page: number;
        created_at: boolean;
        last_read_at: boolean;
        hidden: boolean;
    };
    notes: {
        title: boolean;
        content: boolean;
        default_per_page: number;
        created_at: boolean;
        pinned: boolean;
        view_type: 'table' | 'list';
        hidden: boolean;
    };
    tabs: {
        title: boolean;
        trigger: boolean;
        items_count: boolean;
        default_per_page: number;
        created_at: boolean;
    };
    reminders: {
        title: boolean;
        content: boolean;
        due_date: boolean;
        frequency: boolean;
        default_per_page: number;
        created_at: boolean;
        default_reminder_timing: string;
        default_reminder_time: string;
    };
    users: {
        username: boolean;
        email: boolean;
        is_admin: boolean;
        email_verified_at: boolean;
        created_at: boolean;
        default_per_page: number;
    };
};

export type User = {
    id: number;
    username: string;
    email: string;
    is_admin: boolean;
    default_search_provider: DefaultSearchProviders;
    bookmarks_per_page: number;
    actions_per_page: number;
    created_at: string;
    updated_at: string;
    column_preferences: ColumnPreferences;
    email_verified_at: string | null;
    timezone: string;
    hidden_items_password?: string | null;
    theme: 'system' | 'light' | 'dark';
};

export type BookmarkToExport = {
    url: string;
    title: string;
    /** Unix timestamp in seconds representing when the bookmark was added */
    add_date: number;
};

export type Action = {
    id?: number;
    name: string;
    trigger: string;
    url: string;
    action_type: ActionTypes;
    user_id: number;
    hidden?: boolean;
    created_at?: string;
};

/**
 * Generic base type for repository query parameters.
 * @template Extra - Additional fields to extend the base query params with
 */
export type RepositoryQueryParams<Extra = object> = {
    user: { id: number };
    perPage: number;
    page: number;
    search: string;
    sortKey: string;
    direction: string;
    isLengthAware?: boolean;
} & Extra;

export type ActionsQueryParams = RepositoryQueryParams<{
    excludeHidden?: boolean;
}>;

export type Bookmark = {
    id?: number;
    title: string;
    url: string;
    user_id: number;
    pinned?: boolean;
    hidden?: boolean;
    created_at?: string;
};

export type BookmarksQueryParams = RepositoryQueryParams<{
    excludeHidden?: boolean;
}>;

export type Note = {
    id?: number;
    title: string;
    content: string;
    user_id: number;
    pinned?: boolean;
    hidden?: boolean;
    created_at?: string;
};

export type NotesQueryParams = RepositoryQueryParams<{
    excludeHidden?: boolean;
}>;

export type Tab = {
    id?: number;
    title: string;
    trigger: string;
    user_id: number;
    created_at?: string;
    updated_at?: string;
    items_count?: number;
    items?: TabItem[];
};

export type TabItem = {
    id?: number;
    tab_id: number;
    title: string;
    url: string;
    created_at?: string;
    updated_at?: string;
};

export type TabsQueryParams = RepositoryQueryParams;

export type Reminder = {
    id?: number;
    title: string;
    content: string | null;
    user_id: number;
    reminder_type: ReminderType;
    frequency: ReminderFrequency | null;
    due_date: Date | string | null;
    created_at?: string;
    updated_at?: string;
};

export type RemindersQueryParams = RepositoryQueryParams;

export type ReminderTimingResult = {
    isValid: boolean;
    type: ReminderType;
    frequency: ReminderFrequency | null;
    specificDate: string | null;
    nextDue: Date;
};

export type Search = (options: {
    c: AppContextContext;
    user: User | undefined;
    query: string;
}) => Promise<void | Response>;

export type Pagination = {
    total: number;
    perPage: number;
    page: number;
    totalPages: number;
};

/**
 * Generic repository interface for CRUD operations.
 * @template Entity - The entity type returned by operations
 * @template Params - Query parameters type for the `all` method
 * @template CreateInput - Input type for the `create` method (defaults to Entity)
 * @template UpdateInput - Input type for the `update` method (defaults to Partial<Entity>)
 */
export interface Repository<Entity, Params, CreateInput = Entity, UpdateInput = Partial<Entity>> {
    all: (params: Params) => Promise<any>;
    create: (item: CreateInput) => Promise<Entity>;
    read: (id: number, userId: number) => Promise<Entity>;
    update: (id: number, userId: number, updates: UpdateInput) => Promise<Entity>;
    delete: (ids: number[], userId: number) => Promise<number>;
}

export type Actions = Repository<
    Action,
    ActionsQueryParams,
    Action & { actionType: ActionTypes },
    Partial<Action> & { actionType: ActionTypes }
>;

export type Bookmarks = Repository<Bookmark, BookmarksQueryParams>;

export type Notes = Repository<Note, NotesQueryParams>;

export type Tabs = Repository<Tab, TabsQueryParams>;

export type Reminders = Repository<Reminder, RemindersQueryParams>;

export type Users = {
    read: (id: number) => Promise<User | null>;
    readByEmail: (email: string) => Promise<User | null>;
};

export type Settings = {
    getAll: () => Promise<Record<string, string>>;
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    setMany: (settings: Record<string, string>) => Promise<void>;
    invalidateCache: () => void;
    getBranding: () => Promise<{
        appName: string;
        appUrl: string;
        showFooter: boolean;
        showSearchPage: boolean;
        showAboutPage: boolean;
    }>;
};

export type LayoutOptions = {
    /** Default layout file path relative to views directory */
    defaultLayout?: string;
    /** Layout directory path relative to views directory */
    layoutsDir?: string;
};

export type TurnstileVerifyResponse = {
    success: boolean;
    'error-codes'?: string[];
    challenge_ts?: string;
    hostname?: string;
    action?: string;
    cdata?: string;
};

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT';

export type Logger = {
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    tag(key: string, value: string): Logger;
    time(message: string, extra?: Record<string, any>): { stop(extra?: Record<string, any>): void };
    table(tabularData: any, properties?: readonly string[]): void;
    box(title: string, content: string | string[]): void;
};

export type LoggerOptions = {
    service?: string;
    level?: LogLevel;
    tags?: Record<string, string>;
};

export type PaginateArrayOptions = {
    page: number;
    perPage: number;
    total: number;
};

export type DateUtils = ReturnType<typeof createDate>;
export type HtmlUtils = ReturnType<typeof createHtml>;
export type ValidationUtils = ReturnType<typeof createValidation>;
export type AssetUtils = ReturnType<typeof createAssets>;
export type AuthUtils = ReturnType<typeof createAuth>;
export type RequestUtils = ReturnType<typeof createRequest>;
export type UtilUtils = ReturnType<typeof createUtil>;
export type SearchUtils = ReturnType<typeof createSearch>;
export type MailUtils = ReturnType<typeof createMail>;
export type NtfyUtils = ReturnType<typeof createNtfy>;

export type Config = typeof config;
export type CronService = CronServiceType;
export type Database = ReturnType<typeof createDatabase>;

export interface Models {
    actions: Actions;
    bookmarks: Bookmarks;
    notes: Notes;
    tabs: Tabs;
    reminders: Reminders;
    users: Users;
    settings: Settings;
}

export interface Services {
    crons: CronService;
}

export interface TemplateUtils {
    render: (view: string, opts?: object) => string;
    engine: (
        filePath: string,
        opts: object,
        callback: (err: Error | null, html?: string) => void,
    ) => void;
}

export interface Utilities {
    date: DateUtils;
    html: HtmlUtils;
    validation: ValidationUtils;
    assets: AssetUtils;
    auth: AuthUtils;
    request: RequestUtils;
    util: UtilUtils;
    search: SearchUtils;
    mail: MailUtils;
    template: TemplateUtils;
    ntfy: NtfyUtils;
}

export interface Middlewares {
    authentication: AppMiddleware;
    notFound: NotFoundHandler;
    errorHandler: ErrorHandler;
    turnstile: AppMiddleware;
    adminOnly: AppMiddleware;
    session: AppMiddleware;
    csrf: AppMiddleware;
    rateLimit: AppMiddleware;
    appLocalState: AppMiddleware;
    speculationRules: AppMiddleware;
    requestLogger: AppMiddleware;
}

export interface ErrorClasses {
    HttpError: new (
        statusCode: number,
        message: string,
    ) => Error & {
        statusCode: number;
    };
    NotFoundError: new (message: string) => Error & {
        statusCode: number;
    };
    ValidationError: new (errors: Record<string, string> | string) => Error & {
        statusCode: number;
        errors?: Record<string, string>;
    };
    UnauthorizedError: new (message: string) => Error & {
        statusCode: number;
    };
    ForbiddenError: new (message: string) => Error & {
        statusCode: number;
    };
    UnimplementedFunctionError: new (message: string) => Error & { statusCode: number };
}

export interface AppContext {
    config: Config;
    logger: Logger;
    db: Knex;
    database: Database;
    errors: ErrorClasses;
    libs: Libs;
    models: Models;
    services: Services;
    utils: Utilities;
    middleware: Middlewares;
}

export interface BangWithLowercase extends Bang {
    _tLower: string;
    _sLower: string;
    _dLower: string;
}
