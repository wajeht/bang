import type { Knex } from 'knex';

const FTS_OPTIONS = "tokenize='unicode61 remove_diacritics 2', prefix='2 3'";

const SIMPLE_TABLES = [
    {
        table: 'bookmarks',
        ftsTable: 'bookmarks_fts',
        columns: ['title', 'url'],
        values: ["COALESCE(title, '')", "COALESCE(url, '')"],
        newValues: ["COALESCE(new.title, '')", "COALESCE(new.url, '')"],
    },
    {
        table: 'bangs',
        ftsTable: 'bangs_fts',
        columns: ['name', 'trigger_text', 'url'],
        values: ["COALESCE(name, '')", "COALESCE(trigger, '')", "COALESCE(url, '')"],
        newValues: ["COALESCE(new.name, '')", "COALESCE(new.trigger, '')", "COALESCE(new.url, '')"],
    },
    {
        table: 'notes',
        ftsTable: 'notes_fts',
        columns: ['title', 'body'],
        values: ["COALESCE(title, '')", "COALESCE(content, '')"],
        newValues: ["COALESCE(new.title, '')", "COALESCE(new.content, '')"],
    },
    {
        table: 'reminders',
        ftsTable: 'reminders_fts',
        columns: ['title', 'body', 'frequency'],
        values: ["COALESCE(title, '')", "COALESCE(content, '')", "COALESCE(frequency, '')"],
        newValues: [
            "COALESCE(new.title, '')",
            "COALESCE(new.content, '')",
            "COALESCE(new.frequency, '')",
        ],
    },
];

const TRIGGERS = [
    'bookmarks_fts_ai',
    'bookmarks_fts_ad',
    'bookmarks_fts_au',
    'bangs_fts_ai',
    'bangs_fts_ad',
    'bangs_fts_au',
    'notes_fts_ai',
    'notes_fts_ad',
    'notes_fts_au',
    'reminders_fts_ai',
    'reminders_fts_ad',
    'reminders_fts_au',
    'tabs_fts_ai',
    'tabs_fts_ad',
    'tabs_fts_au',
    'tab_items_fts_ai',
    'tab_items_fts_ad',
    'tab_items_fts_au',
];

const FTS_TABLES = [
    'tab_items_fts',
    'tabs_fts',
    'reminders_fts',
    'notes_fts',
    'bangs_fts',
    'bookmarks_fts',
];

function tabsFtsSelect(idExpression: string): string {
    return `
        SELECT
            tabs.id,
            COALESCE(tabs.title, ''),
            COALESCE(tabs.trigger, ''),
            COALESCE((
                SELECT group_concat(
                    COALESCE(tab_items.title, '') || ' ' || COALESCE(tab_items.url, ''),
                    ' '
                )
                FROM tab_items
                WHERE tab_items.tab_id = tabs.id
            ), '')
        FROM tabs
        WHERE tabs.id = ${idExpression}
    `;
}

function tabsFtsSelectIn(idExpression: string): string {
    return `
        SELECT
            tabs.id,
            COALESCE(tabs.title, ''),
            COALESCE(tabs.trigger, ''),
            COALESCE((
                SELECT group_concat(
                    COALESCE(tab_items.title, '') || ' ' || COALESCE(tab_items.url, ''),
                    ' '
                )
                FROM tab_items
                WHERE tab_items.tab_id = tabs.id
            ), '')
        FROM tabs
        WHERE tabs.id IN (${idExpression})
    `;
}

