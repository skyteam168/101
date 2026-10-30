import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { BusinessError } from '../../common/errors/business.error';
import { AuthUser } from '../auth/auth.types';
import {
  CreateAreaDto,
  CreateTableDto,
  ExportStickersDto,
  MergeTableDto,
  OpenTableDto,
  TransferTableDto,
  UpdateAreaDto,
  UpdateTableDto,
} from './dto/table.dto';
import { TableService } from './table.service';

@ApiTags('table')
@ApiBearerAuth()
@Controller('tables')
export class TableController {
  constructor(private readonly tableService: TableService) {}

  private storeId(user: AuthUser): string {
    if (!user.storeId) throw new BusinessError('STORE_REQUIRED');
    return user.storeId;
  }

  @Get('floor')
  @RequirePerm('menu:table')
  floor(@CurrentUser() user: AuthUser) {
    return this.tableService.listFloor(this.storeId(user));
  }

  @Get('areas')
  @RequirePerm('menu:table')
  areas(@CurrentUser() user: AuthUser) {
    return this.tableService.listAreas(this.storeId(user));
  }

  @Post('areas')
  @RequirePerm('menu:table')
  createArea(@CurrentUser() user: AuthUser, @Body() dto: CreateAreaDto) {
    return this.tableService.createArea(this.storeId(user), dto);
  }

  @Patch('areas/:id')
  @RequirePerm('menu:table')
  updateArea(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAreaDto,
  ) {
    return this.tableService.updateArea(this.storeId(user), id, dto);
  }

  @Delete('areas/:id')
  @RequirePerm('menu:table')
  deleteArea(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tableService.deleteArea(this.storeId(user), id);
  }

  @Get()
  @RequirePerm('menu:table')
  list(@CurrentUser() user: AuthUser) {
    return this.tableService.listTables(this.storeId(user));
  }

  @Post('export-stickers')
  @RequirePerm('menu:table')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="table-stickers.pdf"')
  async exportStickers(
    @CurrentUser() user: AuthUser,
    @Body() dto: ExportStickersDto,
  ) {
    const buf = await this.tableService.exportStickers(this.storeId(user), dto);
    return new StreamableFile(buf);
  }

  @Post()
  @RequirePerm('menu:table')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTableDto) {
    return this.tableService.createTable(this.storeId(user), dto);
  }

  @Patch(':id')
  @RequirePerm('menu:table')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTableDto,
  ) {
    return this.tableService.updateTable(this.storeId(user), id, dto);
  }

  @Delete(':id')
  @RequirePerm('menu:table')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tableService.deleteTable(this.storeId(user), id);
  }

  @Post(':id/reset-qr')
  @RequirePerm('menu:table')
  resetQr(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tableService.resetQr(this.storeId(user), id);
  }

  @Post(':id/open')
  @RequirePerm('table:open')
  open(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: OpenTableDto,
  ) {
    return this.tableService.openTable(this.storeId(user), id, dto, user.id);
  }

  @Post(':id/clear')
  @RequirePerm('table:open')
  clear(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tableService.clearTable(this.storeId(user), id);
  }

  @Post(':id/transfer')
  @RequirePerm('table:open')
  transfer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: TransferTableDto,
  ) {
    return this.tableService.transferTable(this.storeId(user), id, dto);
  }

  @Post(':id/merge')
  @RequirePerm('table:open')
  merge(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: MergeTableDto,
  ) {
    return this.tableService.mergeTable(this.storeId(user), id, dto);
  }
}
