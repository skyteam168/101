import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  OpsExpenseType,
  PartnerCapitalCategory,
  PartnerCapitalEntryType,
  PartnerCapitalRefType,
  PartnerStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class OpsExpenseQueryDto {
  @ApiPropertyOptional({ description: 'YYYY-MM' })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  yearMonth?: string;

  @ApiPropertyOptional({ enum: OpsExpenseType })
  @IsOptional()
  @IsEnum(OpsExpenseType)
  type?: OpsExpenseType;
}

export class CreateOpsExpenseDto {
  @ApiProperty({ description: 'YYYY-MM' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(7)
  yearMonth!: string;

  @ApiProperty({ enum: OpsExpenseType })
  @IsEnum(OpsExpenseType)
  type!: OpsExpenseType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  quantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  unit?: string;

  @ApiProperty({ description: '金额（越南盾整数）' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  remark?: string;
}

export class UpdateOpsExpenseDto extends PartialType(CreateOpsExpenseDto) {}

export class PartnerQueryDto {
  @ApiPropertyOptional({ enum: PartnerStatus })
  @IsOptional()
  @IsEnum(PartnerStatus)
  status?: PartnerStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;
}

export class CreatePartnerDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  idNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ description: '万分比 0–10000（10000=100%）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  sharePercent?: number;

  @ApiPropertyOptional({ enum: PartnerStatus })
  @IsOptional()
  @IsEnum(PartnerStatus)
  status?: PartnerStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  remark?: string;

  /** 创建时一并登记期初出资（越南盾整数） */
  @ApiPropertyOptional({ description: '期初出资金额（越南盾整数）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  initialCapital?: number;

  @ApiPropertyOptional({ description: '期初出资日 YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  initialCapitalDate?: string;

  @ApiPropertyOptional({ enum: PartnerCapitalCategory })
  @IsOptional()
  @IsEnum(PartnerCapitalCategory)
  initialCapitalCategory?: PartnerCapitalCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  initialCapitalNote?: string;
}

export class UpdatePartnerDto extends PartialType(CreatePartnerDto) {}

export class CapitalEntryQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  partnerId?: string;
}

export class CreateCapitalEntryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  partnerId!: string;

  @ApiProperty({ description: '出资日 YYYY-MM-DD' })
  @IsDateString()
  entryDate!: string;

  @ApiProperty({ enum: PartnerCapitalEntryType })
  @IsEnum(PartnerCapitalEntryType)
  type!: PartnerCapitalEntryType;

  @ApiProperty({ description: '金额（越南盾整数，正数）' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @ApiPropertyOptional({ enum: PartnerCapitalCategory })
  @IsOptional()
  @IsEnum(PartnerCapitalCategory)
  category?: PartnerCapitalCategory;

  @ApiPropertyOptional({ enum: PartnerCapitalRefType })
  @IsOptional()
  @IsEnum(PartnerCapitalRefType)
  refType?: PartnerCapitalRefType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  note?: string;
}

export class UpdateCapitalEntryDto extends PartialType(CreateCapitalEntryDto) {}

export class SettlementQueryDto {
  @ApiPropertyOptional({ description: 'YYYY-MM' })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  yearMonth?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  partnerId?: string;
}

export class CreateSettlementDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  partnerId!: string;

  @ApiProperty({ description: '结算日 YYYY-MM-DD' })
  @IsDateString()
  settleDate!: string;

  @ApiPropertyOptional({ description: '归属月 YYYY-MM；默认取 settleDate 年月' })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  yearMonth?: string;

  @ApiProperty({ description: '金额（越南盾整数）' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  note?: string;
}

export class UpdateSettlementDto extends PartialType(CreateSettlementDto) {}
