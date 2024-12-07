import dotenv from 'dotenv';
import path from 'node:path';
import { Knex } from 'knex';

const env = dotenv.config({ path: path.resolve(path.join(process.cwd(), '..', '..', '.env')) });

export async function seed(knex: Knex): Promise<void> {
	// Clear existing entries
	await knex('bangs').del();
	await knex('bookmarks').del();
	await knex('users').del();

	// Create admin user
	const [user] = await knex('users')
		.insert({
			username: env.parsed?.APP_ADMIN_EMAIL?.split('@')[0],
			email: env.parsed?.APP_ADMIN_EMAIL,
			is_admin: true,
			default_search_provider: 'duckduckgo',
			created_at: new Date(),
			updated_at: new Date(),
		})
		.returning('*');

	// Get action types
	const actionTypes = await knex('action_types').select('*');
	const searchType = actionTypes.find((type) => type.name === 'search');
	const redirectType = actionTypes.find((type) => type.name === 'redirect');

	// Create sample bangs
	const bangs = [
		{
			user_id: user.id,
			trigger: 'g',
			name: 'Google Search',
			action_type_id: searchType.id,
			url: 'https://www.google.com/search?q={query}',
			created_at: new Date(),
			updated_at: new Date(),
		},
		{
			user_id: user.id,
			trigger: 'gh',
			name: 'GitHub',
			action_type_id: redirectType.id,
			url: 'https://github.com',
			created_at: new Date(),
			updated_at: new Date(),
		},
		{
			user_id: user.id,
			trigger: 'yt',
			name: 'YouTube Search',
			action_type_id: searchType.id,
			url: 'https://www.youtube.com/results?search_query={query}',
			created_at: new Date(),
			updated_at: new Date(),
		},
	];

	await knex('bangs').insert(bangs);
}
