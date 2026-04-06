import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CalendarService } from './calendar.service';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';

@ApiTags('Calendar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Post()
  @ApiOperation({ summary: 'Criar evento/lembrete no calendário' })
  create(@CurrentUser() userId: string, @Body() dto: CreateCalendarEventDto) {
    return this.calendarService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar os eventos do utilizador' })
  findAll(@CurrentUser() userId: string) {
    return this.calendarService.findAll(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter um evento pelo ID' })
  findOne(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.calendarService.findOne(id, userId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Atualizar evento (reprograma lembretes se a data mudar)',
  })
  update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCalendarEventDto,
  ) {
    return this.calendarService.update(id, userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar evento' })
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.calendarService.remove(id, userId);
  }
}
