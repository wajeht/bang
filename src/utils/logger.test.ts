import { Log, Logger } from './logger';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('Logger', () => {
    let consoleSpy: {
        log: ReturnType<typeof vi.spyOn>;
        warn: ReturnType<typeof vi.spyOn>;
        error: ReturnType<typeof vi.spyOn>;
    };

    beforeEach(() => {
        consoleSpy = {
            log: vi.spyOn(console, 'log').mockImplementation(() => {}),
            warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
            error: vi.spyOn(console, 'error').mockImplementation(() => {}),
        };
        Log.state.loggers.clear();
        Log.state.globalLevel = 'DEBUG';
        Log.state.appMetadata = {};
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Log.create', () => {
        it('should create a logger', () => {
            const logger = Log.create();
            expect(logger).toBeDefined();
            expect(typeof logger.info).toBe('function');
            expect(typeof logger.debug).toBe('function');
            expect(typeof logger.warn).toBe('function');
            expect(typeof logger.error).toBe('function');
        });

        it('should create a logger with service tag', () => {
            const logger = Log.create({ service: 'test-service' });
            logger.info('test message');

            expect(consoleSpy.log).toHaveBeenCalledTimes(1);
            const output = consoleSpy.log.mock.calls[0][0];
            expect(output).toContain('service=test-service');
            expect(output).toContain('test message');
        });

        it('should cache loggers by service name', () => {
            const logger1 = Log.create({ service: 'cached-service' });
            const logger2 = Log.create({ service: 'cached-service' });
            expect(logger1).toBe(logger2);
        });

        it('should not cache loggers without service name', () => {
            const logger1 = Log.create();
            const logger2 = Log.create();
            expect(logger1).not.toBe(logger2);
        });
    });

    describe('Logger function', () => {
        it('should create a logger using Logger function', () => {
            const logger = Logger({ service: 'func-test' });
            logger.info('hello');

            expect(consoleSpy.log).toHaveBeenCalledTimes(1);
            const output = consoleSpy.log.mock.calls[0][0];
            expect(output).toContain('service=func-test');
        });
    });

    describe('log levels', () => {
        it('should log INFO messages', () => {
            const logger = Log.create();
            logger.info('info message');

            expect(consoleSpy.log).toHaveBeenCalledTimes(1);
            expect(consoleSpy.log.mock.calls[0][0]).toContain('INFO');
            expect(consoleSpy.log.mock.calls[0][0]).toContain('info message');
        });

        it('should log DEBUG messages', () => {
            const logger = Log.create();
            logger.debug('debug message');

            expect(consoleSpy.log).toHaveBeenCalledTimes(1);
            expect(consoleSpy.log.mock.calls[0][0]).toContain('DEBUG');
        });

        it('should log WARN messages to console.warn', () => {
            const logger = Log.create();
            logger.warn('warn message');

            expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
            expect(consoleSpy.warn.mock.calls[0][0]).toContain('WARN');
        });

        it('should log ERROR messages to console.error', () => {
            const logger = Log.create();
            logger.error('error message');

            expect(consoleSpy.error).toHaveBeenCalledTimes(1);
            expect(consoleSpy.error.mock.calls[0][0]).toContain('ERROR');
        });

        it('should respect log level filtering', () => {
            Log.setLevel('WARN');
            const logger = Log.create();

            logger.debug('debug');
            logger.info('info');
            logger.warn('warn');
            logger.error('error');

            expect(consoleSpy.log).not.toHaveBeenCalled();
            expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
            expect(consoleSpy.error).toHaveBeenCalledTimes(1);
        });
    });

    describe('tag', () => {
        it('should add tags to log output', () => {
            const logger = Log.create();
            logger.tag('requestId', 'abc123').info('tagged message');

            const output = consoleSpy.log.mock.calls[0][0];
            expect(output).toContain('requestId=abc123');
            expect(output).toContain('tagged message');
        });

        it('should allow chaining multiple tags', () => {
            const logger = Log.create();
            logger.tag('key1', 'val1').tag('key2', 'val2').info('multi-tag');

            const output = consoleSpy.log.mock.calls[0][0];
            expect(output).toContain('key1=val1');
            expect(output).toContain('key2=val2');
        });

        it('should return the logger for chaining', () => {
            const logger = Log.create();
            const result = logger.tag('key', 'value');
            expect(result).toBe(logger);
        });
    });

    describe('clone', () => {
        it('should create an independent copy of the logger', () => {
            const logger = Log.create();
            logger.tag('original', 'true');

            const cloned = logger.clone();
            cloned.tag('cloned', 'true');

            logger.info('original log');
            cloned.info('cloned log');

            const originalOutput = consoleSpy.log.mock.calls[0][0];
            const clonedOutput = consoleSpy.log.mock.calls[1][0];

            expect(originalOutput).toContain('original=true');
            expect(originalOutput).not.toContain('cloned=true');
            expect(clonedOutput).toContain('original=true');
            expect(clonedOutput).toContain('cloned=true');
        });
    });

    describe('time', () => {
        it('should return a timer with stop function', () => {
            const logger = Log.create();
            const timer = logger.time('operation');

            expect(timer).toBeDefined();
            expect(typeof timer.stop).toBe('function');
        });

        it('should log duration when stopped', () => {
            vi.useFakeTimers();
            const logger = Log.create();
            const timer = logger.time('timed operation');

            vi.advanceTimersByTime(10);
            timer.stop();

            expect(consoleSpy.log).toHaveBeenCalledTimes(1);
            const output = consoleSpy.log.mock.calls[0][0];
            expect(output).toContain('timed operation');
            expect(output).toMatch(/duration=\d+ms/);
            vi.useRealTimers();
        });

        it('should include extra data when stopped', () => {
            const logger = Log.create();
            const timer = logger.time('operation', { initial: 'data' });
            timer.stop({ final: 'result' });

            const output = consoleSpy.log.mock.calls[0][0];
            expect(output).toContain('initial=data');
            expect(output).toContain('final=result');
        });
    });

    describe('structured data', () => {
        it('should format extra object as key=value pairs', () => {
            const logger = Log.create();
            logger.info('message', { status: 200, path: '/test' });

            const output = consoleSpy.log.mock.calls[0][0];
            expect(output).toContain('status=200');
            expect(output).toContain('path=/test');
        });

        it('should quote values with spaces', () => {
            const logger = Log.create();
            logger.info('message', { description: 'hello world' });

            const output = consoleSpy.log.mock.calls[0][0];
            expect(output).toContain('description="hello world"');
        });

        it('should format Error objects', () => {
            const logger = Log.create();
            const error = new Error('test error');
            logger.info('message', { error });

            const output = consoleSpy.log.mock.calls[0][0];
            expect(output).toContain('error=test error');
        });

        it('should handle nested errors with cause', () => {
            const logger = Log.create();
            const cause = new Error('root cause');
            const error = new Error('wrapper error', { cause });
            logger.info('message', { error });

            const output = consoleSpy.log.mock.calls[0][0];
            expect(output).toContain('wrapper error');
            expect(output).toContain('Caused by:');
            expect(output).toContain('root cause');
        });
    });

    describe('Log.setLevel', () => {
        it('should set the global log level', () => {
            Log.setLevel('ERROR');
            expect(Log.getLevel()).toBe('ERROR');
        });
    });

    describe('printf-style formatting', () => {
        it('should support %s string substitution', () => {
            const logger = Log.create();
            logger.info('Hello %s', 'world');

            const output = consoleSpy.log.mock.calls[0][0];
            expect(output).toContain('Hello world');
        });

        it('should support %o object substitution', () => {
            const logger = Log.create();
            logger.info('Data: %o', { key: 'value' });

            const output = consoleSpy.log.mock.calls[0][0];
            expect(output).toContain('Data:');
            expect(output).toContain('key');
        });
    });
});
