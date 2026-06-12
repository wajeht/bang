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

    return {
        escapeHtml(text: string): string {
            return text.replace(REGEX_HTML_CHARS, (char) => HTML_ENTITIES[char] || char);
        },

        highlightSearchTerm(
            text: string | null | undefined,
            searchTerm: string | null | undefined,
        ) {
            if (text == null) return text;

            // Always HTML-escape the value so it is safe to render with the raw operator
            // (<%~) in templates. Search matches are then wrapped in <mark> on top of the
            // already-escaped text, so a stored value like `<img onerror=...>` can never
            // execute regardless of whether a search term is present.
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
                    // HTML-escape the term before regex-escaping so it matches the escaped text;
                    // otherwise searching for `&` or `<` matches inside an entity (e.g. &amp;)
                    // and splits it with <mark>.
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
            // Runs even without a search term so the listed fields are always HTML-escaped
            // before being rendered raw (<%~) in the index templates — preventing stored XSS.
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

        // Neutralize dangerous URL schemes (javascript:, data:, vbscript:) before putting a
        // user-supplied URL into an href. Only http(s) and same-origin relative paths pass;
        // anything else becomes '#' so a clicked link can't execute script.
        safeHref(url: string | null | undefined): string {
            if (!url) return '#';
            const trimmed = String(url).trim();
            // Browsers normalize backslashes to forward slashes, so `/\evil.com` becomes the
            // protocol-relative `//evil.com`. Check against a normalized copy to catch that.
            const normalized = trimmed.replace(REGEX_BACKSLASH, '/');
            if (REGEX_HTTP_PROTOCOL.test(normalized)) return trimmed;
            if (normalized.startsWith('/') && !normalized.startsWith('//')) return trimmed;
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
            return html
                .replace(REGEX_HTML_TAGS, '')
                .replace(REGEX_NBSP, ' ')
                .replace(REGEX_LT_ENTITY, '<')
                .replace(REGEX_GT_ENTITY, '>')
                .replace(REGEX_AMP_ENTITY, '&')
                .trim();
        },

        // Serialize a value for safe embedding inside a <script> tag. JSON.stringify alone
        // does NOT escape `</script>` or `<!--`, which would break out of the element and
        // inject markup. Escaping <, >, & is sufficient here because the app-state is always
        // read back via JSON.parse(textContent), never eval'd as JS.
        safeJsonForScript(value: unknown): string {
            return JSON.stringify(value ?? null).replace(
                REGEX_SCRIPT_UNSAFE,
                (char) => SCRIPT_UNSAFE_ESCAPES[char] || char,
            );
        },
    };
}
