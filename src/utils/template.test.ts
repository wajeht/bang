import { libs } from '../libs.js';
import { config } from '../config.js';
import { createTemplate } from './template.js';
import { describe, expect, it, beforeAll, vi } from 'vite-plus/test';

let templateUtils: ReturnType<typeof createTemplate>;

beforeAll(() => {
    const mockContext = {
        config,
        libs,
        logger: { error: vi.fn(), info: vi.fn() },
    } as any;

    templateUtils = createTemplate(mockContext);
});

function renderTemplate(view: string, opts: object): string {
    return templateUtils.render(view, { ...opts, layout: false });
}

describe('TemplateUtils', () => {
    describe('render', () => {
        it('should render a component template with escaped output', () => {
            const html = renderTemplate('_components/inputs/text.html', {
                id: 'test-input',
                name: 'testField',
                label: 'Test Label',
                placeholder: 'Enter text',
                value: 'test value',
                required: true,
                helpText: 'This is help text',
                error: undefined,
            });

            expect(html).toBeDefined();
            expect(typeof html).toBe('string');
            expect(html.length).toBeGreaterThan(0);
            expect(html).toContain('test-input');
            expect(html).toContain('Test Label');
            expect(html).toContain('test value');
            expect(html).toContain('This is help text');
        });

        it('should handle template errors gracefully', () => {
            expect(() => renderTemplate('nonexistent/template.html', {})).toThrow();
        });

        it('should escape HTML in escaped output tags', () => {
            const html = renderTemplate('_components/inputs/text.html', {
                id: 'xss-test',
                name: 'xssField',
                label: '<script>alert("xss")</script>',
                value: '',
                required: false,
            });

            expect(html).toBeDefined();
            expect(html).not.toContain('<script>alert("xss")</script>');
            expect(html).toContain('&lt;script&gt;');
        });

        it('should handle conditional rendering', () => {
            const html = renderTemplate('_components/inputs/checkbox.html', {
                id: 'checkbox-test',
                name: 'checkboxField',
                label: 'Check me',
                checked: true,
                helpText: 'Optional help',
            });

            expect(html).toBeDefined();
            expect(html).toContain('checked');
            expect(html).toContain('Check me');
        });

        it('should handle loop rendering in select options', () => {
            const html = renderTemplate('_components/inputs/select.html', {
                id: 'select-test',
                name: 'selectField',
                label: 'Choose one',
                options: [
                    { value: 'a', text: 'Option A', selected: false },
                    { value: 'b', text: 'Option B', selected: true },
                    { value: 'c', text: 'Option C', selected: false },
                ],
            });

            expect(html).toBeDefined();
            expect(html).toContain('Option A');
            expect(html).toContain('Option B');
            expect(html).toContain('Option C');
            expect(html).toContain('value="b"');
        });

        it('should render templates with nested includes', () => {
            const html = renderTemplate('_components/inputs/radio.html', {
                name: 'gender',
                legend: 'Select Gender',
                required: true,
                options: [
                    { value: 'male', label: 'Male', checked: false },
                    { value: 'female', label: 'Female', checked: true },
                ],
                helpText: 'Choose your gender',
            });

            expect(html).toBeDefined();
            expect(html).toContain('Select Gender');
            expect(html).toContain('Male');
            expect(html).toContain('Female');
            expect(html).toContain('Choose your gender');
        });

        it('should handle textarea component', () => {
            const html = renderTemplate('_components/inputs/textarea.html', {
                id: 'message',
                name: 'message',
                label: 'Your Message',
                placeholder: 'Type here...',
                value: 'Hello World',
                rows: 5,
                required: true,
                helpText: 'Enter your message',
            });

            expect(html).toBeDefined();
            expect(html).toContain('Your Message');
            expect(html).toContain('Hello World');
            expect(html).toContain('Enter your message');
        });

        it('should use cache in production mode', () => {
            const prodContext = {
                config: { ...config, app: { ...config.app, env: 'production' } },
                libs,
                logger: { error: vi.fn(), info: vi.fn() },
            } as any;

            const prodTemplateUtils = createTemplate(prodContext);
            expect(prodTemplateUtils).toBeDefined();
            expect(prodTemplateUtils.render).toBeDefined();
        });
    });
});
