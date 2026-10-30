import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AnnounceSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  dineInNew?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  addItem?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  deliveryNew?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  callWaiter?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requestBill?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  orderCancel?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  printFailed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  reservationNew?: boolean;
}

export class UpdateStoreSettingsDto {
  @ApiPropertyOptional({ enum: ['zh', 'vi'] })
  @IsOptional()
  @IsIn(['zh', 'vi'])
  announceLang?: 'zh' | 'vi';

  @ApiPropertyOptional({ type: AnnounceSettingsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AnnounceSettingsDto)
  announceSettings?: AnnounceSettingsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  qrOrderNeedConfirm?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  qrAutoOpen?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  qrRequirePin?: boolean;

  @ApiPropertyOptional({ description: '厨房单一菜一切' })
  @IsOptional()
  @IsBoolean()
  printSplitItem?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  nameZh?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  nameVi?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  deliveryRadiusKm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  deliveryFeeRules?: { maxKm: number; fee: number }[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  businessHours?: { open: string; close: string; days: number[] };

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  bankTransferQr?: string | null;

  @ApiPropertyOptional({ description: '营业日切日小时 0-23（Asia/Ho_Chi_Minh）' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  businessDayCutHour?: number;

  @ApiPropertyOptional({ description: '邮件 SMTP 配置' })
  @IsOptional()
  @IsObject()
  mailSettings?: {
    enabled?: boolean;
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    pass?: string;
    from?: string;
  };

  @ApiPropertyOptional({
    description: 'H5 首页 Banner：[{ image, link?, titleZh?, titleVi? }]',
  })
  @IsOptional()
  @IsArray()
  homeBanners?: {
    image: string;
    link?: string;
    titleZh?: string;
    titleVi?: string;
  }[];
}

export class PushMessageDto {
  @ApiPropertyOptional({ description: '收件人邮箱列表；空则需传 customerIds' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emails?: string[];

  @ApiPropertyOptional({ description: '会员 ID 列表' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customerIds?: string[];

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;
}
