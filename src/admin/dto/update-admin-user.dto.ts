import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { Role, ServiceLine } from '@prisma/client';

export class UpdateAdminUserDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false, enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  function?: string;

  @ApiProperty({ required: false, enum: ServiceLine })
  @IsOptional()
  @IsEnum(ServiceLine)
  serviceLine?: ServiceLine;

  @ApiProperty({ required: false, enum: ServiceLine })
  @IsOptional()
  @IsEnum(ServiceLine)
  managedLineId?: ServiceLine;
}
