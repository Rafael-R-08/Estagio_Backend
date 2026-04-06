import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateCalendarEventDto {
  @ApiProperty({ description: 'Título do evento' })
  @IsString()
  title: string;

  @ApiProperty({ required: false, description: 'Descrição opcional' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Data e hora do evento (ISO 8601)' })
  @IsDateString()
  eventDate: string;

  @ApiProperty({
    required: false,
    default: 30,
    description:
      'Minutos antes do evento para enviar o lembrete final (15–1440)',
  })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(1440)
  reminderMinutesBefore?: number;
}
