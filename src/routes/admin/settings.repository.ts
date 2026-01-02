import type { AppContext, Settings } from '../../type';

const SETTINGS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

let settingsCache: { data: Record<string, string>; cachedAt: number } | null = null;

export function SettingsRepository(ctx: AppContext): Settings {
    async function getAll(): Promise<Record<string, string>> {
        if (settingsCache && Date.now() - settingsCache.cachedAt < SETTINGS_CACHE_TTL) {
            return settingsCache.data;
        }

        const rows = await ctx.db('settings').select('key', 'value');
        const settings: Record<string, string> = {};

        for (const row of rows) {
            settings[row.key] = row.value;
        }

        settingsCache = { data: settings, cachedAt: Date.now() };

        return settings;
    }

    async function get(key: string): Promise<string | null> {
        const all = await getAll();
        return all[key] ?? null;
    }

    async function set(key: string, value: string): Promise<void> {
        await ctx
            .db('settings')
            .insert({ key, value })
            .onConflict('key')
            .merge({ value, updated_at: ctx.db.fn.now() });

        settingsCache = null;
    }

    async function setMany(settings: Record<string, string>): Promise<void> {
        await ctx.db.transaction(async (trx) => {
            for (const [key, value] of Object.entries(settings)) {
                await trx('settings')
                    .insert({ key, value })
                    .onConflict('key')
                    .merge({ value, updated_at: trx.fn.now() });
            }
        });

        settingsCache = null;
    }

    function invalidateCache(): void {
        settingsCache = null;
    }

    async function getBranding(): Promise<{
        appName: string;
        appUrl: string;
        showFooter: boolean;
        showSearchPage: boolean;
        showAboutPage: boolean;
    }> {
        const all = await getAll();
        return {
            appName: all['branding.app_name'] || 'Bang',
            appUrl: all['branding.app_url'] || ctx.config.app.appUrl,
            showFooter: all['branding.show_footer'] !== 'false',
            showSearchPage: all['branding.show_search_page'] !== 'false',
            showAboutPage: all['branding.show_about_page'] !== 'false',
        };
    }

    return {
        getAll,
        get,
        set,
        setMany,
        invalidateCache,
        getBranding,
    };
}
