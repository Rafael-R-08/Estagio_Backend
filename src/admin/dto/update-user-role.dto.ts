import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { Role, ServiceLine } from '@prisma/client';

export class UpdateUserRoleDto {
  @ApiProperty({ enum: Role, description: 'Nova role do utilizador' })
  @IsEnum(Role)
  role: Role;

  @ApiProperty({
    enum: ServiceLine,
    required: false,
    description: 'Obrigatório quando role = SERVICE_LINE_MANAGER',
  })
  @IsOptional()
  @IsEnum(ServiceLine)
  managedLineId?: ServiceLine;
}
