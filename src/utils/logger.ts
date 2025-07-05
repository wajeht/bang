import util from 'node:util';

const colors = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    gray: '\x1b[90m',
};

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
        return util.format('%o', {
            name: value.name,
            message: value.message,
            stack: value.stack,
            ...(value as any), // Include any custom properties
        });
    }
    return util.format('%o', value);
}

function createLogger() {
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

    return {
        info(message: string, ...args: unknown[]) {
            const timestamp = getFormattedTimestamp();
            const formattedMessage = formatMessage(message, args);
            process.stdout.write(
                `${colors.dim}${timestamp}${colors.reset} ${colors.blue}INFO:${colors.reset} ${formattedMessage}\n`,
            );
        },
        error(message: string, ...args: unknown[]) {
            const timestamp = getFormattedTimestamp();
            const formattedMessage = formatMessage(message, args);
            process.stdout.write(
                `${colors.dim}${timestamp}${colors.reset} ${colors.red}ERROR:${colors.reset} ${formattedMessage}\n`,
            );
        },
        warn(message: string, ...args: unknown[]) {
            const timestamp = getFormattedTimestamp();
            const formattedMessage = formatMessage(message, args);
            process.stdout.write(
                `${colors.dim}${timestamp}${colors.reset} ${colors.yellow}WARN:${colors.reset} ${formattedMessage}\n`,
            );
        },
        debug(message: string, ...args: unknown[]) {
            if (process.env.NODE_ENV === 'development') {
                const timestamp = getFormattedTimestamp();
                const formattedMessage = formatMessage(message, args);
                process.stdout.write(
                    `${colors.dim}${timestamp}${colors.reset} ${colors.gray}DEBUG:${colors.reset} ${formattedMessage}\n`,
                );
            }
        },
    };
}

export const logger = createLogger();
