import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentCustomer, CustomerUser } from '../../common/decorators/customer.decorator';
import { CustomerAuthGuard } from '../../common/guards/customer-auth.guard';
import { MarketingService } from '../marketing/marketing.service';
import { AddressService } from './address.service';
import { CustomerAuthService } from './customer-auth.service';
import { DeliveryOrderService } from './delivery-order.service';
import { PlaceGroupMealOrderDto } from '../group-meal/dto/group-meal.dto';
import {
  AddressDto,
  CancelOrderDto,
  CustomerLoginDto,
  ForgotPasswordDto,
  PlaceOrderDto,
  QuoteDto,
  RegisterDto,
  SendCodeDto,
  UpdateCustomerProfileDto,
} from './dto/delivery.dto';

const STORE_ID = '1';

@ApiTags('delivery-customer')
@Controller()
export class CustomerController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly addresses: AddressService,
    private readonly orders: DeliveryOrderService,
    private readonly marketing: MarketingService,
  ) {}

  @Public()
  @Get('public/delivery/store')
  store() {
    return this.orders.getPublicStore(STORE_ID);
  }

  @Public()
  @Post('public/delivery/quote')
  quote(@Body() dto: QuoteDto) {
    return this.orders.quote(STORE_ID, dto);
  }

  @Public()
  @Post('public/delivery/auth/send-code')
  sendCode(@Body() dto: SendCodeDto) {
    return this.auth.sendCode(dto);
  }

  @Public()
  @Post('public/delivery/auth/register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('public/delivery/auth/login')
  login(@Body() dto: CustomerLoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('public/delivery/auth/forgot-password')
  forgot(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Get('public/delivery/me')
  me(@CurrentCustomer() c: CustomerUser) {
    return this.auth.me(c.customerId);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Patch('public/delivery/me')
  updateMe(@CurrentCustomer() c: CustomerUser, @Body() dto: UpdateCustomerProfileDto) {
    return this.auth.updateProfile(c.customerId, dto);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Post('public/delivery/me/cancel')
  cancelAccount(@CurrentCustomer() c: CustomerUser) {
    return this.auth.cancelAccount(c.customerId);
  }

  @Public()
  @Get('public/delivery/coupon-templates')
  couponTemplates() {
    return this.marketing.listPublicTemplates(STORE_ID);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Get('public/delivery/coupons')
  myCoupons(@CurrentCustomer() c: CustomerUser) {
    return this.marketing.myCoupons(c.customerId);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Post('public/delivery/coupons/claim')
  claimCoupon(@CurrentCustomer() c: CustomerUser, @Body() body: { templateId: string }) {
    return this.marketing.claimTemplate(STORE_ID, c.customerId, body.templateId);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Get('public/delivery/addresses')
  listAddr(@CurrentCustomer() c: CustomerUser) {
    return this.addresses.list(c.customerId);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Post('public/delivery/addresses')
  createAddr(@CurrentCustomer() c: CustomerUser, @Body() dto: AddressDto) {
    return this.addresses.create(c.customerId, dto);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Patch('public/delivery/addresses/:id')
  updateAddr(
    @CurrentCustomer() c: CustomerUser,
    @Param('id') id: string,
    @Body() dto: AddressDto,
  ) {
    return this.addresses.update(c.customerId, id, dto);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Delete('public/delivery/addresses/:id')
  delAddr(@CurrentCustomer() c: CustomerUser, @Param('id') id: string) {
    return this.addresses.remove(c.customerId, id);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Post('public/delivery/orders')
  place(@CurrentCustomer() c: CustomerUser, @Body() dto: PlaceOrderDto) {
    return this.orders.placeOrder(STORE_ID, c.customerId, dto);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Post('public/delivery/group-orders')
  placeGroup(@CurrentCustomer() c: CustomerUser, @Body() dto: PlaceGroupMealOrderDto) {
    return this.orders.placeGroupComboOrder(STORE_ID, c.customerId, dto);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Get('public/delivery/orders')
  myOrders(@CurrentCustomer() c: CustomerUser) {
    return this.orders.listMine(c.customerId);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Get('public/delivery/orders/:id')
  orderDetail(@CurrentCustomer() c: CustomerUser, @Param('id') id: string) {
    return this.orders.detailForCustomer(c.customerId, id);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Post('public/delivery/orders/:id/cancel')
  cancel(
    @CurrentCustomer() c: CustomerUser,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orders.cancelByCustomer(c.customerId, id, dto);
  }
}
