import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { AuthUser } from '../auth/auth.types';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './dto/user.dto';
import { UserService } from './user.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @RequirePerm('menu:system:user')
  list(@CurrentUser() user: AuthUser) {
    return this.userService.list(user.storeId);
  }

  @Post()
  @RequirePerm('menu:system:user')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.userService.create(dto, user.storeId, user.id);
  }

  @Patch(':id')
  @RequirePerm('menu:system:user')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.userService.update(id, dto, user.id);
  }

  @Put(':id/status')
  @RequirePerm('menu:system:user')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body('status') status: 'active' | 'disabled',
  ) {
    return this.userService.setStatus(id, status, user.id);
  }

  @Put(':id/password')
  @RequirePerm('menu:system:user')
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.userService.resetPassword(id, dto);
  }
}
