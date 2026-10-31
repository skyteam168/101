import {
  ApiProperty,
  ApiPropertyOptional } from '@nestjs/swagger';
import { ReservationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

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
