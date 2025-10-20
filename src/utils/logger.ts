import { dayjs } from '../libs';
import { styleText, format } from 'node:util';

export function Logger() {
    function getFormattedTimestamp(): string {
        const now = dayjs();
        return `[${now.format('YYYY-MM-DD h:mm:ss A')}]`;
    }

    function formatValue(value: unknown): string {
        if (value instanceof Error) {
            return format('%o', {
                name: value.name,
                message: value.message,
                stack: value.stack,
                ...(value as any),
            });
        }
        return format('%o', value);
    }

    function formatMessage(message: string, args: unknown[]): string {
        if (args.length === 0) return message;

        let formattedMessage = message;
        let argIndex = 0;

        formattedMessage = formattedMessage.replace(/%[osj]/g, (match) => {
            if (argIndex >= args.length) return match;
            const arg = args[argIndex++];

            if (match === '%o') return formatValue(arg);
            if (match === '%j') {
                try {
                    return JSON.stringify(arg);
                } catch {
                    return '[Circular]';
                }
            }
            return String(arg);
        });

        if (argIndex < args.length) {
            formattedMessage += ' ' + args.slice(argIndex).map(formatValue).join(' ');
        }

        return formattedMessage;
    }

    function stripAnsi(str: string): string {
        // eslint-disable-next-line no-control-regex
        return str.replace(/\x1b\[[0-9;]*m/g, '');
    }

    function logWithTimestamp(
        level: string,
        color: string,
        message: string,
        args: unknown[],
    ): string {
        const timestamp = styleText('dim', getFormattedTimestamp());
        const label = styleText(color as any, `${level}:`);
        const formattedMsg = formatMessage(message, args);
        return `${timestamp} ${label} ${formattedMsg}`;
    }

    function drawBorder(char: string, width: number): string {
        const line = '─'.repeat(width - 2);
        return styleText('dim', `${char}${line}${char}`);
    }

    function padLine(line: string, maxLen: number): string {
        const visibleLen = stripAnsi(line).length;
        const padding = ' '.repeat(maxLen - visibleLen);
        return line + padding;
    }

    return {
        info(message: string, ...args: unknown[]) {
            const output = logWithTimestamp('INFO', 'green', message, args);
            console.info(output);
        },

        error(message: string, ...args: unknown[]) {
            const output = logWithTimestamp('ERROR', 'red', message, args);
            console.error(output);
        },

        warn(message: string, ...args: unknown[]) {
            const output = logWithTimestamp('WARN', 'yellow', message, args);
            console.warn(output);
        },

        debug(message: string, ...args: unknown[]) {
            if (process.env.NODE_ENV === 'development') {
                const output = logWithTimestamp('DEBUG', 'blue', message, args);
                console.debug(output);
            }
        },

        table(tabularData: any, properties?: readonly string[]) {
            const timestamp = styleText('dim', getFormattedTimestamp());
            const label = styleText('cyan', 'TABLE:');
            console.log(`${timestamp} ${label}`);
            console.table(tabularData, properties);
        },

        box(title: string, content: string | string[]) {
            const width = process.stdout.columns || 100;
            const maxLen = width - 4;
            const border = styleText('dim', '│');

            console.log('');
            console.log(drawBorder('┌', width));

            const paddedTitle = padLine(title, maxLen);
            console.log(`${border} ${paddedTitle} ${border}`);

            console.log(drawBorder('├', width));

            const lines = Array.isArray(content) ? content : content.split('\n');
            for (const line of lines) {
                const visibleLen = stripAnsi(line).length;

                if (visibleLen <= maxLen) {
                    const paddedLine = padLine(line, maxLen);
                    console.log(`${border} ${paddedLine} ${border}`);
                } else {
                    console.log(`${border} ${line}`);
                }
            }

            console.log(drawBorder('└', width));
            console.log('');
        },
    };
}
