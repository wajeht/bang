export function createValidation() {
    const REGEX_WWW_PREFIX = /^www\./i;
    const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const REGEX_ALPHANUMERIC = /^[a-zA-Z0-9]+$/;
    const REGEX_URL_PROTOCOL = /(https?:\/\/[^\s]+|www\.[^\s]+)/i;
    const REGEX_DOMAIN_PATTERN =
        /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/i;
    const REGEX_USERNAME = /^[a-zA-Z0-9._-]{1,50}$/;
    const REGEX_USERNAME_DISALLOWED = /[^a-zA-Z0-9._-]/g;

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

    function isUrlLike(str: string): boolean {
        if (!str || typeof str !== 'string') return false;

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

    function isValidUsername(username: string): boolean {
        return typeof username === 'string' && REGEX_USERNAME.test(username);
    }

    // Derive a safe username from a candidate (e.g. an email local-part): the email regex
    // allows characters like '<' that would otherwise become an XSS payload once rendered.
    function sanitizeUsername(value: string | null | undefined): string {
        return (
            String(value ?? '')
                .replace(REGEX_USERNAME_DISALLOWED, '')
                .slice(0, 40) || 'user'
        );
    }

    return {
        isValidUrl,
        isValidEmail,
        isOnlyLettersAndNumbers,
        isUrlLike,
        isValidUsername,
        sanitizeUsername,
        extractUrlFromText,
        findDomainUrlInWords,
    };
}