export async function up(knex: Knex): Promise<void> {
    for (const table of SIMPLE_TABLES) {
        await knex.raw(
            `CREATE VIRTUAL TABLE IF NOT EXISTS ${table.ftsTable} USING fts5(${table.columns.join(', ')}, ${FTS_OPTIONS})`,
        );
        await knex.raw(`DELETE FROM ${table.ftsTable}`);
        await knex.raw(
            `INSERT INTO ${table.ftsTable}(rowid, ${table.columns.join(', ')})
             SELECT id, ${table.values.join(', ')}
             FROM ${table.table}`,
        );

        await knex.raw(`
            CREATE TRIGGER IF NOT EXISTS ${table.ftsTable}_ai
            AFTER INSERT ON ${table.table}
            BEGIN
                INSERT INTO ${table.ftsTable}(rowid, ${table.columns.join(', ')})
                VALUES (new.id, ${table.newValues.join(', ')});
            END
        `);

        await knex.raw(`
            CREATE TRIGGER IF NOT EXISTS ${table.ftsTable}_ad
            AFTER DELETE ON ${table.table}
            BEGIN
                DELETE FROM ${table.ftsTable} WHERE rowid = old.id;
            END
        `);

        await knex.raw(`
            CREATE TRIGGER IF NOT EXISTS ${table.ftsTable}_au
            AFTER UPDATE ON ${table.table}
            BEGIN
                DELETE FROM ${table.ftsTable} WHERE rowid = old.id;
                INSERT INTO ${table.ftsTable}(rowid, ${table.columns.join(', ')})
                VALUES (new.id, ${table.newValues.join(', ')});
            END
        `);
    }

    await knex.raw(
        `CREATE VIRTUAL TABLE IF NOT EXISTS tab_items_fts USING fts5(title, url, ${FTS_OPTIONS})`,
    );
    await knex.raw('DELETE FROM tab_items_fts');
    await knex.raw(`
        INSERT INTO tab_items_fts(rowid, title, url)
        SELECT id, COALESCE(title, ''), COALESCE(url, '')
        FROM tab_items
    `);

    await knex.raw(
        `CREATE VIRTUAL TABLE IF NOT EXISTS tabs_fts USING fts5(title, trigger_text, items, ${FTS_OPTIONS})`,
    );
    await knex.raw('DELETE FROM tabs_fts');
    await knex.raw(`
        INSERT INTO tabs_fts(rowid, title, trigger_text, items)
        ${tabsFtsSelect('tabs.id')}
    `);

    await knex.raw(`
        CREATE TRIGGER IF NOT EXISTS tabs_fts_ai
        AFTER INSERT ON tabs
        BEGIN
            INSERT INTO tabs_fts(rowid, title, trigger_text, items)
            ${tabsFtsSelect('new.id')};
        END
    `);

    await knex.raw(`
        CREATE TRIGGER IF NOT EXISTS tabs_fts_ad
        AFTER DELETE ON tabs
        BEGIN
            DELETE FROM tabs_fts WHERE rowid = old.id;
        END
    `);

    await knex.raw(`
        CREATE TRIGGER IF NOT EXISTS tabs_fts_au
        AFTER UPDATE ON tabs
        BEGIN
            DELETE FROM tabs_fts WHERE rowid = old.id;
            INSERT INTO tabs_fts(rowid, title, trigger_text, items)
            ${tabsFtsSelect('new.id')};
        END
    `);

    await knex.raw(`
        CREATE TRIGGER IF NOT EXISTS tab_items_fts_ai
        AFTER INSERT ON tab_items
        BEGIN
            INSERT INTO tab_items_fts(rowid, title, url)
            VALUES (new.id, COALESCE(new.title, ''), COALESCE(new.url, ''));

            DELETE FROM tabs_fts WHERE rowid = new.tab_id;
            INSERT INTO tabs_fts(rowid, title, trigger_text, items)
            ${tabsFtsSelect('new.tab_id')};
        END
    `);

    await knex.raw(`
        CREATE TRIGGER IF NOT EXISTS tab_items_fts_ad
        AFTER DELETE ON tab_items
        BEGIN
            DELETE FROM tab_items_fts WHERE rowid = old.id;

            DELETE FROM tabs_fts WHERE rowid = old.tab_id;
            INSERT INTO tabs_fts(rowid, title, trigger_text, items)
            ${tabsFtsSelect('old.tab_id')};
        END
    `);

    await knex.raw(`
        CREATE TRIGGER IF NOT EXISTS tab_items_fts_au
        AFTER UPDATE ON tab_items
        BEGIN
            DELETE FROM tab_items_fts WHERE rowid = old.id;
            INSERT INTO tab_items_fts(rowid, title, url)
            VALUES (new.id, COALESCE(new.title, ''), COALESCE(new.url, ''));

            DELETE FROM tabs_fts WHERE rowid IN (old.tab_id, new.tab_id);
            INSERT INTO tabs_fts(rowid, title, trigger_text, items)
            ${tabsFtsSelectIn('old.tab_id, new.tab_id')};
        END
    `);
}

export async function down(knex: Knex): Promise<void> {
    for (const trigger of TRIGGERS) {
        await knex.raw(`DROP TRIGGER IF EXISTS ${trigger}`);
    }

    for (const table of FTS_TABLES) {
        await knex.raw(`DROP TABLE IF EXISTS ${table}`);
    }
}
