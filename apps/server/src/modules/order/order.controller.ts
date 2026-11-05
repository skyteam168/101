import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { BusinessError } from '../../common/errors/business.error';
import { getClientIp } from '../../common/utils/client-ip.util';
import { AuthUser } from '../auth/auth.types';
import { AddComboItemDto } from '../combo/dto/combo.dto';
import {
  AddItemsDto,
  BindCustomerDto,
  CancelOrderDto,
  CheckoutDto,
  DiscountDto,
  LineDiscountDto,
  OrderQueryDto,
  RefundDto,
  SubmitOrderDto,
  TakeawaySubmitDto,
  TempItemDto,
  UpdateItemStatusDto,
  VoidItemDto,
} from './dto/order.dto';
import { OrderService } from './order.service';

@ApiTags('order')
@ApiBearerAuth()
@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  private storeId(user: AuthUser): string {
    if (!user.storeId) throw new BusinessError('STORE_REQUIRED');
    return user.storeId;
  }

  @Get()
  @RequirePerm('menu:order')
  list(@CurrentUser() user: AuthUser, @Query() query: OrderQueryDto) {
    return this.orderService.list(this.storeId(user), query);
  }

  /** 扫码待确认轮次数量（桌台/订单菜单角标） */
  @Get('pending-confirm-count')
  @RequirePerm('menu:table')
  async pendingConfirmCount(@CurrentUser() user: AuthUser) {
    const count = await this.orderService.countNeedConfirm(this.storeId(user));
    return { count };
  }

  /** 厨房看板（待制作 / 制作中） */
  @Get('kitchen-board')
  @RequirePerm('menu:kitchen')
  kitchenBoard(
    @CurrentUser() user: AuthUser,
    @Query('stationId') stationId?: string,
  ) {
    return this.orderService.kitchenBoard(this.storeId(user), stationId);
  }

  @Get('by-table/:tableId')
  @RequirePerm('menu:order')
  byTable(@CurrentUser() user: AuthUser, @Param('tableId') tableId: string) {
    return this.orderService.byTable(this.storeId(user), tableId);
  }

  @Get('takeaway/open')
  @RequirePerm('menu:order')
  openTakeaways(@CurrentUser() user: AuthUser) {
    return this.orderService.listOpenTakeaways(this.storeId(user));
  }

  @Post('takeaway')
  @RequirePerm('order:create')
  createTakeaway(@CurrentUser() user: AuthUser, @Body() dto: TakeawaySubmitDto) {
    return this.orderService.createTakeaway(this.storeId(user), dto, user.id);
  }

  @Post('batches/:batchId/confirm')
  @RequirePerm('order:create')
  confirmBatch(@CurrentUser() user: AuthUser, @Param('batchId') batchId: string) {
    return this.orderService.confirmBatch(this.storeId(user), batchId, user.id);
  }

  @Get(':id')
  @RequirePerm('menu:order')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orderService.detail(this.storeId(user), id);
  }

  @Post('submit')
  @RequirePerm('order:create')
  submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitOrderDto) {
    return this.orderService.submit(this.storeId(user), dto, user.id);
  }

  @Post(':id/items')
  @RequirePerm('order:add-item')
  addItems(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddItemsDto,
  ) {
    return this.orderService.addItems(this.storeId(user), id, dto, user.id);
  }

  @Post('items/:itemId/void')
  @RequirePerm('order:void-item')
  voidItem(
    @CurrentUser() user: AuthUser,
    @Param('itemId') itemId: string,
    @Body() dto: VoidItemDto,
  ) {
    return this.orderService.voidItem(this.storeId(user), itemId, dto, user.id);
  }

  @Patch('items/:itemId/status')
  @RequirePerm('menu:kitchen')
  updateItemStatus(
    @CurrentUser() user: AuthUser,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateItemStatusDto,
  ) {
    return this.orderService.updateItemStatus(this.storeId(user), itemId, dto, user.id);
  }

  @Post(':id/cancel')
  @RequirePerm('order:cancel')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orderService.cancel(this.storeId(user), id, dto, user.id);
  }

  @Patch(':id/discount')
  @RequirePerm('order:discount')
  discount(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DiscountDto,
  ) {
    return this.orderService.setDiscount(this.storeId(user), id, dto, user.id);
  }

  @Post(':id/temp-item')
  @RequirePerm('order:add-item')
  tempItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: TempItemDto,
  ) {
    return this.orderService.addTempItem(this.storeId(user), id, dto, user.id);
  }

  @Patch('items/:itemId/line')
  @RequirePerm('order:discount')
  lineDiscount(
    @CurrentUser() user: AuthUser,
    @Param('itemId') itemId: string,
    @Body() dto: LineDiscountDto,
  ) {
    return this.orderService.updateLineItem(this.storeId(user), itemId, dto, user.id);
  }

  @Post(':id/bind-customer')
  @RequirePerm('order:discount')
  bindCustomer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: BindCustomerDto,
  ) {
    return this.orderService.bindCustomer(this.storeId(user), id, dto, user.id);
  }

  @Post(':id/free')
  @RequirePerm('order:discount')
  freeOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orderService.freeOrder(this.storeId(user), id, user.id);
  }

  @Post(':id/checkout')
  @RequirePerm('order:checkout')
  checkout(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CheckoutDto,
  ) {
    return this.orderService.checkout(this.storeId(user), id, dto, user.id);
  }

  /** 向订单添加套餐（校验各组 min/max，按所选菜品扣库存） */
  @Post(':id/combo-items')
  @RequirePerm('order:add-item')
  addComboItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddComboItemDto,
  ) {
    return this.orderService.addComboItem(this.storeId(user), id, dto, user.id);
  }

  @Post(':id/reverse-checkout')
  @RequirePerm('order:checkout')
  reverseCheckout(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.orderService.reverseCheckout(this.storeId(user), id, user.id, getClientIp(req));
  }

  /** 正式退款：保留订单状态，扣减 paidAmount，写审计 */
  @Post(':id/refund')
  @RequirePerm('order:refund')
  refund(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RefundDto,
    @Req() req: Request,
  ) {
    return this.orderService.refund(this.storeId(user), id, dto, user.id, getClientIp(req));
  }
}
