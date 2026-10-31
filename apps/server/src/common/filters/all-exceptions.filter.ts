import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { BusinessError } from '../errors/business.error';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception instanceof BusinessError) {
      const body = exception.getResponse() as { code: string; message: string; data: null };
      res.status(exception.getStatus()).json(body);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const message =
        typeof raw === 'string'
          ? raw
          : ((raw as { message?: string | string[] }).message ?? exception.message);
      const messages = Array.isArray(message) ? message : [message];
      // DTO Matches 的 message 写成业务错误码时，透传给前端 i18n
      const businessCode = messages.find((m) =>
        typeof m === 'string' && /^[A-Z][A-Z0-9_]+$/.test(m),
      );
      if (businessCode && status === HttpStatus.BAD_REQUEST) {
        res.status(status).json({
          code: businessCode,
          message: businessCode,
          data: null,
        });
        return;
      }
      res.status(status).json({
        code: status === HttpStatus.UNAUTHORIZED ? 'UNAUTHORIZED' : 'HTTP_ERROR',
        message: messages.join('; '),
        data: null,
      });
      return;
    }

    this.logger.error(exception);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      data: null,
    });
  }
}
