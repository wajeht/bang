import pino from 'pino';
import path from 'node:path';
import pretty from 'pino-pretty';

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
				dest: `${path.resolve(process.cwd())}/logs/${new Date().toISOString().split('T')[0]}.log`,
				sync: false,
				mkdir: true,
			}),
		},
		{
			stream: pretty({
				translateTime: 'yyyy-mm-dd HH:MM:ss TT',
				colorize: true,
				ignore: 'hostname,pid',
			}),
		},
	]),
);
