declare module 'express-session' {
	interface SessionData {
		redirectTo?: string;
		user?: User;
		input?: Record<string, unknown>;
		errors?: Record<string, unknown>;
	}
}

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Express {
		interface Request {
			apiKeyPayload?: ApiKeyPayload;
		}
	}
}

export type ActionTypes = 'bookmark' | 'redirect' | 'search';

export type ApiKeyPayload = {
	userId: string;
	apiKeyVersion: number;
};

export type User = {
	id: number;
	username: string;
	email: string;
	default_search_provider: 'duckduckgo' | 'google' | 'yahoo' | 'bing';
	default_per_page: number;
	is_admin: boolean;
	created_at: string;
	updated_at: string;
};

export type Env = 'production' | 'development' | 'testing';

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

export type GitHubOauthToken = {
	access_token: string;
};

export type BookmarkToExport = {
	url: string;
	title: string;
	/** Unix timestamp in seconds representing when the bookmark was added */
	add_date: number;
};
