import {
  ApiProperty,
  ApiPropertyOptional } from '@nestjs/swagger';
import { IngredientKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateSupplierDto {
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
  @MaxLength(64)
  contactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(256)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  note?: string;
}

export class UpdateSupplierDto {
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
  @MaxLength(64)
  contactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(256)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateIngredientDto {
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

  @ApiPropertyOptional({ enum: IngredientKind })
  @IsOptional()
  @IsEnum(IngredientKind)
  kind?: IngredientKind;

  @ApiPropertyOptional({ default: 'kg' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stockQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  lastCost?: number;
}

export class UpdateIngredientDto {
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

  @ApiPropertyOptional({ enum: IngredientKind })
  @IsOptional()
  @IsEnum(IngredientKind)
  kind?: IngredientKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PurchaseItemDto {
  @ApiProperty()
  @IsString()
  @MaxLength(32)
  ingredientId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  qty!: number;

  @ApiProperty({ description: '单价越南盾整数' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;
}

export class CreatePurchaseDto {
  @ApiPropertyOptional({ description: '营业日 YYYY-MM-DD，默认今日营业日' })
  @IsOptional()
  @IsDateString()
  businessDate?: string;

  @ApiProperty({ description: '供应商 ID' })
  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  note?: string;

  @ApiProperty({ type: [PurchaseItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items!: PurchaseItemDto[];
}

export class StocktakeLineDto {
  @ApiProperty()
  @IsString()
  @MaxLength(32)
  ingredientId!: string;

  @ApiProperty({ description: '盘点实存数量' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  countedQty!: number;
}

export class CreateStocktakeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  businessDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  note?: string;

  @ApiProperty({ type: [StocktakeLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StocktakeLineDto)
  items!: StocktakeLineDto[];
}

export class DayQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  date?: string;
}
