import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BusinessError } from '../errors/business.error';
import { CustomerUser } from '../decorators/customer.decorator';

@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      customer?: CustomerUser;
    }>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new BusinessError('UNAUTHORIZED', undefined, 401);
    }
    try {
      const payload = await this.jwt.verifyAsync<{
        typ: string;
        sub: string;
        email: string;
        lang?: string;
      }>(header.slice(7), {
        secret: this.config.get<string>('JWT_SECRET') ?? 'dev-secret-change-me',
      });
      if (payload.typ !== 'customer') {
        throw new BusinessError('UNAUTHORIZED', undefined, 401);
      }
      req.customer = {
        customerId: String(payload.sub),
        email: payload.email,
        lang: payload.lang === 'zh' ? 'zh' : 'vi',
      };
      return true;
    } catch {
      throw new BusinessError('UNAUTHORIZED', undefined, 401);
    }
  }
}
