declare module 'express-session' {
	interface SessionData {
		user?: User;
	}
}

export type User = {
	id: number;
	username: string;
	email: string;
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
