import {
  ApiProperty,
  ApiPropertyOptional } from '@nestjs/swagger';
import { AssetEventType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateAssetCategoryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  nameZh!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  nameVi!: string;

  @ApiPropertyOptional({ default: 36 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  depreciationMonths?: number;
}

export class UpdateAssetCategoryDto {
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
  @Type(() => Number)
  @IsInt()
  @Min(1)
  depreciationMonths?: number;
}

export class AssetQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  location?: string;

  /** in_use | idle | repair | disposed */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;
}

export class CreateAssetDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  nameZh!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  nameVi!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  spec?: string;

  @ApiPropertyOptional({ default: '个' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  supplier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @ApiProperty({ description: '单价（越南盾整数）' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @ApiPropertyOptional({ description: '初始入库数量，默认 0' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  qty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  warrantyMonths?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  warrantyUntil?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  photo?: string;
}

export class UpdateAssetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

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
  spec?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  location?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  supplier?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  purchaseDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  warrantyUntil?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  photo?: string | null;
}

/** 入库 / 领用 / 送修 / 修好 / 报废 / 变卖 共用数量字段 */
export class AssetEventQtyDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  happenedAt?: string;

  /** 领用/送修/报废/变卖：来源池 in_use | idle | repair */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fromPool?: 'in_use' | 'idle' | 'repair';

  @ApiPropertyOptional({ description: '变卖收入 / 维修费（越南盾）' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  toLocation?: string;
}

export class TransferAssetDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  toLocation!: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  qty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  happenedAt?: string;
}

export class CheckAssetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  actualInUse?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  actualIdle?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  actualRepair?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  happenedAt?: string;
}

export class ImportAssetRowDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  categoryNameZh!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  nameZh!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(512)
  nameVi!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  spec?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  supplier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  purchaseDate?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  qty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  warrantyMonths?: number;
}

export { AssetEventType };
