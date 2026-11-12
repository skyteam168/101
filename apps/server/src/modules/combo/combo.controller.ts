import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { BusinessError } from '../../common/errors/business.error';
import { AuthUser } from '../auth/auth.types';
import { ComboService } from './combo.service';
import { ComboQueryDto, CreateComboDto, UpdateComboDto } from './dto/combo.dto';

@ApiTags('combo')
@ApiBearerAuth()
@Controller('combos')
export class ComboController {
  constructor(private readonly comboService: ComboService) {}

  private storeId(user: AuthUser): string {
    if (!user.storeId) throw new BusinessError('STORE_REQUIRED');
    return user.storeId;
  }

  /** 获取套餐列表 */
  @Get()
  @RequirePerm('combo:view')
  list(@CurrentUser() user: AuthUser, @Query() query: ComboQueryDto) {
    return this.comboService.list(this.storeId(user), query);
  }

  /** 获取单个套餐详情（含分组/子项） */
  @Get(':id')
  @RequirePerm('combo:view')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.comboService.findById(this.storeId(user), id);
  }

  /** 新建套餐（可嵌套提交分组） */
  @Post()
  @RequirePerm('combo:edit')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateComboDto) {
    return this.comboService.create(this.storeId(user), dto, user.id);
  }

  /** 更新套餐（groups 字段传则全量覆盖分组） */
  @Patch(':id')
  @RequirePerm('combo:edit')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateComboDto,
  ) {
    return this.comboService.update(this.storeId(user), id, dto, user.id);
  }

  /** 删除套餐（进行中订单引用则拒绝；历史订单断开 comboId） */
  @Delete(':id')
  @RequirePerm('combo:edit')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.comboService.delete(this.storeId(user), id, user.id);
  }
}
