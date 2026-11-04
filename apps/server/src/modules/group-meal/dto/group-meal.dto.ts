import {
  ApiProperty,
  ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateGroupMealInquiryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  contactName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  company?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guestCount!: number;

  @ApiProperty({ description: '期望时间 ISO' })
  @IsDateString()
  preferAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  comboId?: string;

  @ApiPropertyOptional({ description: '预算越南盾整数' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  budget?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  remark?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  storeId?: string;
}

export class GroupMealInquiryQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['pending', 'confirmed', 'rejected', 'cancelled'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class UpdateGroupMealInquiryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['pending', 'confirmed', 'rejected', 'cancelled'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  adminRemark?: string;
}

export class GroupComboSelectionDto {
  @ApiProperty()
  @IsString()
  @MaxLength(32)
  groupId!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(0)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  dishIds!: string[];
}

export class PlaceGroupMealOrderDto {
  @ApiProperty()
  @IsString()
  @MaxLength(32)
  comboId!: string;

  @ApiProperty({ type: [GroupComboSelectionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GroupComboSelectionDto)
  selections!: GroupComboSelectionDto[];

  @ApiPropertyOptional({ description: '套餐份数，默认 1' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty?: number;

  @ApiProperty({ description: '用餐人数' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guestCount!: number;

  @ApiProperty()
  @IsString()
  @MaxLength(512)
  addressId!: string;

  @ApiProperty({ enum: ['cash', 'bank_transfer'] })
  @IsIn(['cash', 'bank_transfer'])
  payMethod!: 'cash' | 'bank_transfer';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  remark?: string;

  @ApiPropertyOptional({ description: '门店 ID' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  storeId?: string;
}
