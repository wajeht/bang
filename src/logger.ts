import path from 'node:path';
import fs from 'node:fs/promises';

let logpath = '';

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

async function cleanup(dir: string) {
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const files = entries
            .filter((entry) => entry.isFile() && entry.name.endsWith('.log'))
            .map((entry) => path.join(dir, entry.name))
            .sort();

        if (files.length <= 10) return;
        const filesToDelete = files.slice(0, -10);
        await Promise.all(filesToDelete.map((file) => fs.unlink(file).catch(() => {})));
    } catch (error) {
        // Silent fail
    }
}

async function initLogger(print: boolean) {
    const dir = path.join(process.cwd(), 'logs');
    await fs.mkdir(dir, { recursive: true });
    await cleanup(dir);
    if (print) return;

    logpath = path.join(dir, new Date().toISOString().split('.')[0] + '.log');

    try {
        await fs.writeFile(logpath, '', { flag: 'w' });
    } catch (error) {
        // Continue without file logging
    }

    const originalWrite = process.stderr.write;
    process.stderr.write = (msg: string) => {
        if (logpath) {
            fs.appendFile(logpath, msg).catch(() => {});
        }
        return originalWrite.call(process.stderr, msg);
    };
}

let last = Date.now();

function createLogger() {
    function build(message: any, extra?: Record<string, any>) {
        let formattedMessage = String(message || '');

        if (extra) {
            const values = Object.values(extra);
            let valueIndex = 0;
            formattedMessage = formattedMessage.replace(/%[so]/g, (match) => {
                if (valueIndex < values.length) {
                    const value = values[valueIndex++];
                    return match === '%o' && typeof value === 'object'
                        ? JSON.stringify(value, null, 2)
                        : String(value);
                }
                return match;
            });
        }

        const next = new Date();
        const diff = next.getTime() - last;
        last = next.getTime();

        return `${getFormattedTimestamp()} (+${diff}ms) ${formattedMessage}\n`;
    }

    return {
        info(message?: any, extra?: Record<string, any>) {
            process.stderr.write(build('INFO: ' + message, extra));
        },
        error(message?: any, extra?: Record<string, any>) {
            process.stderr.write(build('ERROR: ' + message, extra));
        },
        warn(message?: any, extra?: Record<string, any>) {
            process.stderr.write(build('WARN: ' + message, extra));
        },
    };
}

initLogger(process.env.NODE_ENV === 'development').catch(() => {});

export const logger = createLogger();
