import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { BusinessError } from '../../common/errors/business.error';
import { PrismaService } from '../../prisma/prisma.service';

export type MailSettings = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private fromAddr = '';

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.applyEnvFallback();
  }

  private applyEnvFallback() {
    const host = this.config.get<string>('SMTP_HOST');
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(this.config.get('SMTP_PORT') || 587),
        secure: this.config.get('SMTP_SECURE') === 'true',
        connectionTimeout: 12_000,
        greetingTimeout: 12_000,
        socketTimeout: 20_000,
        auth: {
          user: this.config.get<string>('SMTP_USER'),
          pass: this.config.get<string>('SMTP_PASS'),
        },
      });
      this.fromAddr =
        this.config.get<string>('SMTP_FROM') || this.config.get<string>('SMTP_USER') || '';
    }
  }

  /** 从门店配置热加载 SMTP（优先于 .env） */
  async reloadFromStore(storeId = '1') {
    const store = await this.prisma.store.findUnique({ where: { id: BigInt(storeId) } });
    const raw = store?.mailSettings;
    if (raw && typeof raw === 'object') {
      const s = raw as Partial<MailSettings>;
      if (s.enabled && s.host && s.user) {
        this.transporter = nodemailer.createTransport({
          host: s.host,
          port: Number(s.port || 587),
          secure: !!s.secure,
          connectionTimeout: 12_000,
          greetingTimeout: 12_000,
          socketTimeout: 20_000,
          auth: { user: s.user, pass: s.pass || '' },
        });
        this.fromAddr = s.from || s.user;
        return;
      }
    }
    this.transporter = null;
    this.fromAddr = '';
    this.applyEnvFallback();
  }

  async sendMail(to: string, subject: string, text: string, html?: string) {
    await this.reloadFromStore();
    if (!this.transporter) {
      this.logger.warn(`[DEV] email to ${to}: ${subject} | ${text}`);
      return { dev: true };
    }
    try {
      await this.transporter.sendMail({
        from: this.fromAddr,
        to,
        subject,
        text,
        html: html || `<p>${text}</p>`,
      });
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`sendMail failed to=${to}: ${msg}`);
      throw new BusinessError('EMAIL_SEND_FAILED');
    }
  }

  async sendVerifyCode(email: string, code: string, lang: 'zh' | 'vi') {
    const subject =
      lang === 'vi' ? `[Nhà hàng] Mã xác minh: ${code}` : `[餐厅] 验证码：${code}`;
    const text =
      lang === 'vi'
        ? `Mã xác minh của bạn là ${code}, hiệu lực 10 phút. Không chia sẻ cho người khác.`
        : `您的验证码是 ${code}，10 分钟内有效。请勿告知他人。`;
    const html =
      lang === 'vi'
        ? `<p>Mã xác minh: <b style="font-size:20px">${code}</b></p><p>Hiệu lực 10 phút.</p>`
        : `<p>验证码：<b style="font-size:20px">${code}</b></p><p>10 分钟内有效。</p>`;
    return this.sendMail(email, subject, text, html);
  }

  /** 发送自定义通知给指定邮箱列表 */
  async sendBulk(emails: string[], subject: string, content: string) {
    const results = [];
    for (const email of emails) {
      results.push(await this.sendMail(email, subject, content));
    }
    return { sent: results.length, results };
  }
}
