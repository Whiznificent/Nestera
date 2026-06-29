import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of, from } from 'rxjs';
import { tap, switchMap } from 'rxjs/operators';
import { CacheStrategyService } from '../../modules/cache/cache-strategy.service';
import {
  CACHE_CONFIG_KEY,
  CacheConfigMetadata,
} from '../decorators/cache-config.decorator';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(
    private cacheStrategy: CacheStrategyService,
    private reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, query } = request;

    if (method !== 'GET') return next.handle();

    // Read per-handler cache config set via @CacheConfig(…)
    const config = this.reflector.get<CacheConfigMetadata>(
      CACHE_CONFIG_KEY,
      context.getHandler(),
    );

    const cacheKey = `${url}:${JSON.stringify(query)}`;
    const ttl = config?.ttl;
    const tags = config?.tags;

    return from(this.cacheStrategy.get(cacheKey)).pipe(
      switchMap((cached) => {
        if (cached) return of(cached);

        return next.handle().pipe(
          tap((data) => {
            this.cacheStrategy.set(cacheKey, data, ttl, tags);
          }),
        );
      }),
    );
  }
}
