import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { BusinessError } from '../../common/errors/business.error';
import { AuthUser } from '../auth/auth.types';
import { DeliveryOrderService } from './delivery-order.service';
import { AssignCourierDto, CancelOrderDto, RejectOrderDto } from './dto/delivery.dto';

@ApiTags('delivery-admin')
@ApiBearerAuth()
@Controller('delivery')
export class DeliveryAdminController {
  constructor(private readonly orders: DeliveryOrderService) {}

  private storeId(user: AuthUser) {
    if (!user.storeId) throw new BusinessError('STORE_REQUIRED');
    return user.storeId;
  }

  @Get('board')
  @RequirePerm('menu:delivery')
  board(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('paymentStatus') paymentStatus?: string,
  ) {
    return this.orders.adminList(this.storeId(user), {
      status,
      keyword,
      from,
      to,
      paymentStatus,
    });
  }

  /** 待接单外卖数量（菜单角标） */
  @Get('pending-count')
  @RequirePerm('menu:delivery')
  async pendingCount(@CurrentUser() user: AuthUser) {
    const count = await this.orders.countPendingAccept(this.storeId(user));
    return { count };
  }

  @Get('customers')
  @RequirePerm('menu:delivery')
  customers(@CurrentUser() user: AuthUser) {
    return this.orders.listCustomers(this.storeId(user));
  }

  @Post('orders/:id/accept')
  @RequirePerm('delivery:accept')
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.transition(this.storeId(user), id, OrderStatus.accepted, {
      userId: user.id,
    });
  }

  @Post('orders/:id/reject')
  @RequirePerm('delivery:accept')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RejectOrderDto) {
    return this.orders.transition(this.storeId(user), id, OrderStatus.rejected, {
      userId: user.id,
      reason: dto.reason,
    });
  }

  @Post('orders/:id/cooking')
  @RequirePerm('delivery:accept')
  cooking(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.transition(this.storeId(user), id, OrderStatus.cooking, {
      userId: user.id,
    });
  }

  @Post('orders/:id/delivering')
  @RequirePerm('delivery:accept')
  delivering(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.transition(this.storeId(user), id, OrderStatus.delivering, {
      userId: user.id,
    });
  }

  @Post('orders/:id/complete')
  @RequirePerm('delivery:accept')
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.transition(this.storeId(user), id, OrderStatus.completed, {
      userId: user.id,
    });
  }

  @Post('orders/:id/cancel')
  @RequirePerm('delivery:accept')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CancelOrderDto) {
    return this.orders.transition(this.storeId(user), id, OrderStatus.cancelled, {
      userId: user.id,
      reason: dto.reason,
    });
  }

  @Post('orders/:id/assign')
  @RequirePerm('delivery:accept')
  assign(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssignCourierDto) {
    return this.orders.assignCourier(this.storeId(user), id, dto.courierId, user.id);
  }

  @Delete('orders/:id')
  @RequirePerm('delivery:delete')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.adminDelete(this.storeId(user), id, user.id);
  }
}
