import { styleText, format } from 'node:util';
import type { Logger as LoggerType } from '../type';

function getFormattedTimestamp() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    const formattedTime = `${formattedHours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} ${ampm}`;
    const formattedDate = now.toISOString().split('T')[0];
    return `[${formattedDate} ${formattedTime}]`;
}

function formatValue(value: unknown): string {
    if (value instanceof Error) {
        return format('%o', {
            name: value.name,
            message: value.message,
            stack: value.stack,
            ...(value as any), // Include any custom properties
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
        switch (match) {
            case '%o':
                return formatValue(arg);
            case '%j':
                try {
                    return JSON.stringify(arg);
                } catch (err) {
                    return '[Circular]';
                }
            case '%s':
            default:
                return String(arg);
        }
    });

    // Append any remaining args
    if (argIndex < args.length) {
        formattedMessage += ' ' + args.slice(argIndex).map(formatValue).join(' ');
    }

    return formattedMessage;
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
};
