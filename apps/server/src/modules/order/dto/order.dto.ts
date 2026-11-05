import {
  ApiProperty,
  ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class OrderItemInputDto {
  @ApiProperty()
  @IsString()
  @MaxLength(32)
  dishId!: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty!: number;

  @ApiPropertyOptional({ description: '规格选项快照' })
  @IsOptional()
  optionsSnapshot?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  guestNickname?: string;
}

export class SubmitOrderDto {
  @ApiProperty({ description: '桌台 ID（堂食）' })
  @IsString()
  @MaxLength(32)
  tableId!: string;

  @ApiProperty({ type: [OrderItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items!: OrderItemInputDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  remark?: string;
}

/** 收银台外带开单（无桌台会话） */
export class TakeawaySubmitDto {
  @ApiProperty({ type: [OrderItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items!: OrderItemInputDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  remark?: string;
}

export class AddItemsDto {
  @ApiProperty({ type: [OrderItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items!: OrderItemInputDto[];
}

export class VoidItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason!: string;
}

export class CancelOrderDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  reason!: string;
}

export class DiscountDto {
  @ApiProperty({ description: '手动整单减免金额（VND 整数）' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  discount!: number;

  @ApiPropertyOptional({ description: '服务费（VND 整数）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  serviceCharge?: number;

  @ApiPropertyOptional({ description: '抹零（VND 整数）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  roundOff?: number;
}

export class TempItemDto {
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

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitPrice!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty?: number;
}

export class LineDiscountDto {
  @ApiPropertyOptional({ description: '行减免金额' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lineDiscount?: number;

  @ApiPropertyOptional({ description: '折扣百分比 0-100，与 lineDiscount 二选一优先 percent' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isGift?: boolean;
}

export class BindCustomerDto {
  @ApiPropertyOptional({ description: '传 null/空解绑' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  customerId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  couponId?: string | null;
}

export class PaymentLineDto {
  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiProperty({ description: '实付计入订单的金额（免单可为 0）' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amount!: number;

  @ApiPropertyOptional({ description: '现金实收' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  received?: number;
}

export class CheckoutDto {
  @ApiProperty({ type: [PaymentLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentLineDto)
  payments!: PaymentLineDto[];
}

/** 已收款退款（堂食已结账 / 外卖已完成） */
export class RefundDto {
  @ApiProperty({ description: '退款金额（VND 整数，正数，不超过剩余已付）' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @ApiProperty({ enum: PaymentMethod, description: '退回方式（当面现金 / 转账等）' })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiProperty({ description: '退款原因' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  reason!: string;
}

export class OrderQueryDto {
  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  tableCode?: string;

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

export class UpdateItemStatusDto {
  @ApiProperty({ enum: ['cooking', 'served'] })
  @IsIn(['cooking', 'served'])
  status!: 'cooking' | 'served';
}
