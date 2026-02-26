import { describe, expect, it } from 'vitest';
import { createValidation } from './validation';

const validationUtils = createValidation();

describe('ValidationUtils', () => {
    describe('isValidUrl', () => {
        it('should return true for valid http URLs', () => {
            expect(validationUtils.isValidUrl('http://example.com')).toBe(true);
            expect(validationUtils.isValidUrl('http://example.com/path')).toBe(true);
        });

        it('should return true for valid https URLs', () => {
            expect(validationUtils.isValidUrl('https://example.com')).toBe(true);
            expect(validationUtils.isValidUrl('https://example.com/path?query=1')).toBe(true);
        });

        it('should return false for invalid URLs', () => {
            expect(validationUtils.isValidUrl('not-a-url')).toBe(false);
            expect(validationUtils.isValidUrl('example.com')).toBe(false);
            expect(validationUtils.isValidUrl('')).toBe(false);
        });
    });

    describe('isValidEmail', () => {
        it('should return true for valid emails', () => {
            expect(validationUtils.isValidEmail('test@example.com')).toBe(true);
            expect(validationUtils.isValidEmail('user.name@domain.org')).toBe(true);
        });

        it('should return false for invalid emails', () => {
            expect(validationUtils.isValidEmail('not-an-email')).toBe(false);
            expect(validationUtils.isValidEmail('@example.com')).toBe(false);
            expect(validationUtils.isValidEmail('test@')).toBe(false);
            expect(validationUtils.isValidEmail('')).toBe(false);
        });
    });

    describe('isOnlyLettersAndNumbers', () => {
        it('should return true for alphanumeric strings', () => {
            expect(validationUtils.isOnlyLettersAndNumbers('abc123')).toBe(true);
            expect(validationUtils.isOnlyLettersAndNumbers('ABC')).toBe(true);
            expect(validationUtils.isOnlyLettersAndNumbers('123')).toBe(true);
        });

        it('should return false for strings with special characters', () => {
            expect(validationUtils.isOnlyLettersAndNumbers('abc-123')).toBe(false);
            expect(validationUtils.isOnlyLettersAndNumbers('abc_123')).toBe(false);
            expect(validationUtils.isOnlyLettersAndNumbers('abc 123')).toBe(false);
            expect(validationUtils.isOnlyLettersAndNumbers('')).toBe(false);
        });
    });

    describe('isUrlLike', () => {
        it('should return true for URLs with protocol', () => {
            expect(validationUtils.isUrlLike('https://example.com')).toBe(true);
            expect(validationUtils.isUrlLike('http://example.com')).toBe(true);
        });

        it('should return true for URLs with www prefix', () => {
            expect(validationUtils.isUrlLike('www.example.com')).toBe(true);
            expect(validationUtils.isUrlLike('WWW.EXAMPLE.COM')).toBe(true);
        });

        it('should return true for domain-like patterns', () => {
            expect(validationUtils.isUrlLike('example.com')).toBe(true);
            expect(validationUtils.isUrlLike('sub.example.com')).toBe(true);
            expect(validationUtils.isUrlLike('Google.COM')).toBe(true);
        });

        it('should return false for non-URL strings', () => {
            expect(validationUtils.isUrlLike('not a url')).toBe(false);
            expect(validationUtils.isUrlLike('hello')).toBe(false);
            expect(validationUtils.isUrlLike('')).toBe(false);
            expect(validationUtils.isUrlLike(null as unknown as string)).toBe(false);
        });
    });

    describe('extractUrlFromText', () => {
        it('should extract https URLs', () => {
            const result = validationUtils.extractUrlFromText(
                'Check out https://example.com for more',
            );
            expect(result).not.toBeNull();
            expect(result!.url).toBe('https://example.com');
            expect(result!.startIndex).toBe(10);
            expect(result!.endIndex).toBe(29);
        });

        it('should extract http URLs', () => {
            const result = validationUtils.extractUrlFromText('Visit http://test.org today');
            expect(result).not.toBeNull();
            expect(result!.url).toBe('http://test.org');
            expect(result!.startIndex).toBe(6);
        });

        it('should extract www URLs', () => {
            const result = validationUtils.extractUrlFromText('Go to www.example.com now');
            expect(result).not.toBeNull();
            expect(result!.url).toBe('www.example.com');
            expect(result!.startIndex).toBe(6);
        });

        it('should extract URL at the beginning of text', () => {
            const result = validationUtils.extractUrlFromText('https://start.com is the URL');
            expect(result).not.toBeNull();
            expect(result!.url).toBe('https://start.com');
            expect(result!.startIndex).toBe(0);
        });

        it('should extract URL at the end of text', () => {
            const result = validationUtils.extractUrlFromText('The URL is https://end.com');
            expect(result).not.toBeNull();
            expect(result!.url).toBe('https://end.com');
        });

        it('should extract URL with path and query', () => {
            const result = validationUtils.extractUrlFromText(
                'Link: https://example.com/path?q=1&b=2',
            );
            expect(result).not.toBeNull();
            expect(result!.url).toBe('https://example.com/path?q=1&b=2');
        });

        it('should return null for text without URLs', () => {
            expect(validationUtils.extractUrlFromText('No URL here')).toBeNull();
            expect(validationUtils.extractUrlFromText('Just example.com')).toBeNull();
            expect(validationUtils.extractUrlFromText('')).toBeNull();
        });

        it('should extract only the first URL when multiple present', () => {
            const result = validationUtils.extractUrlFromText(
                'First https://one.com then https://two.com',
            );
            expect(result).not.toBeNull();
            expect(result!.url).toBe('https://one.com');
        });
    });

    describe('findDomainUrlInWords', () => {
        it('should find URL in word array', () => {
            const words = ['Check', 'out', 'example.com', 'today'];
            const result = validationUtils.findDomainUrlInWords(words);
            expect(result).not.toBeNull();
            expect(result!.urlIndex).toBe(2);
            expect(result!.url).toBe('example.com');
        });

        it('should find URL at the beginning', () => {
            const words = ['google.com', 'is', 'great'];
            const result = validationUtils.findDomainUrlInWords(words);
            expect(result).not.toBeNull();
            expect(result!.urlIndex).toBe(0);
            expect(result!.url).toBe('google.com');
        });

        it('should find URL at the end', () => {
            const words = ['Visit', 'github.com'];
            const result = validationUtils.findDomainUrlInWords(words);
            expect(result).not.toBeNull();
            expect(result!.urlIndex).toBe(1);
            expect(result!.url).toBe('github.com');
        });

        it('should find URL with protocol', () => {
            const words = ['Go', 'to', 'https://example.com'];
            const result = validationUtils.findDomainUrlInWords(words);
            expect(result).not.toBeNull();
            expect(result!.urlIndex).toBe(2);
            expect(result!.url).toBe('https://example.com');
        });

        it('should find www URLs', () => {
            const words = ['Check', 'www.example.com', 'out'];
            const result = validationUtils.findDomainUrlInWords(words);
            expect(result).not.toBeNull();
            expect(result!.urlIndex).toBe(1);
            expect(result!.url).toBe('www.example.com');
        });

        it('should return first URL when multiple present', () => {
            const words = ['first.com', 'and', 'second.com'];
            const result = validationUtils.findDomainUrlInWords(words);
            expect(result).not.toBeNull();
            expect(result!.urlIndex).toBe(0);
            expect(result!.url).toBe('first.com');
        });

        it('should return null for empty array', () => {
            expect(validationUtils.findDomainUrlInWords([])).toBeNull();
        });

        it('should return null when no URLs found', () => {
            const words = ['no', 'urls', 'here'];
            expect(validationUtils.findDomainUrlInWords(words)).toBeNull();
        });

        it('should handle empty strings in array', () => {
            const words = ['', 'example.com', ''];
            const result = validationUtils.findDomainUrlInWords(words);
            expect(result).not.toBeNull();
            expect(result!.urlIndex).toBe(1);
        });
    });
});
