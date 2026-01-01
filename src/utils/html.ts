export function HtmlUtils() {
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
    const REGEX_NL2BR = /(?:\r\n|\r|\n|\t| )/g;
    const REGEX_HTML_CHARS = /[&<>"']/g;

    const HTML_ENTITIES: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    };

    const NL2BR_MAP: Record<string, string> = {
        '\r\n': '<br>',
        '\r': '<br>',
        '\n': '<br>',
        '\t': '&nbsp;&nbsp;&nbsp;&nbsp;',
        ' ': '&nbsp;',
    };

    return {
        escapeHtml(text: string): string {
            return text.replace(REGEX_HTML_CHARS, (char) => HTML_ENTITIES[char] || char);
        },

        highlightSearchTerm(
            text: string | null | undefined,
            searchTerm: string | null | undefined,
        ) {
            if (!searchTerm || !text) return text;

            const original = String(text || '');
            const trimmedSearch = searchTerm.trim();

            if (!trimmedSearch) return original;

            const searchWords = trimmedSearch.split(REGEX_WHITESPACE);
            const wordCount = searchWords.length;

            let hasValidWords = false;
            const escapedWords: string[] = [];
            for (let i = 0; i < wordCount; i++) {
                const word = searchWords[i];
                if (word && word.length > 0) {
                    escapedWords.push(word.replace(REGEX_ESCAPE_SPECIAL, '\\$&'));
                    hasValidWords = true;
                }
            }

            if (!hasValidWords) return original;

            const escaped = original.replace(
                REGEX_HTML_CHARS,
                (char) => HTML_ENTITIES[char] || char,
            );

            const searchRegex = new RegExp(escapedWords.join('|'), 'gi');
            return escaped.replace(searchRegex, (match) => `<mark>${match}</mark>`);
        },

        applyHighlighting<T extends Record<string, any>>(
            items: T[],
            fields: (keyof T)[],
            searchTerm: string | null | undefined,
        ): T[] {
            if (!searchTerm || !items.length) return items;

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

        nl2br(str: string): string {
            if (str === null || str === undefined || str === '') {
                return '';
            }

            return String(str).replace(REGEX_NL2BR, (match) => NL2BR_MAP[match] || match);
        },
    };
}
