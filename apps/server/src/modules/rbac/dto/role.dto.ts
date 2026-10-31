import {
  ApiProperty,
  ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'supervisor' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z][a-z0-9_]*$/)
  code!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  nameZh!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  nameVi!: string;
}

export class UpdateRoleDto {
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
}

export class SetRolePermissionsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  permissionIds!: string[];
}

export class SetUserRolesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  roleIds!: string[];
}
