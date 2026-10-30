import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BusinessError } from '../errors/business.error';
import { GuestUser } from '../decorators/guest.decorator';

@Injectable()
export class GuestAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      guest?: GuestUser;
    }>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new BusinessError('UNAUTHORIZED', undefined, 401);
    }
    try {
      const payload = await this.jwt.verifyAsync<{
        typ: string;
        sub: string;
        nickname: string;
        sessionId: string;
        tableId: string;
        storeId: string;
      }>(header.slice(7), {
        secret: this.config.get<string>('JWT_SECRET') ?? 'dev-secret-change-me',
      });
      if (payload.typ !== 'guest') {
        throw new BusinessError('UNAUTHORIZED', undefined, 401);
      }
      req.guest = {
        guestId: payload.sub,
        nickname: payload.nickname,
        sessionId: payload.sessionId,
        tableId: payload.tableId,
        storeId: payload.storeId,
      };
      return true;
    } catch {
      throw new BusinessError('UNAUTHORIZED', undefined, 401);
    }
  }
}
