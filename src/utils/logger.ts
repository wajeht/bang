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
    return {
        info(message: any) {
            const timestamp = getFormattedTimestamp();
            process.stdout.write(`${timestamp} INFO: ${message}\n`);
        },
        error(message: any) {
            const timestamp = getFormattedTimestamp();
            process.stdout.write(`${timestamp} ERROR: ${message}\n`);
        },
        warn(message: any) {
            const timestamp = getFormattedTimestamp();
            process.stdout.write(`${timestamp} WARN: ${message}\n`);
        },
    };
}

export const logger = createLogger();
