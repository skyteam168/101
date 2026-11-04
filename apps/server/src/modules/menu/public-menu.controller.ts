import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { resolvePublicStoreId } from '../../common/public-store.util';
import { MenuService } from './menu.service';

class PublicMenuQuery {
  @IsOptional()
  @IsString()
  storeId?: string;

  @IsOptional()
  @IsIn(['dine_in', 'delivery'])
  channel?: 'dine_in' | 'delivery';
}

@ApiTags('public')
@Controller('public/menu')
export class PublicMenuController {
  constructor(private readonly menuService: MenuService) {}

  @Public()
  @Get()
  list(@Query() query: PublicMenuQuery) {
    const storeId = resolvePublicStoreId(query.storeId);
    return this.menuService.getPublicMenu(storeId, query.channel || 'dine_in');
  }
}
