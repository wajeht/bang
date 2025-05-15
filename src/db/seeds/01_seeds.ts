import dotenv from 'dotenv';
import { Knex } from 'knex';
import path from 'node:path';

const env = dotenv.config({ path: path.resolve(path.join(process.cwd(), '..', '..', '.env')) });

export async function seed(knex: Knex): Promise<void> {
    try {
        await knex('bangs').del();
        await knex('bookmarks').del();
        await knex('users').del();
        await knex('sessions').del();

        const [user] = await knex('users')
            .insert({
                username: env.parsed?.APP_ADMIN_EMAIL?.split('@')[0] || 'admin',
                email: env.parsed?.APP_ADMIN_EMAIL || 'admin@example.com',
                is_admin: true,
                autocomplete_search_on_homepage: true,
                default_search_provider: 'duckduckgo',
                column_preferences: JSON.stringify({
                    bookmarks: {
                        title: true,
                        url: true,
                        default_per_page: 10,
                        created_at: true,
                    },
                    actions: {
                        name: true,
                        trigger: true,
                        url: true,
                        default_per_page: 10,
                        created_at: true,
                    },
                    notes: {
                        title: true,
                        content: true,
                        default_per_page: 10,
                        created_at: true,
                        view_type: 'table',
                    },
                }),
            })
            .returning('*');

        let actionTypes = await knex('action_types').select('*');

        if (actionTypes.length === 0) {
            console.log('No action types found. Creating them now...');

            await knex('action_types').insert([
                { name: 'search', description: 'Search action' },
                { name: 'redirect', description: 'Redirect action' },
                { name: 'bookmark', description: 'Bookmark action' },
            ]);

            actionTypes = await knex('action_types').select('*');
        }

        const searchType = actionTypes.find((type) => type.name === 'search');
        const redirectType = actionTypes.find((type) => type.name === 'redirect');
        const bookmarkType = actionTypes.find((type) => type.name === 'bookmark');

        if (!searchType || !redirectType || !bookmarkType) {
            throw new Error('Required action types not found');
        }

        const bangs = [
            {
                user_id: user.id,
                trigger: '!g',
                name: 'Google Search',
                action_type_id: searchType.id,
                url: 'https://www.google.com/search?q={query}',
            },
            {
                user_id: user.id,
                trigger: '!ddg',
                name: 'DuckDuckGo Search',
                action_type_id: searchType.id,
                url: 'https://duckduckgo.com/?q={query}',
            },
            {
                user_id: user.id,
                trigger: '!gh',
                name: 'GitHub',
                action_type_id: redirectType.id,
                url: 'https://github.com',
            },
            {
                user_id: user.id,
                trigger: '!yt',
                name: 'YouTube Search',
                action_type_id: searchType.id,
                url: 'https://www.youtube.com/results?search_query={query}',
            },
            {
                user_id: user.id,
                trigger: '!maps',
                name: 'Google Maps',
                action_type_id: searchType.id,
                url: 'https://www.google.com/maps/search/{query}',
            },
            {
                user_id: user.id,
                trigger: '!w',
                name: 'Wikipedia',
                action_type_id: searchType.id,
                url: 'https://en.wikipedia.org/wiki/Special:Search/{query}',
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
            {
                user_id: user.id,
                url: 'https://www.typescriptlang.org/docs/',
                title: 'TypeScript Documentation',
            },
            {
                user_id: user.id,
                url: 'https://nodejs.org/docs/latest/api/',
                title: 'Node.js Documentation',
            },
        ];

        await knex('bookmarks').insert(bookmarks);

        const notes = [
            {
                user_id: user.id,
                title: 'Note 1',
                content: 'This is the content of note 1',
            },
            {
                user_id: user.id,
                title: 'Note 2',
                content: 'This is the content of note 2',
            },
        ];

        await knex('notes').insert(notes);
    } catch (error) {
        console.error('Seed failed:', error);
        throw error;
    }
}
