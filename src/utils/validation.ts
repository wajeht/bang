import type { AppContext } from '../type.js';

export function createValidation({ libs }: Pick<AppContext, 'libs'>) {
    const formFlag = libs.z.union([libs.z.boolean(), libs.z.literal('on')]).optional();
    const formSection = libs.z.record(libs.z.string(), libs.z.json());
    const REGEX_WWW_PREFIX = /^www\./i;
    const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const REGEX_ALPHANUMERIC = /^[a-zA-Z0-9]+$/;
    const REGEX_URL_PROTOCOL = /(https?:\/\/[^\s]+|www\.[^\s]+)/i;

    const REGEX_DOMAIN_PATTERN =
        /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/i;

    function isValidUrl(url: string): boolean {
        try {
            new URL(url);

            return true;
        } catch {
            return false;
        }
    }

    function isValidEmail(email: string): boolean {
        return REGEX_EMAIL.test(email);
    }

    function isOnlyLettersAndNumbers(str: string): boolean {
        return REGEX_ALPHANUMERIC.test(str);
    }

    function isUrlLike<T>(input: T): boolean {
        const parsed = libs.z.string().safeParse(input);

        if (!parsed.success || !parsed.data) return false;
        const str = parsed.data;

        const trimmed = str.trim();

        // Check for protocol URLs first (handles mixed case)
        if (isValidUrl(trimmed)) return true;

        // Check for www.* patterns (case insensitive)
        if (REGEX_WWW_PREFIX.test(trimmed)) {
            try {
                new URL(`https://${trimmed}`);

                return true;
            } catch {
                return false;
            }
        }

        // Check for domain-like patterns (e.g., google.com, Google.COM)
        if (REGEX_DOMAIN_PATTERN.test(trimmed)) {
            try {
                new URL(`https://${trimmed}`);

                return true;
            } catch {
                return false;
            }
        }

        return false;
    }

    function extractUrlFromText(
        text: string,
    ): { url: string; startIndex: number; endIndex: number } | null {
        const match = text.match(REGEX_URL_PROTOCOL);

        if (match && match.index !== undefined) {
            return {
                url: match[0],
                startIndex: match.index,
                endIndex: match.index + match[0].length,
            };
        }

        return null;
    }

    function findDomainUrlInWords(words: string[]): { urlIndex: number; url: string } | null {
        for (let i = 0; i < words.length; i++) {
            const word = words[i];

            if (word && isUrlLike(word)) {
                return { urlIndex: i, url: word };
            }
        }

        return null;
    }

    return {
        formFlag,
        formSection,
        isValidUrl,
        isValidEmail,
        isOnlyLettersAndNumbers,
        isUrlLike,
        extractUrlFromText,
        findDomainUrlInWords,
    };
}
