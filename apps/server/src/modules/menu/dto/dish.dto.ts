import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class DishOptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  groupNameZh!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  groupNameVi!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  optionNameZh!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  optionNameVi!: string;

  @ApiPropertyOptional({ description: '加价，越南盾整数' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  extraPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  multi?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;
}

export class CreateDishDto {
  @ApiProperty()
  @IsString()
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
  descZh?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  descVi?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image?: string;

  @ApiProperty({ description: '堂食价，越南盾整数' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price!: number;

  @ApiProperty({ description: '外卖价，越南盾整数' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  takeawayPrice!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ enum: ['on', 'off'] })
  @IsOptional()
  @IsIn(['on', 'off'])
  status?: 'on' | 'off';

  @ApiPropertyOptional({ description: 'NULL 表示不限库存' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  dailyStock?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDineIn?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDelivery?: boolean;

  @ApiPropertyOptional({ description: '首页新品推荐' })
  @IsOptional()
  @IsBoolean()
  isNew?: boolean;

  @ApiPropertyOptional({ type: [DishOptionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DishOptionDto)
  options?: DishOptionDto[];
}

export class UpdateDishDto {
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
  descZh?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  descVi?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  takeawayPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ enum: ['on', 'off'] })
  @IsOptional()
  @IsIn(['on', 'off'])
  status?: 'on' | 'off';

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  dailyStock?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDineIn?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDelivery?: boolean;

  @ApiPropertyOptional({ description: '首页新品推荐' })
  @IsOptional()
  @IsBoolean()
  isNew?: boolean;

  @ApiPropertyOptional({ type: [DishOptionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DishOptionDto)
  options?: DishOptionDto[];
}

export class BatchStatusDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids!: string[];

  @ApiProperty({ enum: ['on', 'off'] })
  @IsIn(['on', 'off'])
  status!: 'on' | 'off';
}

export class BatchPriceDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  takeawayPrice?: number;
}

export class BatchSoldOutDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids!: string[];
}

export class DishQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ enum: ['on', 'off'] })
  @IsOptional()
  @IsIn(['on', 'off'])
  status?: 'on' | 'off';
}
