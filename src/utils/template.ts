import path from 'node:path';
import type { AppContext } from '../type';

export function TemplateUtils(context: AppContext) {
    const { libs, config } = context;

    const viewsDir = path.join(process.cwd(), 'src/routes');
    const eta = new libs.Eta({
        views: viewsDir,
        cache: config.app.env === 'production',
        useWith: true,
        defaultExtension: '.html',
    });

    return {
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
