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
import { STORAGE_DRIVER, StorageDriver } from '../../storage/storage.interface';
import { ChatService } from './chat.service';
import { SendChatMessageDto, TranslateChatDto } from './dto/chat.dto';

class ChatMessagesQuery {
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

const STORE_ID = '1';

@ApiTags('chat-customer')
@Controller()
export class ChatCustomerController {
  constructor(
    private readonly chat: ChatService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Get('public/delivery/chat')
  async getConversation(@CurrentCustomer() c: CustomerUser) {
    return this.chat.getOrCreateForCustomer(STORE_ID, c.customerId);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Get('public/delivery/chat/messages')
  async messages(@CurrentCustomer() c: CustomerUser, @Query() query: ChatMessagesQuery) {
    const conv = await this.chat.getOrCreateForCustomer(STORE_ID, c.customerId);
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
  async send(@CurrentCustomer() c: CustomerUser, @Body() dto: SendChatMessageDto) {
    return this.chat.sendFromCustomer(STORE_ID, c.customerId, dto);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Post('public/delivery/chat/read')
  async read(@CurrentCustomer() c: CustomerUser) {
    return this.chat.markReadByCustomer(STORE_ID, c.customerId);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Post('public/delivery/chat/translate')
  async translate(@CurrentCustomer() c: CustomerUser, @Body() dto: TranslateChatDto) {
    return this.chat.translate(STORE_ID, dto, { customerId: c.customerId });
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
