import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { BusinessError } from '../../common/errors/business.error';
import { AuthUser } from '../auth/auth.types';
import { MailService } from '../delivery/mail.service';
import { PushMessageDto, UpdateStoreSettingsDto } from './dto/store.dto';
import { StoreService } from './store.service';

@ApiTags('store')
@ApiBearerAuth()
@Controller('store')
export class StoreController {
  constructor(
    private readonly storeService: StoreService,
    private readonly mail: MailService,
  ) {}

  private storeId(user: AuthUser) {
    if (!user.storeId) throw new BusinessError('STORE_REQUIRED');
    return user.storeId;
  }

  @Get('settings')
  @RequirePerm('menu:system')
  getSettings(@CurrentUser() user: AuthUser) {
    return this.storeService.getSettings(this.storeId(user));
  }

  /** 收银端拉取播报配置（桌台页权限即可） */
  @Get('announce')
  @RequirePerm('menu:table')
  getAnnounce(@CurrentUser() user: AuthUser) {
    return this.storeService.getSettings(this.storeId(user)).then((s) => ({
      announceLang: s.announceLang,
      announceSettings: s.announceSettings,
    }));
  }

  @Patch('settings')
  @RequirePerm('menu:system')
  async updateSettings(@CurrentUser() user: AuthUser, @Body() dto: UpdateStoreSettingsDto) {
    const result = await this.storeService.updateSettings(this.storeId(user), dto);
    if (dto.mailSettings) await this.mail.reloadFromStore(this.storeId(user));
    return result;
  }

  /** 向指定用户推送邮件消息 */
  @Post('push-message')
  @RequirePerm('menu:system')
  @ApiOperation({ summary: '推送邮件给指定用户' })
  async pushMessage(@CurrentUser() user: AuthUser, @Body() dto: PushMessageDto) {
    const emails = await this.storeService.resolvePushEmails(
      this.storeId(user),
      dto.emails,
      dto.customerIds,
    );
    if (!emails.length) throw new BusinessError('PUSH_NO_RECIPIENT');
    return this.mail.sendBulk(emails, dto.subject, dto.content);
  }
}
