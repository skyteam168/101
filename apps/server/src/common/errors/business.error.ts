import { HttpException, HttpStatus } from '@nestjs/common';

/** 业务错误：前端用 i18n 翻译 code */
export class BusinessError extends HttpException {
  constructor(
    public readonly errorCode: string,
    message?: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super(
      {
        code: errorCode,
        message: message ?? errorCode,
        data: null,
      },
      status,
    );
  }
}
