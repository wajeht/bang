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
			apiKeyPayload: ApiKeyPayload | null;
		}
	}
}

import { defaultSearchProviders } from './configs';

export type DefaultSearchProviders = keyof typeof defaultSearchProviders;

export type ActionTypes = 'bookmark' | 'redirect' | 'search';

export type ApiKeyPayload = { userId: number; apiKeyVersion: number };

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
