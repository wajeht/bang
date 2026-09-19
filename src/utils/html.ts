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
    const REGEX_NL2BR = /(?:\r\n|\r|\n|\t| )/g;
    const REGEX_SCRIPT_UNSAFE = /[<>&\u2028\u2029]/g;
    const REGEX_HTML_CHARS = /[&<>"']/g;

    const HTML_ENTITIES = new Map(
        Object.entries({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        }),
    );

    const NL2BR_MAP = new Map(
        Object.entries({
            '\r\n': '<br>',
            '\r': '<br>',
            '\n': '<br>',
            '\t': '&nbsp;&nbsp;&nbsp;&nbsp;',
            ' ': '&nbsp;',
        }),
    );

    return {
        serializeForScript<T>(value: T): string {
            return (JSON.stringify(value) ?? 'null').replace(
                REGEX_SCRIPT_UNSAFE,
                (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
            );
        },

        escapeHtml(text: string): string {
            return text.replace(REGEX_HTML_CHARS, (char) => HTML_ENTITIES.get(char) || char);
        },

        highlightSearchTerm(
            text: string | null | undefined,
            searchTerm: string | null | undefined,
        ) {
            if (text == null) return text;
            const original = String(text);

            const escaped = original.replace(
                REGEX_HTML_CHARS,
                (char) => HTML_ENTITIES.get(char) ?? char,
            );

            const trimmedSearch = searchTerm?.trim();

            if (!trimmedSearch) return escaped;

            const escapedWords: string[] = [];

            for (const word of trimmedSearch.split(REGEX_WHITESPACE)) {
                if (word) escapedWords.push(word.replace(REGEX_ESCAPE_SPECIAL, '\\$&'));
            }

            if (!escapedWords.length) return escaped;

            const searchRegex = new RegExp(escapedWords.join('|'), 'gi');
            let result = '';
            let previousEnd = 0;

            for (const match of original.matchAll(searchRegex)) {
                result += original
                    .slice(previousEnd, match.index)
                    .replace(REGEX_HTML_CHARS, (char) => HTML_ENTITIES.get(char) ?? char);
                result += `<mark>${match[0].replace(REGEX_HTML_CHARS, (char) => HTML_ENTITIES.get(char) ?? char)}</mark>`;
                previousEnd = match.index + match[0].length;
            }

            return (
                result +
                original
                    .slice(previousEnd)
                    .replace(REGEX_HTML_CHARS, (char) => HTML_ENTITIES.get(char) ?? char)
            );
        },

        applyHighlighting<T extends object>(
            items: T[],
            fields: (keyof T)[],
            searchTerm: string | null | undefined,
        ): T[] {
            if (!searchTerm || !items.length) return items;

            for (const item of items) {
                for (const field of fields) {
                    if (item[field] != null) {
                        Object.assign(item, {
                            [field]: this.highlightSearchTerm(String(item[field]), searchTerm),
                        });
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

        nl2br(str: string | null | undefined): string {
            if (str === null || str === undefined || str === '') {
                return '';
            }

            return String(str).replace(REGEX_NL2BR, (match) => NL2BR_MAP.get(match) || match);
        },
    };
}
