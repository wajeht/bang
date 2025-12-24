import type * as express from 'express';

declare module 'express-session' {
    interface SessionData {
        redirectTo: string | null;
        user: User | null;
        input: Record<string, unknown> | null;
        errors: Record<string, unknown> | null;
        /** The number of searches performed during the session. */
        searchCount: number;
        /** The total cumulative delay time (in milliseconds) encountered during the session. */
        cumulativeDelay: number;
        /** Tracks verified hidden items with expiration timestamps */
        verifiedHiddenItems?: Record<string, number>;
        /** Whether hidden items password has been verified */
        hiddenItemsVerified?: boolean;
        /** Timestamp when hidden items password was verified */
        hiddenItemsVerifiedAt?: number;
        /** Timestamp when user data was cached in session */
        userCachedAt?: number;
        /** Cached map of user's custom bang triggers for O(1) lookup */
        bangTriggersMap?: Record<string, true>;
        /** Cached map of user's tab triggers for O(1) lookup */
        tabTriggersMap?: Record<string, true>;
        /** Timestamp when bang/tab triggers were cached */
        triggersCachedAt?: number;
    }
}

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            user: User | undefined;
            apiKeyPayload: ApiKeyPayload | null;
            logger: Logger;
        }
    }
}

export type DefaultSearchProviders = 'duckduckgo' | 'google' | 'yahoo' | 'bing';

export type PageType = 'actions' | 'bookmarks' | 'notes' | 'tabs' | 'reminders';

export type ActionTypes = 'redirect' | 'search';

export type ApiKeyPayload = { userId: number; apiKeyVersion: number };

export type MagicLinkPayload = { email: string; exp?: number };

export type ReminderType = 'once' | 'recurring';

export type ReminderFrequency = 'daily' | 'weekly' | 'monthly';

export type Env = 'production' | 'development' | 'testing';

export interface Api {
    generate: (payload: ApiKeyPayload) => Promise<string>;
    verify: (apiKey: string) => Promise<ApiKeyPayload | null>;
}

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
    };
    notes: {
        title: boolean;
        content: boolean;
        default_per_page: number;
        created_at: boolean;
        pinned: boolean;
        view_type: 'table' | 'list';
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
    api_key: string;
    api_key_version: number;
    api_key_created_at: string;
    created_at: string;
    updated_at: string;
    column_preferences: ColumnPreferences;
    email_verified_at: string | null;
    autocomplete_search_on_homepage: boolean;
    timezone: string;
    hidden_items_password?: string | null;
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
    sortKey: string | 'created_at';
    direction: string | 'asc' | 'desc';
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
    res: express.Response;
    user: User | undefined;
    query: string;
    req: express.Request;
}) => Promise<void | express.Response>;

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

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export type Logger = {
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    tag(key: string, value: string): Logger;
    clone(): Logger;
    time(message: string, extra?: Record<string, any>): { stop(extra?: Record<string, any>): void };
    table(tabularData: any, properties?: readonly string[]): void;
    box(title: string, content: string | string[]): void;
};

export type LoggerOptions = {
    service?: string;
    level?: LogLevel;
};

export type PaginateArrayOptions = {
    page: number;
    perPage: number;
    total: number;
};

import type { Knex } from 'knex';

import { DateUtils as DateUtilsType } from './utils/date';
import { HtmlUtils as HtmlUtilsType } from './utils/html';
import { AuthUtils as AuthUtilsType } from './utils/auth';
import { MailUtils as MailUtilsType } from './utils/mail';
import { Utils as UtilsType } from './utils/util';
import { SearchUtils as SearchUtilsType } from './utils/search';
import { RequestUtils as RequestUtilsType } from './utils/request';
import { ValidationUtils as ValidationUtilsType } from './utils/validation';
import { CronService as CronServiceType } from './crons';
import { Database as DatabaseType } from './db/db';
import type { config } from './config';
import type { Libs } from './libs';

export type DateUtils = ReturnType<typeof DateUtilsType>;
export type HtmlUtils = ReturnType<typeof HtmlUtilsType>;
export type ValidationUtils = ReturnType<typeof ValidationUtilsType>;
export type AuthUtils = ReturnType<typeof AuthUtilsType>;
export type RequestUtils = ReturnType<typeof RequestUtilsType>;
export type UtilUtils = ReturnType<typeof UtilsType>;
export type SearchUtils = ReturnType<typeof SearchUtilsType>;
export type MailUtils = ReturnType<typeof MailUtilsType>;

export type Config = typeof config;
export type CronService = ReturnType<typeof CronServiceType>;
export type Database = ReturnType<typeof DatabaseType>;

export interface Models {
    actions: Actions;
    bookmarks: Bookmarks;
    notes: Notes;
    tabs: Tabs;
    reminders: Reminders;
    users: Users;
}

export interface Services {
    crons: CronService;
}

export interface TemplateUtils {
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
    auth: AuthUtils;
    request: RequestUtils;
    util: UtilUtils;
    search: SearchUtils;
    mail: MailUtils;
    template: TemplateUtils;
}

export interface Middlewares {
    authentication: express.RequestHandler;
    notFound: express.RequestHandler;
    errorHandler: express.ErrorRequestHandler;
    turnstile: express.RequestHandler;
    adminOnly: express.RequestHandler;
    helmet: express.RequestHandler;
    session: express.RequestHandler;
    csrf: express.RequestHandler[];
    rateLimit: express.RequestHandler;
    appLocalState: express.RequestHandler;
    staticAssets: express.RequestHandler;
    speculationRules: express.RequestHandler;
    layout: express.RequestHandler;
    requestLogger: express.RequestHandler;
}

export interface ErrorClasses {
    HttpError: new (
        statusCode: number,
        message: string,
        req?: express.Request,
    ) => Error & {
        statusCode: number;
        request?: express.Request;
    };
    NotFoundError: new (
        message: string,
        req?: express.Request,
    ) => Error & {
        statusCode: number;
        request?: express.Request;
    };
    ValidationError: new (errors: Record<string, string> | string) => Error & {
        statusCode: number;
        errors?: Record<string, string>;
    };
    UnauthorizedError: new (
        message: string,
        req?: express.Request,
    ) => Error & {
        statusCode: number;
        request?: express.Request;
    };
    ForbiddenError: new (
        message: string,
        req?: express.Request,
    ) => Error & {
        statusCode: number;
        request?: express.Request;
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
