export function HtmlUtils() {
    return {
        escapeHtml(text: string): string {
            return text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        },

        highlightSearchTerm(
            text: string | null | undefined,
            searchTerm: string | null | undefined,
        ) {
            if (!searchTerm || !text) return text;

            const original = String(text || '');

            if (!searchTerm.trim()) return original;

            const searchWords = searchTerm
                .trim()
                .split(/\s+/)
                .filter((word) => word.length > 0);

            if (searchWords.length === 0) return original;

            let result = original
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');

            const searchRegex = new RegExp(
                searchWords.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
                'gi',
            );

            result = result.replace(searchRegex, (match) => `<mark>${match}</mark>`); // prettier-ignore

            return result;
        },

        /**
         * Apply search term highlighting to specified fields on an array of objects.
         * Mutates objects in place for performance.
         */
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
                .replace(/<[^>]*>/g, '') // Remove HTML tags
                .replace(/\s+/g, ' ') // Normalize multiple whitespace to single space
                .replace(/\s*\.\s*/g, '.') // Remove spaces around dots (for URLs like "bang. jaw .dev")
                .replace(/\s*\/\s*/g, '/') // Remove spaces around slashes
                .replace(/\s*:\s*/g, ':') // Remove spaces around colons
                .trim(); // Remove leading/trailing whitespace
        },

        decodeHtmlEntities(html: string): string {
            return html
                .replace(/<[^>]*>/g, '') // Remove HTML tags
                .replace(/&nbsp;/g, ' ') // Replace nbsp
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .trim();
        },

        nl2br(str: string): string {
            if (str === null || str === undefined || str === '') {
                return '';
            }

            const safeStr = String(str);

            return safeStr.replace(/(?:\r\n|\r|\n|\t| )/g, (match: string) => {
                switch (match) {
                    case '\r\n':
                    case '\r':
                    case '\n':
                        return '<br>';
                    case '\t':
                        return '&nbsp;&nbsp;&nbsp;&nbsp;'; // 4 spaces for a tab
                    case ' ':
                        return '&nbsp;'; // Non-breaking space
                    default:
                        return match; // Handle any other characters matched
                }
            });
        },
    };
}
