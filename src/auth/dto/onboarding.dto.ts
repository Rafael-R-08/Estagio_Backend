import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { ServiceLine } from '@prisma/client';

export class OnboardingDto {
  @ApiProperty({ enum: ServiceLine })
  @IsNotEmpty()
  @IsEnum(ServiceLine)
  serviceLine: ServiceLine;
}
