import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { BusinessError } from '../../common/errors/business.error';
import { AuthUser } from '../auth/auth.types';
import { AssetService } from './asset.service';
import {
  AssetEventQtyDto,
  AssetQueryDto,
  CheckAssetDto,
  CreateAssetCategoryDto,
  CreateAssetDto,
  TransferAssetDto,
  UpdateAssetCategoryDto,
  UpdateAssetDto,
} from './dto/asset.dto';

@ApiTags('asset')
@ApiBearerAuth()
@Controller('assets')
export class AssetController {
  constructor(private readonly assets: AssetService) {}

  private storeId(user: AuthUser): string {
    if (!user.storeId) throw new BusinessError('STORE_REQUIRED');
    return user.storeId;
  }

  // ---- categories ----

  @Get('categories')
  @RequirePerm('menu:asset')
  categories(@CurrentUser() user: AuthUser) {
    return this.assets.listCategories(this.storeId(user));
  }

  @Post('categories')
  @RequirePerm('menu:asset')
  createCategory(@CurrentUser() user: AuthUser, @Body() dto: CreateAssetCategoryDto) {
    return this.assets.createCategory(this.storeId(user), dto);
  }

  @Patch('categories/:id')
  @RequirePerm('menu:asset')
  updateCategory(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAssetCategoryDto,
  ) {
    return this.assets.updateCategory(this.storeId(user), id, dto);
  }

  @Delete('categories/:id')
  @RequirePerm('menu:asset')
  deleteCategory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.assets.deleteCategory(this.storeId(user), id);
  }

  // ---- report / excel / labels (before :id) ----

  @Get('report')
  @RequirePerm('menu:asset')
  report(@CurrentUser() user: AuthUser) {
    return this.assets.report(this.storeId(user));
  }

  @Get('export')
  @RequirePerm('menu:asset')
  async exportExcel(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const buf = await this.assets.exportExcel(this.storeId(user));
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="assets.xlsx"');
    res.send(buf);
  }

  @Post('import')
  @RequirePerm('menu:asset')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  importExcel(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file?.buffer?.length) throw new BusinessError('ASSET_IMPORT_EMPTY');
    return this.assets.importExcel(this.storeId(user), user.id, file.buffer);
  }

  @Post('labels')
  @RequirePerm('menu:asset')
  async labels(
    @CurrentUser() user: AuthUser,
    @Body() body: { ids: string[] },
    @Res() res: Response,
  ) {
    if (!body?.ids?.length) throw new BusinessError('ASSET_NOT_FOUND');
    const buf = await this.assets.labelPdf(this.storeId(user), body.ids);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="asset-labels.pdf"');
    res.send(buf);
  }

  // ---- ledger ----

  @Get()
  @RequirePerm('menu:asset')
  list(@CurrentUser() user: AuthUser, @Query() query: AssetQueryDto) {
    return this.assets.listAssets(this.storeId(user), query);
  }

  @Post()
  @RequirePerm('menu:asset')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAssetDto) {
    return this.assets.createAsset(this.storeId(user), user.id, dto);
  }

  @Get(':id')
  @RequirePerm('menu:asset')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.assets.getAsset(this.storeId(user), id);
  }

  @Patch(':id')
  @RequirePerm('menu:asset')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateAssetDto) {
    return this.assets.updateAsset(this.storeId(user), id, dto);
  }

  // ---- lifecycle events ----

  @Post(':id/in')
  @RequirePerm('menu:asset')
  in(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssetEventQtyDto) {
    return this.assets.eventIn(this.storeId(user), id, user.id, dto);
  }

  @Post(':id/assign')
  @RequirePerm('menu:asset')
  assign(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssetEventQtyDto) {
    return this.assets.eventAssign(this.storeId(user), id, user.id, dto);
  }

  @Post(':id/transfer')
  @RequirePerm('menu:asset')
  transfer(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TransferAssetDto) {
    return this.assets.eventTransfer(this.storeId(user), id, user.id, dto);
  }

  @Post(':id/repair')
  @RequirePerm('menu:asset')
  repair(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssetEventQtyDto) {
    return this.assets.eventRepair(this.storeId(user), id, user.id, dto);
  }

  @Post(':id/repair-done')
  @RequirePerm('menu:asset')
  repairDone(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssetEventQtyDto) {
    return this.assets.eventRepairDone(this.storeId(user), id, user.id, dto);
  }

  @Post(':id/scrap')
  @RequirePerm('asset:scrap')
  scrap(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssetEventQtyDto) {
    return this.assets.eventScrap(this.storeId(user), id, user.id, dto);
  }

  @Post(':id/sell')
  @RequirePerm('asset:sell')
  sell(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssetEventQtyDto) {
    return this.assets.eventSell(this.storeId(user), id, user.id, dto);
  }

  @Post(':id/check')
  @RequirePerm('menu:asset')
  check(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CheckAssetDto) {
    return this.assets.eventCheck(this.storeId(user), id, user.id, dto);
  }
}
