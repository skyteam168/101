import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { memoryStorage } from 'multer';
import { CurrentCustomer, CustomerUser } from '../../common/decorators/customer.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { BusinessError } from '../../common/errors/business.error';
import { CustomerAuthGuard } from '../../common/guards/customer-auth.guard';
import { resolvePublicStoreId } from '../../common/public-store.util';
import { STORAGE_DRIVER, StorageDriver } from '../../storage/storage.interface';
import { ChatService } from './chat.service';
import { SendChatMessageDto, TranslateChatDto } from './dto/chat.dto';

class ChatMessagesQuery {
  /** 多门店 H5 会带 storeId；须白名单，否则 ValidationPipe forbidNonWhitelisted 报错 */
  @IsOptional()
  @IsString()
  storeId?: string;

  @IsOptional()
  @IsString()
  beforeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

@ApiTags('chat-customer')
@Controller()
export class ChatCustomerController {
  constructor(
    private readonly chat: ChatService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  private storeId(explicit?: string) {
    return resolvePublicStoreId(explicit);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Get('public/delivery/chat')
  async getConversation(
    @CurrentCustomer() c: CustomerUser,
    @Query('storeId') storeId?: string,
  ) {
    return this.chat.getOrCreateForCustomer(this.storeId(storeId), c.customerId);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Get('public/delivery/chat/messages')
  async messages(
    @CurrentCustomer() c: CustomerUser,
    @Query() query: ChatMessagesQuery,
    @Query('storeId') storeId?: string,
  ) {
    const conv = await this.chat.getOrCreateForCustomer(this.storeId(storeId), c.customerId);
    return this.chat.listMessages(conv.id, {
      customerId: c.customerId,
      beforeId: query.beforeId,
      limit: query.limit,
    });
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Post('public/delivery/chat/messages')
  async send(
    @CurrentCustomer() c: CustomerUser,
    @Body() dto: SendChatMessageDto,
    @Query('storeId') storeId?: string,
  ) {
    return this.chat.sendFromCustomer(this.storeId(storeId), c.customerId, dto);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Post('public/delivery/chat/read')
  async read(@CurrentCustomer() c: CustomerUser, @Query('storeId') storeId?: string) {
    return this.chat.markReadByCustomer(this.storeId(storeId), c.customerId);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Post('public/delivery/chat/translate')
  async translate(
    @CurrentCustomer() c: CustomerUser,
    @Body() dto: TranslateChatDto,
    @Query('storeId') storeId?: string,
  ) {
    return this.chat.translate(this.storeId(storeId), dto, { customerId: c.customerId });
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Post('public/delivery/chat/upload')
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
    return this.storage.upload(file, 'chat');
  }
}
