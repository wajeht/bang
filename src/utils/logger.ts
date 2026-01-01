import { styleText, format } from 'node:util';
import type { LogLevel, Logger, LoggerOptions } from '../type';

export type { LoggerOptions, LogLevel };

export const Log = {
    state: {
        appMetadata: {} as Record<string, string>,
        globalLevel: 'INFO' as LogLevel,
        loggers: new Map<string, Logger>(),
    },

    priority: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, SILENT: 4 } as Record<LogLevel, number>,
    colors: { DEBUG: 'blue', INFO: 'green', WARN: 'yellow', ERROR: 'red' } as Record<
        LogLevel,
        'blue' | 'green' | 'yellow' | 'red'
    >,

    create(options: LoggerOptions = {}): Logger {
        const tags: Record<string, string> = {};

        if (options.service) tags['service'] = options.service;
        if (options.level) this.state.globalLevel = options.level;

        const service = options.service;
        if (service) {
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
            return (
                typeof value === 'object' &&
                value !== null &&
                !Array.isArray(value) &&
                !(value instanceof Error)
            );
        }

        function appendTags(result: string, obj: Record<string, any>): string {
            for (const key in obj) {
                const value = obj[key];
                if (value !== undefined && value !== null) {
                    result = result ? result + ' ' + key + '=' + value : key + '=' + value;
                }
            }
            return result;
        }

        function appendExtraTags(result: string, obj: Record<string, any>): string {
            for (const key in obj) {
                const value = obj[key];
                if (value !== undefined && value !== null) {
                    const formatted = formatValue(value);
                    const tag =
                        typeof value === 'string' && value.includes(' ')
                            ? key + '="' + formatted + '"'
                            : key + '=' + formatted;
                    result = result ? result + ' ' + tag : tag;
                }
            }
            return result;
        }

        function build(level: LogLevel, message: string, args: any[]): string {
            const timestamp = styleText('dim', new Date().toISOString().slice(0, 19));
            const levelLabel = styleText(colors[level], level.padEnd(5));

            let formattedMessage = message;
            let extraTagsStr = '';

            if (args.length > 0) {
                if (/%[osj]/.test(message)) {
                    formattedMessage = format(message, ...args);
                } else if (args.length === 1 && isPlainObject(args[0])) {
                    extraTagsStr = appendExtraTags('', args[0]);
                } else {
                    let argsStr = '';
                    for (let i = 0; i < args.length; i++) {
                        argsStr = argsStr
                            ? argsStr + ' ' + formatValue(args[i])
                            : formatValue(args[i]);
                    }
                    formattedMessage = message + ' ' + argsStr;
                }
            }

            let tagsStr = appendTags('', state.appMetadata);
            tagsStr = appendTags(tagsStr, tags);
            if (extraTagsStr) tagsStr = tagsStr ? tagsStr + ' ' + extraTagsStr : extraTagsStr;
            const coloredTags = tagsStr ? styleText('cyan', tagsStr) : '';

            let result = timestamp + ' ' + levelLabel;
            if (coloredTags) result = result + ' ' + coloredTags;
            if (formattedMessage) result = result + ' ' + formattedMessage;

            return result;
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
                tags[key] = value;
                return logger;
            },

            clone(loggerOptions?: LoggerOptions): Logger {
                const cloned = Log.create({
                    level: loggerOptions?.level || state.globalLevel,
                    service: loggerOptions?.service || service,
                });
                for (const key in tags) {
                    cloned.tag(key, tags[key]!);
                }
                return cloned;
            },

            time(message: string, extra?: Record<string, any>) {
                const start = Date.now();
                return {
                    stop(stopExtra?: Record<string, any>) {
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
                console.table(tabularData, properties as string[] | undefined);
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

export function Logger(options: LoggerOptions = {}): Logger {
    return Log.create(options);
}
