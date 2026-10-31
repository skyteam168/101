import { Body, Controller, Get, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { getClientMeta } from '../../common/utils/client-ip.util';
import { AuthService } from './auth.service';
import { AuthUser } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { LogoutDto, RefreshDto } from './dto/refresh.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, getClientMeta(req));
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Post('logout')
  logout(@CurrentUser() user: AuthUser, @Body() body: LogoutDto, @Req() req: Request) {
    return this.authService.logout(user.id, body?.refreshToken, getClientMeta(req));
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.id);
  }

  @ApiBearerAuth()
  @Patch('profile')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(user.id, dto);
  }
}
