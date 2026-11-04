import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { NextFunction, Request, Response } from 'express';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import { patchBigIntJson } from './common/utils/bigint-json';
import { assertProductionRuntimeConfig } from './modules/security/auth-config.util';

async function bootstrap() {
  // BigInt 序列化为 number（越南盾整数在安全整数范围内）
  patchBigIntJson();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const nodeEnv = config.get<string>('NODE_ENV') ?? process.env.NODE_ENV ?? 'development';
  const isProd = nodeEnv === 'production';

  assertProductionRuntimeConfig({
    nodeEnv,
    jwtSecret: config.get<string>('JWT_SECRET'),
    turnstileSiteKey: config.get<string>('CF_TURNSTILE_SITE_KEY'),
    turnstileSecret: config.get<string>('CF_TURNSTILE_SECRET_KEY'),
    smtpHost: config.get<string>('SMTP_HOST'),
  });

  // 经 Cloudflare / Nginx 反代时信任 X-Forwarded-*，才能拿到真实客户端 IP
  app.set('trust proxy', config.get<string>('TRUST_PROXY') ?? '1');

  const uploadDir = config.get<string>('UPLOAD_DIR') || join(process.cwd(), 'uploads');
  if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
  app.useStaticAssets(uploadDir, { prefix: '/uploads' });

  app.setGlobalPrefix('api');
  const corsOrigin = config.get<string>('CORS_ORIGIN') ?? (isProd ? '' : '*');
  if (isProd && (!corsOrigin || corsOrigin.trim() === '*')) {
    throw new Error('生产环境必须配置明确的 CORS_ORIGIN（禁止 *）');
  }
  app.enableCors({
    origin: corsOrigin.split(',').map((s) => s.trim()).filter(Boolean),
    credentials: true,
  });

  // 基础安全响应头；API 禁止被嵌入，前端页面 CSP 见 admin/h5 index.html
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new RequestLoggingInterceptor(), new ResponseInterceptor());

  // 生产默认关闭 Swagger；需要时设 ENABLE_SWAGGER=true
  const enableSwagger =
    config.get<string>('ENABLE_SWAGGER') === 'true' ||
    (!isProd && config.get<string>('ENABLE_SWAGGER') !== 'false');
  if (enableSwagger) {
    const swagger = new DocumentBuilder()
      .setTitle('Restaurant API')
      .setDescription('饭店餐饮管理系统 API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));
  }

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${port} (${nodeEnv})`);
  if (enableSwagger) {
    // eslint-disable-next-line no-console
    console.log(`Swagger: http://localhost:${port}/api/docs`);
  }
}

bootstrap();
