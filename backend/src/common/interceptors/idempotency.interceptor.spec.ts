import {
  ExecutionContext,
  CallHandler,
  ConflictException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IDEMPOTENCY_KEY } from '../decorators/idempotent.decorator';
import { of, throwError, firstValueFrom } from 'rxjs';

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let reflector: Reflector;
  let cache: Record<string, unknown>;

  const mockCache = {
    get: jest.fn(async (key: string) => cache[key] ?? null),
    set: jest.fn(async (key: string, value: unknown) => {
      cache[key] = value;
    }),
    del: jest.fn(async (key: string) => {
      delete cache[key];
    }),
  };

  beforeEach(() => {
    cache = {};
    reflector = new Reflector();
    interceptor = new IdempotencyInterceptor(reflector, mockCache as any);
    jest.clearAllMocks();
  });

  const createMockContext = (
    method: string,
    path: string,
    headers: Record<string, string>,
    body: unknown = {},
    handlerFn?: Function,
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ method, path, headers, body }),
        getResponse: () => ({
          statusCode: 200,
          setHeader: jest.fn(),
          status: jest.fn(),
        }),
      }),
      getHandler: () => handlerFn ?? (() => {}),
    }) as any;

  it('should skip when no @Idempotent decorator is present', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue(undefined);
    const context = createMockContext('POST', '/test', { 'idempotency-key': 'k1' });
    const next = { handle: jest.fn().mockReturnValue(of({ ok: true })) };

    const result$ = await interceptor.intercept(context, next);
    expect(result$).toBe(next.handle());
    expect(mockCache.get).not.toHaveBeenCalled();
  });

  it('should skip when no idempotency-key header is provided', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue({ ttlSeconds: 3600 });
    const context = createMockContext('POST', '/test', {});
    const next = { handle: jest.fn().mockReturnValue(of({ ok: true })) };

    await interceptor.intercept(context, next);
    expect(next.handle).toHaveBeenCalled();
  });

  it('should return cached response on idempotency hit', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue({ ttlSeconds: 3600 });

    const payloadHash = require('crypto')
      .createHash('sha256')
      .update(JSON.stringify({}))
      .digest('hex');

    cache['idempotency:POST:/test:k1'] = {
      payloadHash,
      statusCode: 201,
      body: { id: '123' },
      completedAt: new Date().toISOString(),
    };

    const context = createMockContext('POST', '/test', { 'idempotency-key': 'k1' });
    const next: CallHandler = { handle: () => of({ shouldNotReturn: true }) };

    const result$ = await interceptor.intercept(context, next);
    const result = await firstValueFrom(result$);
    expect(result).toEqual({ id: '123' });
  });

  it('should return 409 when same key is used with different payload', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue({ ttlSeconds: 3600 });

    cache['idempotency:POST:/test:k1'] = {
      payloadHash: 'different-hash',
      statusCode: 201,
      body: { id: '123' },
      completedAt: new Date().toISOString(),
    };

    const context = createMockContext('POST', '/test', { 'idempotency-key': 'k1' });
    const next: CallHandler = { handle: () => of({}) };

    const result$ = await interceptor.intercept(context, next);
    await expect(firstValueFrom(result$)).rejects.toThrow(ConflictException);
  });

  it('should process and cache a new request', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue({ ttlSeconds: 3600 });

    const context = createMockContext('POST', '/test', { 'idempotency-key': 'k2' });
    const next: CallHandler = { handle: () => of({ created: true }) };

    const result$ = await interceptor.intercept(context, next);
    const result = await firstValueFrom(result$);

    expect(result).toEqual({ created: true });
    await new Promise((r) => setTimeout(r, 10));
    expect(mockCache.set).toHaveBeenCalled();
  });

  it('should release lock on error', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue({ ttlSeconds: 3600 });

    const context = createMockContext('POST', '/test', { 'idempotency-key': 'k3' });
    const next: CallHandler = {
      handle: () => throwError(() => new Error('boom')),
    };

    const result$ = await interceptor.intercept(context, next);
    await expect(firstValueFrom(result$)).rejects.toThrow('boom');
    await new Promise((r) => setTimeout(r, 10));
    expect(mockCache.del).toHaveBeenCalled();
  });
});
