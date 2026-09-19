const REGEX_LIKE_SPECIAL_CHARACTERS = /[\\%_]/g;

// Pair the escaped value with an explicit backslash ESCAPE clause in SQL.
export function escapeLikePattern(value: string): string {
    return value.replace(REGEX_LIKE_SPECIAL_CHARACTERS, '\\$&');
}
