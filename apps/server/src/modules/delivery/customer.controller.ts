import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { memoryStorage } from 'multer';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentCustomer, CustomerUser } from '../../common/decorators/customer.decorator';
import { BusinessError } from '../../common/errors/business.error';
import { CustomerAuthGuard } from '../../common/guards/customer-auth.guard';
import { getClientMeta } from '../../common/utils/client-ip.util';
import { STORAGE_DRIVER, StorageDriver } from '../../storage/storage.interface';
import { MarketingService } from '../marketing/marketing.service';
import { JoinMemberDto } from '../member/dto/member.dto';
import { MemberService } from '../member/member.service';
import { AddressService } from './address.service';
import { CustomerAuthService } from './customer-auth.service';
import { DeliveryOrderService } from './delivery-order.service';
import { PlaceGroupMealOrderDto } from '../group-meal/dto/group-meal.dto';
import {
  AddressDto,
  CancelOrderDto,
  ChangePasswordDto,
  CustomerLoginDto,
  ForgotPasswordDto,
  GoogleLoginDto,
  LoginByCodeDto,
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
    private readonly members: MemberService,
    private readonly jwt: JwtService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  private async optionalCustomerId(authorization?: string) {
    if (!authorization?.startsWith('Bearer ')) return undefined;
    try {
      const payload = await this.jwt.verifyAsync<{ typ?: string; sub?: string }>(
        authorization.slice(7),
      );
      if (payload.typ !== 'customer' || !payload.sub) return undefined;
      return String(payload.sub);
    } catch {
      return undefined;
    }
  }

  @Public()
  @Get('public/delivery/store')
  store() {
    return this.orders.getPublicStore(STORE_ID);
  }

  @Public()
  @Post('public/delivery/quote')
  async quote(@Headers('authorization') authorization: string | undefined, @Body() dto: QuoteDto) {
    const customerId = await this.optionalCustomerId(authorization);
    return this.orders.quote(STORE_ID, dto, customerId);
  }

  @Public()
  @Get('public/member/benefits')
  memberBenefits() {
    return this.members.listBenefits(STORE_ID);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Get('public/member/me')
  myMembership(@CurrentCustomer() c: CustomerUser) {
    return this.members.membershipOf(c.customerId);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Post('public/member/join')
  joinMember(@CurrentCustomer() c: CustomerUser, @Body() dto: JoinMemberDto) {
    return this.members.join(c.customerId, dto);
  }

  @Public()
  @Post('public/delivery/auth/send-code')
  sendCode(@Body() dto: SendCodeDto) {
    return this.auth.sendCode(dto);
  }

  @Public()
  @Post('public/delivery/auth/register')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, getClientMeta(req));
  }

  @Public()
  @Post('public/delivery/auth/login')
  login(@Body() dto: CustomerLoginDto, @Req() req: Request) {
    return this.auth.login(dto, getClientMeta(req));
  }

  @Public()
  @Post('public/delivery/auth/login-code')
  loginByCode(@Body() dto: LoginByCodeDto, @Req() req: Request) {
    return this.auth.loginByCode(dto, getClientMeta(req));
  }

  @Public()
  @Post('public/delivery/auth/google')
  loginGoogle(@Body() dto: GoogleLoginDto, @Req() req: Request) {
    return this.auth.loginWithGoogle(dto, getClientMeta(req));
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Post('public/delivery/auth/logout')
  logout(@CurrentCustomer() c: CustomerUser, @Req() req: Request) {
    return this.auth.logout(c.customerId, getClientMeta(req));
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Post('public/delivery/auth/change-password')
  changePassword(
    @CurrentCustomer() c: CustomerUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    return this.auth.changePassword(c.customerId, dto, getClientMeta(req));
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

  /** 顾客上传头像 / 门牌照等图片 */
  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Post('public/delivery/upload')
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
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BusinessError('UPLOAD_FILE_REQUIRED');
    return this.storage.upload(file, 'customer');
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
