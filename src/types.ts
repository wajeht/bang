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
			user: User | null;
			apiKeyPayload: ApiKeyPayload | null;
		}
	}
}

import { defaultSearchProviders } from './configs';

export type DefaultSearchProviders = keyof typeof defaultSearchProviders;

export type ActionTypes = 'bookmark' | 'redirect' | 'search';

export type ApiKeyPayload = { userId: number; apiKeyVersion: number };

export type Env = 'production' | 'development' | 'testing';

export type GitHubOauthToken = { access_token: string };

export interface Api {
	generate: (payload: ApiKeyPayload) => Promise<string>;
	verify: (apiKey: string) => Promise<ApiKeyPayload | null>;
}

export type User = {
	id: number;
	username: string;
	email: string;
	default_search_provider: DefaultSearchProviders;
	default_per_page: number;
	is_admin: boolean;
	created_at: string;
	updated_at: string;
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
