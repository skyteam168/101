import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export const IS_GUEST_KEY = 'is_guest_route';
export const GuestRoute = () => SetMetadata(IS_GUEST_KEY, true);

export type GuestUser = {
  guestId: string;
  nickname: string;
  sessionId: string;
  tableId: string;
  storeId: string;
};

export const CurrentGuest = createParamDecorator((_data: unknown, ctx: ExecutionContext): GuestUser => {
  const req = ctx.switchToHttp().getRequest<{ guest?: GuestUser }>();
  return req.guest!;
});
