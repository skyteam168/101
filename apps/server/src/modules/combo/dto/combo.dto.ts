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
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** 套餐分组子项 DTO */
export class ComboGroupItemDto {
  @ApiPropertyOptional({ description: '编辑时传 id，新增则不传' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ description: '菜品 ID' })
  @IsString()
  @IsNotEmpty()
  dishId!: string;

  @ApiPropertyOptional({ description: '加价，越南盾整数，默认 0' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  extraPrice?: number;

  @ApiPropertyOptional({ description: '是否默认选中' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;
}

/** 套餐分组 DTO */
export class ComboGroupDto {
  @ApiPropertyOptional({ description: '编辑时传 id，新增则不传' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  nameZh!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  nameVi!: string;

  @ApiPropertyOptional({ description: '最少选几项，默认 1' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minSelect?: number;

  @ApiPropertyOptional({ description: '最多选几项，默认 1' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxSelect?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;

  @ApiPropertyOptional({ type: [ComboGroupItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComboGroupItemDto)
  items?: ComboGroupItemDto[];
}

/** 创建套餐 DTO */
export class CreateComboDto {
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
  @MaxLength(512)
  image?: string;

  @ApiProperty({ description: '堂食价，越南盾整数' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price!: number;

  @ApiPropertyOptional({ description: '外带价，越南盾整数，默认与 price 相同' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  takeawayPrice?: number;

  @ApiPropertyOptional({ description: '状态 on/off', default: 'on' })
  @IsOptional()
  @IsIn(['on', 'off'])
  status?: string;

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

  @ApiPropertyOptional({ description: '是否团餐套餐' })
  @IsOptional()
  @IsBoolean()
  isGroupMeal?: boolean;

  @ApiPropertyOptional({ description: '建议用餐人数' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  servingSize?: number | null;

  @ApiPropertyOptional({ type: [ComboGroupDto], description: '套餐分组（嵌套提交）' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComboGroupDto)
  groups?: ComboGroupDto[];
}

/** 更新套餐 DTO（字段均可选） */
export class UpdateComboDto {
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
  descZh?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  descVi?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  image?: string;

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
  @IsIn(['on', 'off'])
  status?: string;

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

  @ApiPropertyOptional({ description: '是否团餐套餐' })
  @IsOptional()
  @IsBoolean()
  isGroupMeal?: boolean;

  @ApiPropertyOptional({ description: '建议用餐人数' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  servingSize?: number | null;

  @ApiPropertyOptional({ type: [ComboGroupDto], description: '整体替换分组（传则全量覆盖）' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComboGroupDto)
  groups?: ComboGroupDto[];
}

/** 套餐列表查询 DTO */
export class ComboQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['on', 'off'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '页码，默认 1' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: '每页数量，默认 20，最大 100' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

/** 下单时套餐分组选择 */
export class ComboGroupSelectionDto {
  @ApiProperty({ description: '分组 ID' })
  @IsString()
  @IsNotEmpty()
  groupId!: string;

  @ApiProperty({ description: '选中的菜品 ID 列表' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  dishIds!: string[];
}

/** 订单添加套餐 DTO */
export class AddComboItemDto {
  @ApiProperty({ description: '套餐 ID' })
  @IsString()
  @IsNotEmpty()
  comboId!: string;

  @ApiProperty({ type: [ComboGroupSelectionDto], description: '各分组选择明细' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ComboGroupSelectionDto)
  selections!: ComboGroupSelectionDto[];

  @ApiPropertyOptional({ description: '数量，默认 1' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  guestNickname?: string;
}
