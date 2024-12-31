import pino from 'pino';
import path from 'node:path';
import pretty from 'pino-pretty';

const logDate = new Date().toISOString().split('T')[0];
const logFilePath = path.resolve(process.cwd(), 'logs', `${logDate}.log`);

export const logger = pino(
	{
		level: process.env.PINO_LOG_LEVEL || 'info',
		formatters: {
			level: (label) => ({ level: label }),
		},
		timestamp: pino.stdTimeFunctions.isoTime,
	},
	pino.multistream([
		{
			stream: pino.destination({
				dest: logFilePath,
				sync: false,
				mkdir: true,
			}),
		},
		{
			stream: pretty({
				translateTime: 'yyyy-mm-dd hh:MM:ss TT',
				colorize: true,
				sync: false,
				ignore: 'hostname,pid',
			}),
		},
	]),
);
