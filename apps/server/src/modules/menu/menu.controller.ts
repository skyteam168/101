import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { BusinessError } from '../../common/errors/business.error';
import { STORAGE_DRIVER, StorageDriver } from '../../storage/storage.interface';
import { AuthUser } from '../auth/auth.types';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import {
  BatchPriceDto,
  BatchSoldOutDto,
  BatchStatusDto,
  CreateDishDto,
  DishQueryDto,
  UpdateDishDto,
} from './dto/dish.dto';
import { MenuService } from './menu.service';

@ApiTags('menu')
@ApiBearerAuth()
@Controller('menu')
export class MenuController {
  constructor(
    private readonly menuService: MenuService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  private storeId(user: AuthUser): string {
    if (!user.storeId) throw new BusinessError('STORE_REQUIRED');
    return user.storeId;
  }

  @Get('stations')
  @RequirePerm('menu:dish')
  stations(@CurrentUser() user: AuthUser) {
    return this.menuService.listStations(this.storeId(user));
  }

  @Get('categories')
  @RequirePerm('menu:dish')
  categories(@CurrentUser() user: AuthUser) {
    return this.menuService.listCategories(this.storeId(user));
  }

  @Post('categories')
  @RequirePerm('menu:dish:edit')
  createCategory(@CurrentUser() user: AuthUser, @Body() dto: CreateCategoryDto) {
    return this.menuService.createCategory(this.storeId(user), dto);
  }

  @Patch('categories/:id')
  @RequirePerm('menu:dish:edit')
  updateCategory(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.menuService.updateCategory(this.storeId(user), id, dto);
  }

  @Delete('categories/:id')
  @RequirePerm('menu:dish:edit')
  deleteCategory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.menuService.deleteCategory(this.storeId(user), id);
  }

  @Get('dishes')
  @RequirePerm('menu:dish')
  dishes(@CurrentUser() user: AuthUser, @Query() query: DishQueryDto) {
    return this.menuService.listDishes(this.storeId(user), query);
  }

  @Put('dishes/batch/status')
  @RequirePerm('menu:dish:edit')
  batchStatus(@CurrentUser() user: AuthUser, @Body() dto: BatchStatusDto) {
    return this.menuService.batchStatus(this.storeId(user), dto);
  }

  @Put('dishes/batch/price')
  @RequirePerm('menu:dish:edit')
  batchPrice(@CurrentUser() user: AuthUser, @Body() dto: BatchPriceDto) {
    return this.menuService.batchPrice(this.storeId(user), dto);
  }

  @Put('dishes/batch/sold-out')
  @RequirePerm('menu:dish:edit')
  batchSoldOut(@CurrentUser() user: AuthUser, @Body() dto: BatchSoldOutDto) {
    return this.menuService.batchSoldOut(this.storeId(user), dto);
  }

  @Get('dishes/:id')
  @RequirePerm('menu:dish')
  dish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.menuService.getDish(this.storeId(user), id);
  }

  @Post('dishes')
  @RequirePerm('menu:dish:edit')
  createDish(@CurrentUser() user: AuthUser, @Body() dto: CreateDishDto) {
    return this.menuService.createDish(this.storeId(user), dto);
  }

  @Patch('dishes/:id')
  @RequirePerm('menu:dish:edit')
  updateDish(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDishDto) {
    return this.menuService.updateDish(this.storeId(user), id, dto);
  }

  @Delete('dishes/:id')
  @RequirePerm('menu:dish:edit')
  deleteDish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.menuService.deleteDish(this.storeId(user), id);
  }

  @Post('upload')
  @RequirePerm('menu:dish:edit')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BusinessError('UPLOAD_FILE_REQUIRED');
    return this.storage.upload(file, 'dishes');
  }
}
