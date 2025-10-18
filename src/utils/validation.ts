export function ValidationUtils() {
    return {
        isValidUrl(url: string): boolean {
            try {
                new URL(url);
                return true;
            } catch (_error) {
                return false;
            }
        },

        isValidEmail(email: string): boolean {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(email);
        },

        isOnlyLettersAndNumbers(str: string): boolean {
            return /^[a-zA-Z0-9]+$/.test(str);
        },

        isUrlLike(str: string): boolean {
            if (!str || typeof str !== 'string') return false;

            const trimmed = str.trim();

            // Check for protocol URLs first (handles mixed case)
            if (this.isValidUrl(trimmed)) return true;

            // Check for www.* patterns (case insensitive)
            if (/^www\./i.test(trimmed)) {
                try {
                    new URL(`https://${trimmed}`);
                    return true;
                } catch {
                    return false;
                }
            }

            // Check for domain-like patterns (e.g., google.com, Google.COM)
            const domainPattern =
                /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/i;

            if (domainPattern.test(trimmed)) {
                try {
                    new URL(`https://${trimmed}`);
                    return true;
                } catch {
                    return false;
                }
            }

            return false;
        },
    };
}
