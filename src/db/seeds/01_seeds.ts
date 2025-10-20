import dotenv from 'dotenv';
import { Knex } from 'knex';
import path from 'node:path';
import bcrypt from 'bcrypt';
import { dayjs } from '../../libs';
import { Logger } from '../../utils/logger';

const logger = Logger();

const env = dotenv.config({
    path: path.resolve(path.join(process.cwd(), '..', '..', '.env')),
    quiet: true,
});

export async function seed(knex: Knex): Promise<void> {
    try {
        await knex('tab_items').del();
        await knex('tabs').del();
        await knex('reminders').del();
        await knex('notes').del();
        await knex('bangs').del();
        await knex('bookmarks').del();
        await knex('users').del();
        await knex('sessions').del();

        const hiddenPassword = await bcrypt.hash('password', 10);

        const [user] = await knex('users')
            .insert({
                username: env.parsed?.APP_ADMIN_EMAIL?.split('@')[0] || 'admin',
                email: env.parsed?.APP_ADMIN_EMAIL || 'admin@example.com',
                is_admin: true,
                autocomplete_search_on_homepage: true,
                default_search_provider: 'duckduckgo',
                timezone: 'America/Chicago',
                hidden_items_password: hiddenPassword,
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
                    tabs: {
                        title: true,
                        trigger: true,
                        items_count: true,
                        default_per_page: 10,
                        created_at: true,
                    },
                    reminders: {
                        title: true,
                        content: true,
                        due_date: true,
                        frequency: true,
                        default_per_page: 10,
                        created_at: true,
                        default_reminder_timing: 'daily',
                        default_reminder_time: '09:00',
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

        const bangs = [
            {
                user_id: user.id,
                trigger: '!g',
                name: 'Google Search',
                action_type: 'search',
                last_read_at: null,
                url: 'https://www.google.com/search?q={query}',
                hidden: false,
            },
            {
                user_id: user.id,
                trigger: '!ddg',
                name: 'DuckDuckGo Search',
                action_type: 'search',
                last_read_at: null,
                url: 'https://duckduckgo.com/?q={query}',
            },
            {
                user_id: user.id,
                trigger: '!gh',
                name: 'GitHub',
                action_type: 'redirect',
                last_read_at: null,
                url: 'https://github.com',
            },
            {
                user_id: user.id,
                trigger: '!yt',
                name: 'YouTube Search',
                action_type: 'search',
                last_read_at: null,
                url: 'https://www.youtube.com/results?search_query={query}',
            },
            {
                user_id: user.id,
                trigger: '!maps',
                name: 'Google Maps',
                action_type: 'search',
                last_read_at: null,
                url: 'https://www.google.com/maps/search/{query}',
            },
            {
                user_id: user.id,
                trigger: '!w',
                name: 'Wikipedia',
                action_type: 'search',
                url: 'https://en.wikipedia.org/wiki/Special:Search/{query}',
                hidden: false,
            },
            // Hidden actions (only redirect actions can be hidden)
            {
                user_id: user.id,
                trigger: '!secret',
                name: 'Secret Admin Panel',
                action_type: 'redirect',
                last_read_at: null,
                url: 'https://admin.example.com/dashboard',
                hidden: true,
            },
            {
                user_id: user.id,
                trigger: '!private',
                name: 'Private Server',
                action_type: 'redirect',
                last_read_at: null,
                url: 'https://private-server.example.com',
                hidden: true,
            },
        ];

        await knex('bangs').insert(bangs);

        const bookmarks = [
            {
                user_id: user.id,
                url: 'https://github.com',
                title: 'GitHub - Where the world builds software',
                pinned: true,
                hidden: false,
            },
            {
                user_id: user.id,
                url: 'https://developer.mozilla.org',
                title: 'MDN Web Docs',
                hidden: false,
            },
            {
                user_id: user.id,
                url: 'https://typescript-eslint.io',
                title: 'TypeScript ESLint Documentation',
                hidden: false,
            },
            {
                user_id: user.id,
                url: 'https://www.typescriptlang.org/docs/',
                title: 'TypeScript Documentation',
                hidden: false,
            },
            {
                user_id: user.id,
                url: 'https://nodejs.org/docs/latest/api/',
                title: 'Node.js Documentation',
                hidden: false,
            },
            // Hidden bookmarks
            {
                user_id: user.id,
                url: 'https://my-bank.example.com',
                title: 'Personal Banking Portal',
                pinned: false,
                hidden: true,
            },
            {
                user_id: user.id,
                url: 'https://password-manager.example.com',
                title: 'Password Manager',
                pinned: true,
                hidden: true,
            },
            {
                user_id: user.id,
                url: 'https://crypto-wallet.example.com',
                title: 'Crypto Wallet',
                pinned: false,
                hidden: true,
            },
        ];

        await knex('bookmarks').insert(bookmarks);

        const notes = [
            {
                user_id: user.id,
                title: 'Note 1',
                pinned: true,
                hidden: false,
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
                hidden: false,
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
            // Hidden notes
            {
                user_id: user.id,
                title: 'Private API Keys',
                pinned: true,
                hidden: true,
                content: `## 🔐 Private API Keys

### Production Keys:
- API Key: sk-1234567890abcdef
- Secret: secret-xyz-789
- Token: token-abc-123

### Database Credentials:
- Host: db.private.example.com
- User: admin
- Pass: SuperSecret123!

> ⚠️ **Important**: Never share these credentials!
`,
            },
            {
                user_id: user.id,
                title: 'Personal Journal Entry',
                pinned: false,
                hidden: true,
                content: `## 📔 Personal Journal - ${dayjs().format('MMMM D, YYYY')}

Today was an interesting day...

### Thoughts:
- Need to remember to check the private server
- Meeting notes are confidential
- Project X is progressing well

### Todo (Private):
1. Review secret documentation
2. Update security protocols
3. Change all passwords monthly

---
*This note is private and should not be shared.*
`,
            },
            {
                user_id: user.id,
                title: 'Emergency Contacts',
                pinned: false,
                hidden: true,
                content: `## 🚨 Emergency Contacts

### Family:
- Mom: +1-555-0101
- Dad: +1-555-0102
- Sister: +1-555-0103

### Medical:
- Doctor Smith: +1-555-0201
- Hospital: +1-555-0202
- Insurance: Policy #ABC123456

### Financial:
- Bank: +1-555-0301
- Credit Card: +1-555-0302
- Account Manager: John Doe

> Keep this information secure and updated.
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

        const now = dayjs();
        const dueNow = now
            .add(5, 'minute') // 5 minutes from now
            .format('YYYY-MM-DD HH:mm:ss');

        const dueSoon = now
            .add(10, 'minute') // 10 minutes from now
            .format('YYYY-MM-DD HH:mm:ss');

        const reminders = [
            {
                user_id: user.id,
                title: 'Daily Spotify Playlist',
                content: 'https://open.spotify.com/playlist/439CHTNOfML7B0xTbMU7ta',
                reminder_type: 'recurring',
                frequency: 'daily',
                due_date: dueNow, // Due in 5 minutes
            },
            {
                user_id: user.id,
                title: 'Weekly team standup meeting',
                content: 'https://meet.google.com/xyz-abc-def',
                reminder_type: 'recurring',
                frequency: 'weekly',
                due_date: dueSoon, // Due in 10 minutes
            },
            {
                user_id: user.id,
                title: 'Untitled',
                content: 'https://github.com/anthropics/claude-code',
                reminder_type: 'once',
                frequency: null,
                due_date: dueNow, // Due in 5 minutes
            },
            {
                user_id: user.id,
                title: 'Take out trash',
                content: null,
                reminder_type: 'once',
                frequency: null,
                due_date: dueSoon, // Due in 10 minutes
            },
            {
                user_id: user.id,
                title: 'Check GitHub notifications',
                content: 'https://github.com/notifications',
                reminder_type: 'recurring',
                frequency: 'daily',
                due_date: dueNow, // Due in 5 minutes
            },
            {
                user_id: user.id,
                title: 'Future reminder',
                content: "This should not appear in today's digest",
                reminder_type: 'once',
                frequency: null,
                due_date: dayjs().add(3, 'day').format('YYYY-MM-DD HH:mm:ss'), // 3 days from now
            },
        ];

        await knex('reminders').insert(reminders);
    } catch (error) {
        logger.error('Seed failed:', error);
        throw error;
    }
}
