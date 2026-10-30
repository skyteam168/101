import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type CustomerUser = {
  customerId: string;
  email: string;
  lang: 'zh' | 'vi';
};

export const CurrentCustomer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CustomerUser => {
    const req = ctx.switchToHttp().getRequest<{ customer?: CustomerUser }>();
    return req.customer!;
  },
);
