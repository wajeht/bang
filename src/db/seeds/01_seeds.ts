import dotenv from 'dotenv';
import { Knex } from 'knex';
import path from 'node:path';
import { logger } from '../../utils/logger';
import { title } from 'node:process';

const env = dotenv.config({
    path: path.resolve(path.join(process.cwd(), '..', '..', '.env')),
    quiet: true,
});

export async function seed(knex: Knex): Promise<void> {
    try {
        await knex('tab_items').del();
        await knex('tabs').del();
        await knex('notes').del();
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
                        pinned: true,
                    },
                    actions: {
                        name: true,
                        trigger: true,
                        url: true,
                        default_per_page: 10,
                        last_read_at: true,
                        created_at: true,
                    },
                    notes: {
                        title: true,
                        content: true,
                        default_per_page: 10,
                        created_at: true,
                        pinned: true,
                        view_type: 'table',
                    },
                    users: {
                        username: true,
                        email: true,
                        is_admin: true,
                        default_per_page: 10,
                        email_verified_at: true,
                        created_at: true,
                    },
                }),
                email_verified_at: knex.fn.now(),
            })
            .returning('*');

        let actionTypes = await knex('action_types').select('*');

        if (actionTypes.length === 0) {
            logger.info('No action types found. Creating them now...');

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
                last_read_at: null,
                url: 'https://www.google.com/search?q={query}',
            },
            {
                user_id: user.id,
                trigger: '!ddg',
                name: 'DuckDuckGo Search',
                action_type_id: searchType.id,
                last_read_at: null,
                url: 'https://duckduckgo.com/?q={query}',
            },
            {
                user_id: user.id,
                trigger: '!gh',
                name: 'GitHub',
                action_type_id: redirectType.id,
                last_read_at: null,
                url: 'https://github.com',
            },
            {
                user_id: user.id,
                trigger: '!yt',
                name: 'YouTube Search',
                action_type_id: searchType.id,
                last_read_at: null,
                url: 'https://www.youtube.com/results?search_query={query}',
            },
            {
                user_id: user.id,
                trigger: '!maps',
                name: 'Google Maps',
                action_type_id: searchType.id,
                last_read_at: null,
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
                pinned: true,
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
                pinned: true,
                content: `## 📝 Note 1

This is the **content** of _note 1_.

### List:
- ✅ Task 1
- ❌ Task 2

### Link:
[Visit Example](https://example.com)

### Inline Code:
Here is some \`inline code\`.

### Code Block:
\`\`\`js
console.log('Hello, Note 1');
\`\`\`
`,
            },
            {
                user_id: user.id,
                title: 'Note 2',
                content: `## 🔖 Note 2

Here is the \`content\` of **note 2**.

> 💬 This is a blockquote.

### Ordered Steps:
1. Install package
2. Run command
3. Done ✅

### Table:

| Item       | Status |
|------------|--------|
| Feature A  | ✅     |
| Feature B  | ❌     |

### Image:
![Alt Text](https://via.placeholder.com/100)
`,
            },
        ];

        await knex('notes').insert(notes);

        const tabs = await knex('tabs')
            .insert([
                {
                    user_id: user.id,
                    title: 'docs',
                    trigger: '!docs',
                },
                {
                    user_id: user.id,
                    title: 'videos',
                    trigger: '!videos',
                },
            ])
            .returning('*');

        const tabItems = [
            {
                tab_id: tabs[0].id,
                title: 'GitHub - Where the world builds software',
                url: 'https://github.com',
            },
            {
                tab_id: tabs[0].id,
                title: 'MDN Web Docs',
                url: 'https://developer.mozilla.org',
            },
            {
                tab_id: tabs[1].id,
                title: 'rick roll',
                url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            },
        ];

        await knex('tab_items').insert(tabItems);
    } catch (error) {
        logger.error('Seed failed:', error);
        throw error;
    }
}
