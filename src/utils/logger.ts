import dayjs from './dayjs';
import { styleText, format } from 'node:util';
import type { Logger as LoggerType } from '../type';

function getFormattedTimestamp() {
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

function wrapLine(line: string, maxWidth: number): string[] {
    const visibleLen = stripAnsi(line).length;
    if (visibleLen <= maxWidth) return [line];

    const stripped = stripAnsi(line);
    const wrapped: string[] = [];
    let pos = 0;

    while (pos < stripped.length) {
        wrapped.push(stripped.substring(pos, pos + maxWidth));
        pos += maxWidth;
    }

    return wrapped;
}

export const logger: LoggerType = {
    info(message: string, ...args: unknown[]) {
        const timestamp = getFormattedTimestamp();
        const formattedMessage = formatMessage(message, args);
        console.info(
            `${styleText('dim', timestamp)} ${styleText('green', 'INFO:')} ${formattedMessage}`,
        );
    },
    error(message: string, ...args: unknown[]) {
        const timestamp = getFormattedTimestamp();
        const formattedMessage = formatMessage(message, args);
        console.error(
            `${styleText('dim', timestamp)} ${styleText('red', 'ERROR:')} ${formattedMessage}`,
        );
    },
    warn(message: string, ...args: unknown[]) {
        const timestamp = getFormattedTimestamp();
        const formattedMessage = formatMessage(message, args);
        console.warn(
            `${styleText('dim', timestamp)} ${styleText('yellow', 'WARN:')} ${formattedMessage}`,
        );
    },
    debug(message: string, ...args: unknown[]) {
        if (process.env.NODE_ENV === 'development') {
            const timestamp = getFormattedTimestamp();
            const formattedMessage = formatMessage(message, args);
            console.debug(
                `${styleText('dim', timestamp)} ${styleText('blue', 'DEBUG:')} ${formattedMessage}`,
            );
        }
    },
    table(tabularData: any, properties?: readonly string[]) {
        const timestamp = getFormattedTimestamp();
        console.log(`${styleText('dim', timestamp)} ${styleText('cyan', 'TABLE:')}`);
        console.table(tabularData, properties);
    },
    box(title: string, content: string | string[]) {
        const terminalWidth = process.stdout.columns || 100;
        const boxWidth = terminalWidth - 2;
        const contentWidth = boxWidth - 2;
        const horizontalLine = '─'.repeat(boxWidth);

        console.log('');
        console.log(styleText('dim', '┌' + horizontalLine + '┐'));

        const titleLen = stripAnsi(title).length;
        const titlePadding = ' '.repeat(Math.max(0, boxWidth - titleLen - 1));
        console.log(styleText('dim', '│') + ' ' + title + titlePadding + styleText('dim', '│'));

        console.log(styleText('dim', '├' + horizontalLine + '┤'));

        const lines = Array.isArray(content) ? content : content.split('\n');

        lines.forEach((line) => {
            wrapLine(line, contentWidth).forEach((wrappedLine) => {
                const lineLen = stripAnsi(wrappedLine).length;
                const linePadding = ' '.repeat(Math.max(0, boxWidth - lineLen - 1));
                console.log(
                    styleText('dim', '│') + ' ' + wrappedLine + linePadding + styleText('dim', '│'),
                );
            });
        });

        console.log(styleText('dim', '└' + horizontalLine + '┘'));
        console.log('');
    },
};
