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

import { CACHE_DURATION, defaultSearchProviders } from './config';

export type PageType = 'actions' | 'bookmarks' | 'notes';

export type CacheDuration = keyof typeof CACHE_DURATION;

export type DefaultSearchProviders = keyof typeof defaultSearchProviders;

export type ActionTypes = 'bookmark' | 'redirect' | 'search';

export type ApiKeyPayload = { userId: number; apiKeyVersion: number };

export type Env = 'production' | 'development' | 'testing';

export type GitHubOauthToken = { access_token: string };

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
	};
	actions: {
		name: boolean;
		trigger: boolean;
		url: boolean;
		default_per_page: number;
		created_at: boolean;
	};
	notes: {
		title: boolean;
		content: boolean;
		default_per_page: number;
		created_at: boolean;
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
};

export interface GitHubUser {
	login: string;
	avatar_url: string;
	name: string;
	email: string;
}

export type GithubUserEmail = {
	email: string;
	primary: boolean;
	verified: boolean;
	visibility: string | null;
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
};

export type Bookmark = {
	id?: number;
	title: string;
	url: string;
	user_id: number;
	created_at?: string;
};

export type BookmarksQueryParams = {
	user: { id: number };
	perPage: number;
	page: number;
	search: string;
	sortKey: string | 'created_at';
	direction: string | 'asc' | 'desc';
};

export type Note = {
	id?: number;
	title: string;
	content: string;
	user_id: number;
	created_at?: string;
};

export type NotesQueryParams = {
	user: { id: number };
	perPage: number;
	page: number;
	search: string;
	sortKey: string | 'created_at';
	direction: string | 'asc' | 'desc';
};
