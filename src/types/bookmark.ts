import { User } from './user';

export interface Bookmark {
	id: string;
	title: string;
	url: string;
	description: string | null;
	favorite: boolean | false;
	favicon_url: string | null;
	image_url: string | null;
	created_at: Date;
	updated_at: Date;
	user: User;
	user_id: string;
}
