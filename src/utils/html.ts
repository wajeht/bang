import type { AppContext } from '../type';

export function createHtmlUtils(context: AppContext) {
    function escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function highlightSearchTerm(
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

        const searchRegex = new RegExp(searchWords.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi'); // prettier-ignore

        result = result.replace(searchRegex, (match) => `<mark>${match}</mark>`); // prettier-ignore

        return result;
    }

    function sqlHighlightSearchTerm(
        columnName: string,
        searchTerm: string | null | undefined,
    ): string {
        if (!searchTerm || !searchTerm.trim()) {
            return columnName;
        }

        const searchWords = searchTerm
            .trim()
            .split(/\s+/)
            .filter((word) => word.length > 0);

        if (searchWords.length === 0) {
            return columnName;
        }

        let sql = columnName;

        for (const word of searchWords) {
            // Escape single quotes in the search word for SQL safety
            const escapedWord = word.replace(/'/g, "''");
            const lowerWord = escapedWord.toLowerCase();
            const upperWord = escapedWord.toUpperCase();
            const titleWord =
                escapedWord.charAt(0).toUpperCase() + escapedWord.slice(1).toLowerCase();

            // Apply REPLACE operations, avoiding duplicates
            sql = `REPLACE(${sql}, '${escapedWord}', X'3C' || 'mark' || X'3E' || '${escapedWord}' || X'3C2F' || 'mark' || X'3E')`;

            // Only do lowercase if different from original
            if (lowerWord !== escapedWord) {
                sql = `REPLACE(${sql}, '${lowerWord}', X'3C' || 'mark' || X'3E' || '${lowerWord}' || X'3C2F' || 'mark' || X'3E')`;
            }

            // Only do uppercase if different from original and lowercase
            if (upperWord !== escapedWord && upperWord !== lowerWord) {
                sql = `REPLACE(${sql}, '${upperWord}', X'3C' || 'mark' || X'3E' || '${upperWord}' || X'3C2F' || 'mark' || X'3E')`;
            }

            // Only do title case if different from all others
            if (titleWord !== escapedWord && titleWord !== lowerWord && titleWord !== upperWord) {
                sql = `REPLACE(${sql}, '${titleWord}', X'3C' || 'mark' || X'3E' || '${titleWord}' || X'3C2F' || 'mark' || X'3E')`;
            }
        }

        return sql;
    }

    function stripHtmlTags(text: string | null | undefined): string {
        if (!text) return '';
        return String(text)
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/\s+/g, ' ') // Normalize multiple whitespace to single space
            .replace(/\s*\.\s*/g, '.') // Remove spaces around dots (for URLs like "bang. jaw .dev")
            .replace(/\s*\/\s*/g, '/') // Remove spaces around slashes
            .replace(/\s*:\s*/g, ':') // Remove spaces around colons
            .trim(); // Remove leading/trailing whitespace
    }

    function decodeHtmlEntities(html: string): string {
        return html
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/&nbsp;/g, ' ') // Replace nbsp
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .trim();
    }

    function nl2br(str: string): string {
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
    }

    return {
        escapeHtml,
        highlightSearchTerm,
        sqlHighlightSearchTerm,
        stripHtmlTags,
        decodeHtmlEntities,
        nl2br,
    };
}
