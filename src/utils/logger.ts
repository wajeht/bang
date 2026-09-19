import { styleText, format } from 'node:util';
import type { LogLevel, Logger, LoggerOptions } from '../type.js';

export type { LoggerOptions, LogLevel };

interface LogState {
    appMetadata: Record<string, string>;
    globalLevel: LogLevel;
    loggers: Map<string, Logger>;
}

const state: LogState = { appMetadata: {}, globalLevel: 'INFO', loggers: new Map() };

const colors = {
    DEBUG: 'blue',
    INFO: 'green',
    WARN: 'yellow',
    ERROR: 'red',
    SILENT: 'dim',
} as const;

export const Log = {
    state,
    priority: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, SILENT: 4 },
    colors,

    create(options: LoggerOptions = {}): Logger {
        const tags: Record<string, string> = {};

        if (options.service) tags['service'] = options.service;

        if (options.tags) {
            for (const key in options.tags) {
                tags[key] = options.tags[key]!;
            }
        }

        if (options.level) this.state.globalLevel = options.level;

        const service = options.service;

        if (service && !options.tags) {
            const cached = this.state.loggers.get(service);

            if (cached) return cached;
        }

        const { state, colors, priority } = this;

        function formatError(error: Error, depth = 0): string {
            const result = error.message;

            return error.cause instanceof Error && depth < 10
                ? result + ' Caused by: ' + formatError(error.cause, depth + 1)
                : result;
        }

        function formatValue<T>(value: T): string {
            if (value instanceof Error) return formatError(value);

            if (value != null && Object(value) === value && !(value instanceof Function)) {
                try {
                    return JSON.stringify(value);
                } catch {
                    return '[Circular]';
                }
            }

            return String(value);
        }

        function isPlainObject<T>(value: T): value is T & object {
            return (
                value != null &&
                Object(value) === value &&
                !Array.isArray(value) &&
                !(value instanceof Error) &&
                !(value instanceof Function)
            );
        }

        function appendTags(result: string, obj: Record<string, string>): string {
            for (const key in obj) {
                const value = obj[key];

                if (value !== undefined && value !== null) {
                    result = result ? result + ' ' + key + '=' + value : key + '=' + value;
                }
            }

            return result;
        }

        function appendExtraTags<T extends object>(result: string, obj: T): string {
            for (const key in obj) {
                const value = obj[key];

                if (value !== undefined && value !== null) {
                    const formatted = formatValue(value);

                    const tag =
                        value === formatted && formatted.includes(' ')
                            ? key + '="' + formatted + '"'
                            : key + '=' + formatted;

                    result = result ? result + ' ' + tag : tag;
                }
            }

            return result;
        }

        function build(level: LogLevel, message: string, args: any[]): string {
            const timestamp = styleText('dim', new Date().toISOString().slice(0, 19));
            const levelLabel = styleText(colors[level], level.padStart(5));

            let msg = message;
            let extra = '';

            if (args.length > 0) {
                if (/%[osj]/.test(message)) {
                    msg = format(message, ...args);
                } else if (args.length === 1 && isPlainObject(args[0])) {
                    extra = appendExtraTags('', args[0]);
                } else {
                    msg = message + ' ' + args.map(formatValue).join(' ');
                }
            }

            const allTags = { ...state.appMetadata, ...tags };
            const { service, requestId, ...rest } = allTags;

            const ctx = [service, requestId].filter(Boolean).join(':');
            const meta = [appendTags('', rest), extra].filter(Boolean).join(' ');

            return [
                timestamp,
                levelLabel,
                ctx && styleText('cyan', `[${ctx}]`),
                msg,
                meta && styleText('dim', meta),
            ]
                .filter(Boolean)
                .join(' ');
        }

        function log(level: LogLevel, message: string, args: any[]): void {
            if (priority[level] < priority[state.globalLevel]) return;
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
                return Log.create({
                    level: state.globalLevel,
                    tags: { ...tags, [key]: value },
                });
            },

            time<T extends object>(message: string, extra?: T) {
                const start = Date.now();

                return {
                    stop<U extends object>(stopExtra?: U) {
                        logger.info(message, {
                            ...extra,
                            ...stopExtra,
                            duration: `${Date.now() - start}ms`,
                        });
                    },
                };
            },

            table(tabularData: any, properties?: readonly string[]) {
                if (state.globalLevel === 'SILENT') return;
                const timestamp = styleText('dim', new Date().toISOString().slice(0, 19));
                console.log(timestamp + ' ' + styleText('cyan', 'TABLE:'));
                console.table(tabularData, properties ? [...properties] : undefined);
            },

            box(title: string, content: string | string[]) {
                const width = process.stdout.columns || 100;
                const maxLen = width - 4;
                const border = styleText('dim', '│');
                // eslint-disable-next-line no-control-regex
                const regex = /\x1b\[[0-9;]*m/g;

                const drawLine = (char: string) =>
                    styleText('dim', `${char}${'─'.repeat(width - 2)}${char}`);

                const stripAnsi = (str: string) => str.replace(regex, '');

                const pad = (line: string) =>
                    line + ' '.repeat(Math.max(0, maxLen - stripAnsi(line).length));

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

        if (service) state.loggers.set(service, logger);

        return logger;
    },

    setLevel(level: LogLevel) {
        this.state.globalLevel = level;
    },

    getLevel(): LogLevel {
        return this.state.globalLevel;
    },
};

export function createLogger(options: LoggerOptions = {}): Logger {
    return Log.create(options);
}
