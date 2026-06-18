export function createHtml() {
    const REGEX_WHITESPACE = /\s+/;
    const REGEX_ESCAPE_SPECIAL = /[.*+?^${}()|[\]\\]/g;
    const REGEX_HTML_TAGS = /<[^>]*>/g;
    const REGEX_MULTI_WHITESPACE = /\s+/g;
    const REGEX_SPACE_DOT = /\s*\.\s*/g;
    const REGEX_SPACE_SLASH = /\s*\/\s*/g;
    const REGEX_SPACE_COLON = /\s*:\s*/g;
    const REGEX_NBSP = /&nbsp;/g;
    const REGEX_LT_ENTITY = /&lt;/g;
    const REGEX_GT_ENTITY = /&gt;/g;
    const REGEX_AMP_ENTITY = /&amp;/g;
    const REGEX_QUOT_ENTITY = /&quot;/g;
    const REGEX_APOS_ENTITY = /&#39;|&apos;/g;
    const REGEX_HTML_CHARS = /[&<>"']/g;
    const REGEX_BACKSLASH = /\\/g;
    const REGEX_HTTP_PROTOCOL = /^https?:\/\//i;
    const REGEX_SCRIPT_UNSAFE = /[<>&]/g;

    const HTML_ENTITIES: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    };

    // Unicode escapes for embedding JSON inside a <script> tag, keyed by the raw character.
    const SCRIPT_UNSAFE_ESCAPES: Record<string, string> = {
        '<': '\\u003c',
        '>': '\\u003e',
        '&': '\\u0026',
    };

    function decodeHtmlEntityText(text: string): string {
        return text
            .replace(REGEX_NBSP, ' ')
            .replace(REGEX_QUOT_ENTITY, '"')
            .replace(REGEX_APOS_ENTITY, "'")
            .replace(REGEX_LT_ENTITY, '<')
            .replace(REGEX_GT_ENTITY, '>')
            .replace(REGEX_AMP_ENTITY, '&');
    }

    return {
        escapeHtml(text: string): string {
            return text.replace(REGEX_HTML_CHARS, (char) => HTML_ENTITIES[char] || char);
        },

        highlightSearchTerm(
            text: string | null | undefined,
            searchTerm: string | null | undefined,
        ) {
            if (text == null) return text;

            // always escape so output is safe to render raw (<%~); marks go on top of the
            // escaped text, so stored HTML can't execute with or without a search term
            const escaped = String(text).replace(
                REGEX_HTML_CHARS,
                (char) => HTML_ENTITIES[char] || char,
            );

            const trimmedSearch = searchTerm?.trim();
            if (!trimmedSearch) return escaped;

            const searchWords = trimmedSearch.split(REGEX_WHITESPACE);
            const wordCount = searchWords.length;

            let hasValidWords = false;
            const escapedWords: string[] = [];
            for (let i = 0; i < wordCount; i++) {
                const word = searchWords[i];
                if (word && word.length > 0) {
                    // escape the term before regex-escaping so it matches the escaped text, not inside &amp;
                    const htmlEscaped = word.replace(
                        REGEX_HTML_CHARS,
                        (c) => HTML_ENTITIES[c] || c,
                    );
                    escapedWords.push(htmlEscaped.replace(REGEX_ESCAPE_SPECIAL, '\\$&'));
                    hasValidWords = true;
                }
            }

            if (!hasValidWords) return escaped;

            const searchRegex = new RegExp(escapedWords.join('|'), 'gi');
            return escaped.replace(searchRegex, (match) => `<mark>${match}</mark>`);
        },

        applyHighlighting<T extends Record<string, any>>(
            items: T[],
            fields: (keyof T)[],
            searchTerm: string | null | undefined,
        ): T[] {
            // runs even without a search term so fields are always escaped before raw (<%~) render
            if (!items.length) return items;

            for (const item of items) {
                for (const field of fields) {
                    if (item[field] != null) {
                        item[field] = this.highlightSearchTerm(
                            String(item[field]),
                            searchTerm,
                        ) as T[keyof T];
                    }
                }
            }
            return items;
        },

        // only http(s) and same-origin relative paths pass; anything else (javascript:, data:, ...) -> '#'
        safeHref(url: string | null | undefined): string {
            if (!url) return '#';
            const trimmed = decodeHtmlEntityText(String(url).trim());
            // normalize backslashes first: browsers treat /\evil.com as protocol-relative //evil.com
            const normalized = trimmed.replace(REGEX_BACKSLASH, '/');
            if (REGEX_HTTP_PROTOCOL.test(normalized)) {
                try {
                    return new URL(normalized).href;
                } catch {
                    return '#';
                }
            }
            if (normalized.startsWith('/') && !normalized.startsWith('//')) {
                try {
                    const parsed = new URL(normalized, 'https://bang.local');
                    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
                } catch {
                    return '#';
                }
            }
            return '#';
        },

        stripHtmlTags(text: string | null | undefined): string {
            if (!text) return '';
            return String(text)
                .replace(REGEX_HTML_TAGS, '')
                .replace(REGEX_MULTI_WHITESPACE, ' ')
                .replace(REGEX_SPACE_DOT, '.')
                .replace(REGEX_SPACE_SLASH, '/')
                .replace(REGEX_SPACE_COLON, ':')
                .trim();
        },

        decodeHtmlEntities(html: string): string {
            return decodeHtmlEntityText(html.replace(REGEX_HTML_TAGS, '')).trim();
        },

        // safe to embed in a <script>: JSON.stringify won't escape </script>, so escape <,>,&
        // (app-state is read via JSON.parse(textContent), never eval'd)
        safeJsonForScript(value: unknown): string {
            return JSON.stringify(value ?? null).replace(
                REGEX_SCRIPT_UNSAFE,
                (char) => SCRIPT_UNSAFE_ESCAPES[char] || char,
            );
        },
    };
}
