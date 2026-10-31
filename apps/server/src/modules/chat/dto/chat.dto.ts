import {
  ApiProperty,
  ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SendChatMessageDto {
  @ApiProperty({ enum: ['text', 'image'] })
  @IsIn(['text', 'image'])
  contentType!: 'text' | 'image';

  @ApiProperty({ description: '文本内容或图片 URL' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content!: string;
}

export class TranslateChatDto {
  @ApiPropertyOptional({ description: '待译文本；传 messageId 时可省略，用消息原文' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;

  @ApiPropertyOptional({
    description: '消息 ID：优先读库内译文缓存，译完后写回，避免重复消耗 token',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  messageId?: string;

  @ApiProperty({ enum: ['zh', 'vi', 'en'], description: '目标语言：中/越/英' })
  @IsIn(['zh', 'vi', 'en'])
  targetLang!: 'zh' | 'vi' | 'en';

  @ApiPropertyOptional({ enum: ['zh', 'vi', 'en'], description: '源语言，可省略由模型判断' })
  @IsOptional()
  @IsIn(['zh', 'vi', 'en'])
  sourceLang?: 'zh' | 'vi' | 'en';
}

export class StaffReplyDto extends SendChatMessageDto {}
