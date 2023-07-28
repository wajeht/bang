export enum Role {
	USER = 'USER',
	ADMIN = 'ADMIN',
}

export interface User {
	id: string;
	username: string;
	email: string;
	password: string;
	role: Role;
	profile_picture_url?: string;
	verification_token?: string;
	verification_token_expires_at?: Date;
	reset_password_token?: string;
	reset_password_token_expires_at?: Date;
	verified?: boolean;
	verified_at?: Date;
	created_at: Date;
	updated_at: Date;
}
