import { config } from './config';
import { Server } from 'node:http';
import { createContext } from './context';
import type { AppContext } from './type';
import { createRouter } from './routes/routes';
import { AddressInfo, Socket } from 'node:net';
import { expressJSDocSwaggerHandler } from './utils/swagger';

const activeSockets = new Set<Socket>();

export function getActiveSocketsCount(): number {
    return activeSockets.size;
}

export function clearActiveSockets(): void {
    activeSockets.clear();
}

export async function createApp() {
    const ctx = await createContext();

    const app = ctx.libs.express();

    if (ctx.config.app.env === 'production') {
        try {
            await ctx.database.inittializeDatabase();
        } catch (error) {
            ctx.logger.error('Database connection or migration error', { error });
            throw error;
        }
    }

    if (ctx.config.app.env === 'development') {
        try {
            const { expressTemplatesReload } = await import('@wajeht/express-templates-reload');
            expressTemplatesReload({
                app,
                watch: [
                    { path: './src/public', extensions: ['.css', '.js'] },
                    { path: './src/routes', extensions: ['.html'] },
                ],
                options: { quiet: true },
            });
        } catch {
            ctx.logger.warn('Express templates reload not available in production');
        }
    }

    app.set('trust proxy', 1)
        .use(ctx.middleware.session)
        .use(ctx.middleware.requestLogger)
        .use(ctx.libs.flash())
        .use(ctx.libs.compression())
        .use(ctx.libs.cors())
        .use(ctx.middleware.helmet)
        .use(ctx.middleware.speculationRules)
        .use(ctx.middleware.rateLimit)
        .use(ctx.libs.express.json({ limit: '10mb' }))
        .use(ctx.libs.express.urlencoded({ extended: true, limit: '10mb' }))
        .use(ctx.middleware.staticAssets)
        .engine('html', ctx.utils.template.engine)
        .set('view engine', 'html')
        .set('views', './src/routes')
        .use(ctx.middleware.layout)
        .use(...ctx.middleware.csrf)
        .use(ctx.middleware.appLocalState)
        .use(createRouter(ctx));

    try {
        await expressJSDocSwaggerHandler(app, ctx);
    } catch (error) {
        ctx.logger.error('Error initializing Swagger', { error });
    }

    app.use(ctx.middleware.notFound);
    app.use(ctx.middleware.errorHandler);

    return { app, ctx };
}

export async function createServer() {
    const { app, ctx } = await createApp();

    const server: Server = app.listen(config.app.port);

    server.timeout = 120000; // 2 minutes
    server.keepAliveTimeout = 65000; // 65 seconds
    server.headersTimeout = 66000; // slightly higher than keepAliveTimeout
    server.requestTimeout = 120000; // same as timeout

    server.on('connection', (socket: Socket) => {
        activeSockets.add(socket);
        socket.on('close', () => activeSockets.delete(socket));
    });

    server.on('listening', async () => {
        const addr: string | AddressInfo | null = server.address();
        const bind: string =
            typeof addr === 'string' ? 'pipe ' + addr : 'port ' + (addr as AddressInfo).port;

        ctx.logger.info('Server is listening', { bind });

        await ctx.services.crons.start();
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.syscall !== 'listen') {
            throw error;
        }

        const bind: string =
            typeof config.app.port === 'string'
                ? 'Pipe ' + config.app.port
                : 'Port ' + config.app.port;

        switch (error.code) {
            case 'EACCES':
                ctx.logger.error('Port requires elevated privileges', { bind });
                process.exit(1);
            // eslint-disable-next-line no-fallthrough
            case 'EADDRINUSE':
                ctx.logger.error('Port is already in use', { bind });
                process.exit(1);
            // eslint-disable-next-line no-fallthrough
            default:
                throw error;
        }
    });

    return { app, server, ctx };
}

export async function closeServer({ server, ctx }: { server: Server; ctx: AppContext }) {
    ctx.logger.info('Shutting down server gracefully');

    try {
        ctx.services.crons.stop();
        ctx.logger.info('Cron service stopped');

        await ctx.db.destroy();
        ctx.logger.info('Database connection closed');

        ctx.logger.info('Closing active connections', { count: activeSockets.size });
        for (const socket of activeSockets) {
            socket.destroy();
        }
        activeSockets.clear();

        await new Promise<void>((resolve, reject) => {
            const shutdownTimeout = setTimeout(() => {
                ctx.logger.error('Could not close connections in time, forcefully shutting down');
                reject(new Error('Server close timeout'));
            }, 5000);

            server.close((error) => {
                clearTimeout(shutdownTimeout);
                if (error) {
                    ctx.logger.error('Error closing HTTP server', { error });
                    reject(error);
                } else {
                    ctx.logger.info('HTTP server closed');
                    resolve();
                }
            });
        });

        ctx.logger.info('Server shutdown complete');
    } catch (error) {
        ctx.logger.error('Error during graceful shutdown', { error });
        throw error;
    }
}
