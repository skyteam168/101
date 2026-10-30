import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class SendCodeDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ enum: ['zh', 'vi'] })
  @IsOptional()
  @IsIn(['zh', 'vi'])
  lang?: 'zh' | 'vi';
}

export class RegisterDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @ApiPropertyOptional({ enum: ['zh', 'vi'] })
  @IsOptional()
  @IsIn(['zh', 'vi'])
  lang?: 'zh' | 'vi';
}

export class CustomerLoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  password!: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  newPassword!: string;
}

export class UpdateCustomerProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ enum: ['zh', 'vi'] })
  @IsOptional()
  @IsIn(['zh', 'vi'])
  lang?: 'zh' | 'vi';

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  birthday?: string;
}

export class AddressDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  contactName!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(32)
  phone!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(512)
  addressText!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  detail?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  lat!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  lng!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class OrderItemDto {
  @ApiProperty()
  @IsString()
  dishId!: string;

  @ApiProperty()
  @Type(() => Number)
  @Min(1)
  qty!: number;

  @ApiPropertyOptional()
  @IsOptional()
  optionsSnapshot?: unknown;
}

export class PlaceOrderDto {
  @ApiProperty()
  @IsString()
  addressId!: string;

  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @ApiProperty({ enum: ['cash', 'bank_transfer', 'momo', 'vnpay'] })
  @IsIn(['cash', 'bank_transfer', 'momo', 'vnpay'])
  payMethod!: 'cash' | 'bank_transfer' | 'momo' | 'vnpay';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  remark?: string;

  @ApiPropertyOptional({ description: '优惠券 ID' })
  @IsOptional()
  @IsString()
  couponId?: string;
}

export class QuoteDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  lat!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  lng!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subtotal?: number;
}

export class RejectOrderDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  reason!: string;
}

export class AssignCourierDto {
  @ApiProperty()
  @IsString()
  courierId!: string;
}

export class CancelOrderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}
