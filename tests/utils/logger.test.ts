import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, setLogLevel, LogLevel } from '../../src/utils/logger.js';

describe('logger', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    setLogLevel(LogLevel.Debug);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    setLogLevel(LogLevel.Info);
  });

  it('logs debug messages when verbose', () => {
    setLogLevel(LogLevel.Debug);
    logger.debug('test-mod', 'debug message');
    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('test-mod');
    expect(output).toContain('debug message');
  });

  it('does not log debug messages at info level', () => {
    setLogLevel(LogLevel.Info);
    logger.debug('test-mod', 'hidden');
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('logs info messages at info level', () => {
    setLogLevel(LogLevel.Info);
    logger.info('test-mod', 'info message');
    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('info message');
  });

  it('suppresses info messages in quiet mode', () => {
    setLogLevel(LogLevel.Warn);
    logger.info('test-mod', 'suppressed');
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('logs warn messages', () => {
    setLogLevel(LogLevel.Warn);
    logger.warn('test-mod', 'warning message');
    expect(stderrSpy).toHaveBeenCalled();
    const output = stderrSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('warning message');
  });

  it('always logs errors regardless of level', () => {
    setLogLevel(LogLevel.Warn);
    logger.error('test-mod', 'error message');
    expect(stderrSpy).toHaveBeenCalled();
    const output = stderrSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('error message');
  });

  it('logs errors even in quiet mode', () => {
    setLogLevel(LogLevel.Error);
    logger.error('test-mod', 'critical error');
    expect(stderrSpy).toHaveBeenCalled();
  });

  it('handles Error objects in error logging', () => {
    logger.error('test-mod', 'failed', new Error('boom'));
    expect(stderrSpy).toHaveBeenCalled();
    const output = stderrSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('boom');
  });
});
