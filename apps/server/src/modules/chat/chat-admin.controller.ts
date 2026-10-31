import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { BusinessError } from '../../common/errors/business.error';
import { STORAGE_DRIVER, StorageDriver } from '../../storage/storage.interface';
import { AuthUser } from '../auth/auth.types';
import { ChatService } from './chat.service';
import { StaffReplyDto, TranslateChatDto } from './dto/chat.dto';

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

@ApiTags('chat-admin')
@ApiBearerAuth()
@Controller('chat')
export class ChatAdminController {
  constructor(
    private readonly chat: ChatService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  private storeId(user: AuthUser) {
    if (!user.storeId) throw new BusinessError('STORE_REQUIRED');
    return user.storeId;
  }

  @Get('conversations')
  @RequirePerm('menu:chat')
  list(@CurrentUser() user: AuthUser) {
    return this.chat.listConversations(this.storeId(user));
  }

  /** 顾客消息未读总数（菜单角标） */
  @Get('unread-count')
  @RequirePerm('menu:chat')
  async unreadCount(@CurrentUser() user: AuthUser) {
    const count = await this.chat.countStaffUnread(this.storeId(user));
    return { count };
  }

  @Get('conversations/:id/messages')
  @RequirePerm('menu:chat')
  messages(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: ChatMessagesQuery,
  ) {
    return this.chat.listMessages(id, {
      storeId: this.storeId(user),
      beforeId: query.beforeId,
      limit: query.limit,
    });
  }

  @Post('conversations/:id/messages')
  @RequirePerm('chat:reply')
  reply(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: StaffReplyDto,
  ) {
    return this.chat.sendFromStaff(this.storeId(user), id, user.id, dto);
  }

  @Post('conversations/:id/read')
  @RequirePerm('menu:chat')
  read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.chat.markReadByStaff(this.storeId(user), id);
  }

  @Post('translate')
  @RequirePerm('menu:chat')
  translate(@CurrentUser() user: AuthUser, @Body() dto: TranslateChatDto) {
    return this.chat.translate(this.storeId(user), dto);
  }

  @Post('upload')
  @RequirePerm('chat:reply')
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
