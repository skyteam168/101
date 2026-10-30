import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentGuest, GuestUser } from '../../common/decorators/guest.decorator';
import { GuestAuthGuard } from '../../common/guards/guest-auth.guard';
import { AddCartItemsDto, PatchCartItemDto } from './dto/public-table.dto';
import { PublicTableService } from './public-table.service';

@ApiTags('public-table-session')
@ApiBearerAuth()
@Public()
@UseGuards(GuestAuthGuard)
@Controller('public/table/session')
export class PublicSessionController {
  constructor(private readonly service: PublicTableService) {}

  @Get('state')
  state(@CurrentGuest() guest: GuestUser) {
    return this.service.sessionState(guest);
  }

  @Get('cart')
  cart(@CurrentGuest() guest: GuestUser) {
    return this.service.getCart(guest.sessionId);
  }

  @Post('cart/items')
  addItems(@CurrentGuest() guest: GuestUser, @Body() dto: AddCartItemsDto) {
    return this.service.addCartItems(guest, dto);
  }

  @Patch('cart/items/:itemId')
  patchItem(
    @CurrentGuest() guest: GuestUser,
    @Param('itemId') itemId: string,
    @Body() dto: PatchCartItemDto,
  ) {
    return this.service.patchCartItem(guest, itemId, dto);
  }

  @Delete('cart/items/:itemId')
  removeItem(@CurrentGuest() guest: GuestUser, @Param('itemId') itemId: string) {
    return this.service.removeCartItem(guest, itemId);
  }

  @Delete('cart/mine')
  clearMine(@CurrentGuest() guest: GuestUser) {
    return this.service.clearMyCart(guest);
  }

  @Post('submit')
  submit(@CurrentGuest() guest: GuestUser) {
    return this.service.submitCart(guest);
  }

  @Post('call-waiter')
  callWaiter(@CurrentGuest() guest: GuestUser) {
    return this.service.callWaiter(guest);
  }

  @Post('request-bill')
  requestBill(@CurrentGuest() guest: GuestUser) {
    return this.service.requestBill(guest);
  }
}
