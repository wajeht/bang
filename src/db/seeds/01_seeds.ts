import dotenv from 'dotenv';
import { Knex } from 'knex';
import path from 'node:path';

const env = dotenv.config({ path: path.resolve(path.join(process.cwd(), '..', '..', '.env')) });

export async function seed(knex: Knex): Promise<void> {
	await knex('bangs').del();
	await knex('bookmarks').del();
	await knex('users').del();
	await knex('sessions').del();
	// Create admin user
	const [user] = await knex('users')
		.insert({
			username: env.parsed?.APP_ADMIN_EMAIL?.split('@')[0],
			email: env.parsed?.APP_ADMIN_EMAIL,
			is_admin: true,
			default_search_provider: 'duckduckgo',
		})
		.returning('*');
	const actionTypes = await knex('action_types').select('*');
	const searchType = actionTypes.find((type) => type.name === 'search');
	const redirectType = actionTypes.find((type) => type.name === 'redirect');
	const bangs = [
		{
			user_id: user.id,
			trigger: '!b',
			name: 'Bang',
			action_type_id: redirectType.id,
			url: 'http://localhost',
		},
		{
			user_id: user.id,
			trigger: '!g',
			name: 'Google Search',
			action_type_id: searchType.id,
			url: 'https://www.google.com/search?q={query}',
		},
		{
			user_id: user.id,
			trigger: '!gh',
			name: 'GitHub',
			action_type_id: redirectType.id,
			url: 'https://github.com/wajeht/bang',
		},
		{
			user_id: user.id,
			trigger: '!yt',
			name: 'YouTube Search',
			action_type_id: searchType.id,
			url: 'https://www.youtube.com/results?search_query={query}',
		},
	];
	await knex('bangs').insert(bangs);
	const bookmarks = [
		{
			user_id: user.id,
			url: 'https://github.com',
			title: 'GitHub - Where the world builds software',
		},
		{
			user_id: user.id,
			url: 'https://developer.mozilla.org',
			title: 'MDN Web Docs',
		},
		{
			user_id: user.id,
			url: 'https://typescript-eslint.io',
			title: 'TypeScript ESLint Documentation',
		},
	];
	await knex('bookmarks').insert(bookmarks);
}
