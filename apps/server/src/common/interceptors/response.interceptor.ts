import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

/** 统一成功响应 { code: 0, data, message } */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        const res = context.switchToHttp().getResponse<{ headersSent?: boolean }>();
        if (res?.headersSent) return data;
        if (data instanceof StreamableFile || Buffer.isBuffer(data)) return data;
        if (
          data &&
          typeof data === 'object' &&
          'code' in (data as Record<string, unknown>) &&
          'data' in (data as Record<string, unknown>)
        ) {
          return data;
        }
        return { code: 0, data: data ?? null, message: 'ok' };
      }),
    );
  }
}
