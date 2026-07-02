import path from 'node:path';
import type { AppContext } from '../type.js';

export function createTemplate(context: AppContext) {
    const { libs, config } = context;

    const viewsDir = path.join(process.cwd(), 'src/routes');
    const eta = new libs.Eta({
        views: viewsDir,
        cache: config.app.env === 'production',
        useWith: true,
        defaultExtension: '.html',
    });

    return {
        render(view: string, opts: object = {}) {
            const renderedTemplate = eta.render('./' + view, opts as Record<string, unknown>);
            const viewOptions = opts as Record<string, unknown>;
            const layout =
                viewOptions.layout === false
                    ? false
                    : (viewOptions.layout as string | undefined) || '_layouts/public.html';

            if (!layout) {
                return renderedTemplate;
            }

            return eta.render('./' + layout, {
                ...viewOptions,
                body: renderedTemplate,
                layout: undefined,
            });
        },

        engine(
            filePath: string,
            opts: object,
            callback: (err: Error | null, html?: string) => void,
        ) {
            try {
                const viewName = './' + path.relative(viewsDir, filePath);
                const renderedTemplate = eta.render(viewName, opts as Record<string, unknown>);
                callback(null, renderedTemplate);
            } catch (error) {
                callback(error as Error);
            }
        },
    };
}
