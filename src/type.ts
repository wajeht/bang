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
    }
}

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            user: User | undefined;
            apiKeyPayload: ApiKeyPayload | null;
        }
    }
}

import type { Request, Response } from 'express';

export type DefaultSearchProviders = 'duckduckgo' | 'google' | 'yahoo' | 'bing';

export type PageType = 'actions' | 'bookmarks' | 'notes' | 'tabs';

export type ActionTypes = 'bookmark' | 'redirect' | 'search';

export type ApiKeyPayload = { userId: number; apiKeyVersion: number };

export type MagicLinkPayload = { email: string; exp?: number };

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
    action_type_id?: number;
    user_id: number;
    created_at?: string;
};

export type ActionsQueryParams = {
    user: { id: number };
    perPage: number;
    page: number;
    search: string;
    sortKey: string | 'created_at';
    direction: string | 'asc' | 'desc';
    highlight?: boolean;
};

export type Bookmark = {
    id?: number;
    title: string;
    url: string;
    user_id: number;
    pinned?: boolean;
    created_at?: string;
};

export type BookmarksQueryParams = {
    user: { id: number };
    perPage: number;
    page: number;
    search: string;
    sortKey: string | 'created_at';
    direction: string | 'asc' | 'desc';
    highlight?: boolean;
};

export type Note = {
    id?: number;
    title: string;
    content: string;
    user_id: number;
    pinned?: boolean;
    created_at?: string;
};

export type NotesQueryParams = {
    user: { id: number };
    perPage: number;
    page: number;
    search: string;
    sortKey: string | 'created_at';
    direction: string | 'asc' | 'desc';
    highlight?: boolean;
};

export type Search = (options: {
    res: Response;
    user: User | undefined;
    query: string;
    req: Request;
}) => Promise<void | Response>;

export type Pagination = {
    total: number;
    perPage: number;
    page: number;
    totalPages: number;
};

export interface Actions {
    all: (params: ActionsQueryParams) => Promise<any>;
    create: (action: Action & { actionType: string }) => Promise<Action>;
    read: (id: number, userId: number) => Promise<Action & { action_type: string }>;
    update: (id: number, userId: number, updates: Partial<Action> & { actionType: string }) => Promise<Action>; // prettier-ignore
    delete: (id: number, userId: number) => Promise<boolean>;
}

export interface Bookmarks {
    all: (params: BookmarksQueryParams) => Promise<any>;
    create: (bookmark: Bookmark) => Promise<Bookmark>;
    read: (id: number, userId: number) => Promise<Bookmark>;
    update: (id: number, userId: number, updates: Partial<Bookmark>) => Promise<Bookmark>;
    delete: (id: number, userId: number) => Promise<boolean>;
}

export interface Notes {
    all: (params: NotesQueryParams) => Promise<any>;
    create: (note: Note) => Promise<Note>;
    read: (id: number, userId: number) => Promise<Note>;
    update: (id: number, userId: number, updates: Partial<Note>) => Promise<Note>;
    delete: (id: number, userId: number) => Promise<boolean>;
}

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

export type Logger = {
    debug: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    info: (message: string, ...args: unknown[]) => void;
};

export type PaginateArrayOptions = {
    page: number;
    perPage: number;
    total: number;
};
