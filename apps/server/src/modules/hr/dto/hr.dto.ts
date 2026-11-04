import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmployeeStatus, EmploymentType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class EmployeeQueryDto {
  @ApiPropertyOptional({ enum: EmployeeStatus })
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @ApiPropertyOptional({ enum: EmploymentType })
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;
}

export class CreateEmployeeDto {
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
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ enum: EmploymentType })
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @ApiPropertyOptional({ description: '长工月薪 / 兼职时薪（VND）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  baseSalary?: number;

  @ApiProperty({ description: '入职日 YYYY-MM-DD' })
  @IsDateString()
  hiredAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  remark?: string;
}

export class UpdateEmployeeDto {
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
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ enum: EmploymentType })
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @ApiPropertyOptional({ enum: EmployeeStatus })
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  baseSalary?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  hiredAt?: string;

  @ApiPropertyOptional({ description: '离职日；清空传空字符串' })
  @IsOptional()
  @IsString()
  resignedAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  userId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  remark?: string;
}

export class AttendanceQueryDto {
  @ApiPropertyOptional({ description: 'YYYY-MM' })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  month?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  employeeId?: string;
}

export class CreateAttendanceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  employeeId!: string;

  @ApiProperty({ description: '上班时间 ISO' })
  @IsDateString()
  clockInAt!: string;

  @ApiPropertyOptional({ description: '下班时间 ISO' })
  @IsOptional()
  @IsDateString()
  clockOutAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;
}

export class UpdateAttendanceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  clockInAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  clockOutAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;
}

export class RunPayrollDto {
  @ApiProperty({ description: 'YYYY-MM', example: '2026-11' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(7)
  yearMonth!: string;
}
