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

function createLogger() {
    function formatMessage(message: string, args: any[]): string {
        let formattedMessage = message;
        let argIndex = 0;
        formattedMessage = formattedMessage.replace(/%[os]/g, (match) => {
            if (argIndex < args.length) {
                const arg = args[argIndex++];
                if (match === '%o' && typeof arg === 'object') {
                    return JSON.stringify(arg, null, 2);
                }
                return String(arg);
            }
            return match;
        });
        return formattedMessage;
    }

    return {
        info(message: string, ...args: any[]) {
            const timestamp = getFormattedTimestamp();
            const formattedMessage = formatMessage(message, args);
            process.stdout.write(`${timestamp} INFO: ${formattedMessage}\n`);
        },
        error(message: string, ...args: any[]) {
            const timestamp = getFormattedTimestamp();
            const formattedMessage = formatMessage(message, args);
            process.stdout.write(`${timestamp} ERROR: ${formattedMessage}\n`);
        },
        warn(message: string, ...args: any[]) {
            const timestamp = getFormattedTimestamp();
            const formattedMessage = formatMessage(message, args);
            process.stdout.write(`${timestamp} WARN: ${formattedMessage}\n`);
        },
    };
}

export const logger = createLogger();
