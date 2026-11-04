import {
  ApiProperty,
  ApiPropertyOptional } from '@nestjs/swagger';
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

  /** register=注册 | login=验证码登录 | reset=重置密码 */
  @ApiPropertyOptional({ enum: ['register', 'login', 'reset'] })
  @IsOptional()
  @IsIn(['register', 'login', 'reset'])
  purpose?: 'register' | 'login' | 'reset';
}

export class RegisterDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;

  @ApiProperty({ description: '8–64 位，须含字母和数字' })
  @IsString()
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)[\x21-\x7E]{8,64}$/, {
    message: 'PASSWORD_TOO_WEAK',
  })
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @ApiPropertyOptional({ description: '越南手机号' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ enum: ['zh', 'vi'] })
  @IsOptional()
  @IsIn(['zh', 'vi'])
  lang?: 'zh' | 'vi';

  @ApiPropertyOptional({ description: 'Cloudflare Turnstile token' })
  @IsOptional()
  @IsString()
  @MaxLength(8192)
  cfTurnstileToken?: string;
}

export class CustomerLoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  password!: string;

  @ApiPropertyOptional({ description: 'Cloudflare Turnstile token' })
  @IsOptional()
  @IsString()
  @MaxLength(8192)
  cfTurnstileToken?: string;
}

export class LoginByCodeDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;

  @ApiPropertyOptional({ description: 'Cloudflare Turnstile token' })
  @IsOptional()
  @IsString()
  @MaxLength(8192)
  cfTurnstileToken?: string;
}

export class GoogleLoginDto {
  @ApiProperty({ description: 'Google Identity Services ID Token' })
  @IsString()
  @MaxLength(4096)
  @MinLength(20)
  idToken!: string;

  @ApiPropertyOptional({ enum: ['zh', 'vi'] })
  @IsOptional()
  @IsIn(['zh', 'vi'])
  lang?: 'zh' | 'vi';
}

export class ChangePasswordDto {
  @ApiPropertyOptional({ description: '已有密码时必填；纯 Google 账号首次设密可空' })
  @IsOptional()
  @IsString()
  oldPassword?: string;

  @ApiProperty({ description: '8–64 位，须含字母和数字' })
  @IsString()
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)[\x21-\x7E]{8,64}$/, {
    message: 'PASSWORD_TOO_WEAK',
  })
  newPassword!: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;

  @ApiProperty({ description: '8–64 位，须含字母和数字' })
  @IsString()
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)[\x21-\x7E]{8,64}$/, {
    message: 'PASSWORD_TOO_WEAK',
  })
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

  @ApiPropertyOptional({ description: '头像 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatar?: string | null;

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

  @ApiPropertyOptional({ description: '大门/门牌参照照片 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  landmarkPhoto?: string | null;

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
  @MaxLength(32)
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
  @MaxLength(512)
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
  @MaxLength(32)
  couponId?: string;

  @ApiPropertyOptional({ description: '门店 ID（多店公开下单）' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  storeId?: string;
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

  @ApiPropertyOptional({ description: '优惠券 ID，预估价时计入折扣' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  couponId?: string;

  @ApiPropertyOptional({ description: '门店 ID' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  storeId?: string;
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
  @MaxLength(32)
  courierId!: string;
}

export class CancelOrderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}
