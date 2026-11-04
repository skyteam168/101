import {
  ApiProperty,
  ApiPropertyOptional } from '@nestjs/swagger';
import { ReservationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** 预定预点菜行 */
export class ReservationItemInputDto {
  @ApiPropertyOptional({ description: '菜品 ID；有则入座时转入订单' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  dishId?: string;

  @ApiPropertyOptional({ description: '缺 dishId 时必填中文名' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  nameZh?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  nameVi?: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  qty!: number;

  @ApiPropertyOptional({ description: '缺 dishId 时单价（VND）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  optionsSnapshot?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;
}

/** 创建预定 DTO */
export class CreateReservationDto {
  @ApiProperty({ description: '顾客姓名' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  customerName!: string;

  @ApiProperty({ description: '联系电话' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phone!: string;

  @ApiProperty({ description: '用餐人数', minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guestCount!: number;

  @ApiProperty({ description: '预定时间（ISO8601）', example: '2026-10-30T19:00:00+07:00' })
  @IsDateString()
  reserveAt!: string;

  @ApiPropertyOptional({ description: '预定桌台 ID' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  tableId?: string;

  @ApiPropertyOptional({ description: '预定区域 ID' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  areaId?: string;

  @ApiPropertyOptional({ description: '关联会员 ID' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  customerId?: string;

  @ApiPropertyOptional({ description: '定金（越南盾整数）', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  deposit?: number;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  remark?: string;

  @ApiPropertyOptional({ type: [ReservationItemInputDto], description: '预点菜' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ReservationItemInputDto)
  items?: ReservationItemInputDto[];
}

/** 更新预定 DTO */
export class UpdateReservationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  customerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guestCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  reserveAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  tableId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  areaId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  deposit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  remark?: string;

  @ApiPropertyOptional({ type: [ReservationItemInputDto], description: '整表替换预点菜；传空数组清空' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ReservationItemInputDto)
  items?: ReservationItemInputDto[];
}

/** 预定列表查询 DTO */
export class ReservationQueryDto {
  @ApiPropertyOptional({ description: '按日期筛选（YYYY-MM-DD）' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  date?: string;

  @ApiPropertyOptional({ enum: ReservationStatus })
  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;

  @ApiPropertyOptional({ description: '关键词（姓名/电话）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

/** 入座 DTO */
export class SeatReservationDto {
  @ApiPropertyOptional({ description: '入座桌台 ID（可覆盖预定桌台）' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  tableId?: string;

  @ApiPropertyOptional({ description: '实际用餐人数' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guestCount?: number;
}

/** 取消预定 DTO */
export class CancelReservationDto {
  @ApiPropertyOptional({ description: '取消原因' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}

/** H5 按手机号查询自己的预定 */
export class PublicReservationLookupQuery {
  @ApiPropertyOptional({ description: '门店 ID' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  storeId?: string;

  @ApiProperty({ description: '预定时填写的手机号' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phone!: string;
}

/** H5 顾客自助取消 */
export class PublicCancelReservationDto {
  @ApiProperty({ description: '预定手机号（核验）' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phone!: string;

  @ApiPropertyOptional({ description: '取消原因' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}

/** H5 顾客自助修改（手机号核验，不可改手机号本身） */
export class PublicUpdateReservationDto {
  @ApiProperty({ description: '预定手机号（核验）' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  customerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guestCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  reserveAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  remark?: string;

  @ApiPropertyOptional({ type: [ReservationItemInputDto], description: '整表替换预点菜；传空数组清空' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ReservationItemInputDto)
  items?: ReservationItemInputDto[];
}
