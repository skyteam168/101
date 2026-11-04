import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { resolvePublicStoreId } from '../../common/public-store.util';
import { MenuService } from '../menu/menu.service';
import { NoticeService } from './notice.service';
import { StoreService } from './store.service';

class PublicHomeQuery {
  @IsOptional()
  @IsString()
  storeId?: string;
}

@ApiTags('public')
@Controller('public/home')
export class PublicHomeController {
  constructor(
    private readonly noticeService: NoticeService,
    private readonly menuService: MenuService,
    private readonly storeService: StoreService,
  ) {}

  @Public()
  @Get()
  async home(@Query() query: PublicHomeQuery) {
    const storeId = resolvePublicStoreId(query.storeId);
    const [store, notices, newDishes] = await Promise.all([
      this.storeService.getPublicHomeStore(storeId),
      this.noticeService.listPublic(storeId),
      this.menuService.listNewDishes(storeId),
    ]);
    return {
      store,
      banners: store.banners,
      notices,
      newDishes,
    };
  }
}
