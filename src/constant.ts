export const actionTypes = ['search', 'redirect'];

export const CACHE_DURATION = {
    second: 1,
    minute: 60,
    hour: 60 * 60,
    day: 24 * 60 * 60,
    week: 7 * 24 * 60 * 60,
    month: 30 * 24 * 60 * 60,
    year: 365 * 24 * 60 * 60,
} as const;

export const defaultSearchProviders = {
    duckduckgo: `https://duckduckgo.com/?q={{{s}}}`,
    google: `https://www.google.com/search?q={{{s}}}`,
    yahoo: `https://search.yahoo.com/search?p={{{s}}}`,
    bing: `https://www.bing.com/search?q={{{s}}}`,
} as const;
