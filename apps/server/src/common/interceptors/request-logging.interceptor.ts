import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { getClientIp } from '../utils/client-ip.util';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const { method, originalUrl } = req;
    const ip = getClientIp(req) ?? '-';
    const started = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(`${method} ${originalUrl} ${Date.now() - started}ms ip=${ip}`);
        },
        error: (err: Error) => {
          this.logger.warn(
            `${method} ${originalUrl} ${Date.now() - started}ms ip=${ip} err=${err.message}`,
          );
        },
      }),
    );
  }
}
