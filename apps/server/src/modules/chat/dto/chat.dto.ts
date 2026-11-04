import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

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
  @ApiProperty({
    description: '消息 ID（必填）：只译会话内对端消息，禁止裸文本蹭翻译',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  messageId!: string;

  @ApiProperty({ enum: ['zh', 'vi', 'en'], description: '目标语言：中/越/英' })
  @IsIn(['zh', 'vi', 'en'])
  targetLang!: 'zh' | 'vi' | 'en';

  @ApiPropertyOptional({ enum: ['zh', 'vi', 'en'], description: '源语言，可省略由模型判断' })
  @IsOptional()
  @IsIn(['zh', 'vi', 'en'])
  sourceLang?: 'zh' | 'vi' | 'en';
}

export class StaffReplyDto extends SendChatMessageDto {}

export class MuteChatDto {
  @ApiPropertyOptional({ description: '禁言小时数，默认 168（7 天），上限 720' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(720)
  hours?: number;
}
