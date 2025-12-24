import { styleText, format } from 'node:util';

export type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export type Logger = {
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    tag(key: string, value: string): Logger;
    clone(): Logger;
    time(message: string, extra?: Record<string, any>): { stop(extra?: Record<string, any>): void };
    table(tabularData: any, properties?: readonly string[]): void;
    box(title: string, content: string | string[]): void;
};

export type LoggerOptions = {
    service?: string;
    level?: Level;
};

export const Log = {
    state: {
        appMetadata: {} as Record<string, string>,
        globalLevel: 'INFO' as Level,
        loggers: new Map<string, Logger>(),
    },

    priority: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 } as Record<Level, number>,
    colors: { DEBUG: 'blue', INFO: 'green', WARN: 'yellow', ERROR: 'red' } as Record<Level, 'blue' | 'green' | 'yellow' | 'red'>,

    create(options: LoggerOptions = {}): Logger {
        const tags: Record<string, string> = {};

        if (options.service) tags['service'] = options.service;
        if (options.level) this.state.globalLevel = options.level;

        const service = options.service;
        if (service) {
            const cached = this.state.loggers.get(service);
            if (cached) return cached;
        }

        const self = this;

        function formatError(error: Error, depth = 0): string {
            const result = error.message;
            return error.cause instanceof Error && depth < 10
                ? result + ' Caused by: ' + formatError(error.cause, depth + 1)
                : result;
        }

        function formatValue(value: unknown): string {
            if (value instanceof Error) return formatError(value);
            if (typeof value === 'object' && value !== null) {
                try {
                    return JSON.stringify(value);
                } catch {
                    return '[Circular]';
                }
            }
            return String(value);
        }

        function isPlainObject(value: unknown): value is Record<string, any> {
            return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Error);
        }

        function buildTags(obj: Record<string, any>): string[] {
            const result: string[] = [];
            for (const key in obj) {
                const value = obj[key];
                if (value !== undefined && value !== null) {
                    result.push(`${key}=${value}`);
                }
            }
            return result;
        }

        function buildExtraTags(obj: Record<string, any>): string[] {
            const result: string[] = [];
            for (const key in obj) {
                const value = obj[key];
                if (value !== undefined && value !== null) {
                    const formatted = formatValue(value);
                    const needsQuotes = typeof value === 'string' && value.includes(' ');
                    result.push(`${key}=${needsQuotes ? `"${formatted}"` : formatted}`);
                }
            }
            return result;
        }

        function build(level: Level, message: string, args: any[]): string {
            const timestamp = styleText('dim', new Date().toISOString().split('.')[0] ?? '');
            const levelLabel = styleText(self.colors[level], level.padEnd(5));

            let formattedMessage = message;
            let extraTags: string[] = [];

            if (/%[osj]/.test(message) && args.length > 0) {
                formattedMessage = format(message, ...args);
            } else if (args.length === 1 && isPlainObject(args[0])) {
                extraTags = buildExtraTags(args[0]);
            } else if (args.length > 0) {
                formattedMessage = message + ' ' + args.map(formatValue).join(' ');
            }

            const allTags = [...buildTags(self.state.appMetadata), ...buildTags(tags), ...extraTags];
            const tagsStr = allTags.length > 0 ? styleText('cyan', allTags.join(' ')) : '';

            const parts: string[] = [];
            if (timestamp) parts.push(timestamp);
            if (levelLabel) parts.push(levelLabel);
            if (tagsStr) parts.push(tagsStr);
            if (formattedMessage) parts.push(formattedMessage);

            return parts.join(' ');
        }

        function log(level: Level, message: string, args: any[]): void {
            if (self.priority[level] < self.priority[self.state.globalLevel]) return;
            const output = build(level, message, args);
            if (level === 'ERROR') {
                console.error(output);
            } else if (level === 'WARN') {
                console.warn(output);
            } else {
                console.log(output);
            }
        }

        const logger: Logger = {
            debug: (message, ...args) => log('DEBUG', message, args),
            info: (message, ...args) => log('INFO', message, args),
            warn: (message, ...args) => log('WARN', message, args),
            error: (message, ...args) => log('ERROR', message, args),

            tag(key: string, value: string): Logger {
                tags[key] = value;
                return logger;
            },

            clone(): Logger {
                const cloned = self.create({ level: self.state.globalLevel });
                for (const key in tags) {
                    cloned.tag(key, tags[key]!);
                }
                return cloned;
            },

            time(message: string, extra?: Record<string, any>) {
                const start = Date.now();
                return {
                    stop(stopExtra?: Record<string, any>) {
                        logger.info(message, { ...extra, ...stopExtra, duration: `${Date.now() - start}ms` });
                    },
                };
            },

            table(tabularData: any, properties?: readonly string[]) {
                const timestamp = styleText('dim', new Date().toISOString().split('.')[0] ?? '');
                console.log(`${timestamp} ${styleText('cyan', 'TABLE:')}`);
                console.table(tabularData, properties ? [...properties] : undefined);
            },

            box(title: string, content: string | string[]) {
                const width = process.stdout.columns || 100;
                const maxLen = width - 4;
                const border = styleText('dim', '│');
                const regex = /\x1b\[[0-9;]*m/g;

                const drawLine = (char: string) => styleText('dim', `${char}${'─'.repeat(width - 2)}${char}`);
                const stripAnsi = (str: string) => str.replace(regex, '');
                const pad = (line: string) => line + ' '.repeat(Math.max(0, maxLen - stripAnsi(line).length));

                console.log('');
                console.log(drawLine('┌'));
                console.log(`${border} ${pad(title)} ${border}`);
                console.log(drawLine('├'));

                const lines = Array.isArray(content) ? content : content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i]!;
                    if (stripAnsi(line).length <= maxLen) {
                        console.log(`${border} ${pad(line)} ${border}`);
                    } else {
                        console.log(`${border} ${line}`);
                    }
                }

                console.log(drawLine('└'));
                console.log('');
            },
        };

        if (service) self.state.loggers.set(service, logger);

        return logger;
    },

    setLevel(level: Level) {
        this.state.globalLevel = level;
    },

    getLevel(): Level {
        return this.state.globalLevel;
    },
};

export function Logger(options: LoggerOptions = {}): Logger {
    return Log.create(options);
}
