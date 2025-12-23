export function ValidationUtils() {
    const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const REGEX_ALPHANUMERIC = /^[a-zA-Z0-9]+$/;
    const REGEX_WWW_PREFIX = /^www\./i;
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

    return {
        isValidUrl,
        isValidEmail,
        isOnlyLettersAndNumbers,
        isUrlLike,
    };
}
