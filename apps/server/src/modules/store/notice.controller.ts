import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { BusinessError } from '../../common/errors/business.error';
import { AuthUser } from '../auth/auth.types';
import { CreateNoticeDto, UpdateNoticeDto } from './dto/notice.dto';
import { NoticeService } from './notice.service';

@ApiTags('store-notices')
@ApiBearerAuth()
@Controller('store/notices')
export class NoticeController {
  constructor(private readonly noticeService: NoticeService) {}

  private storeId(user: AuthUser) {
    if (!user.storeId) throw new BusinessError('STORE_REQUIRED');
    return user.storeId;
  }

  @Get()
  @RequirePerm('menu:system')
  list(@CurrentUser() user: AuthUser) {
    return this.noticeService.list(this.storeId(user));
  }

  @Post()
  @RequirePerm('menu:system')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateNoticeDto) {
    return this.noticeService.create(this.storeId(user), dto);
  }

  @Patch(':id')
  @RequirePerm('menu:system')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateNoticeDto,
  ) {
    return this.noticeService.update(this.storeId(user), id, dto);
  }

  @Delete(':id')
  @RequirePerm('menu:system')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.noticeService.remove(this.storeId(user), id);
  }
}
