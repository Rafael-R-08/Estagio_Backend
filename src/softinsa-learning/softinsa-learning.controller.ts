import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { SoftinsaLearningService } from './softinsa-learning.service';
import { CreateSoftinsaLearningDto } from './dto/create-softinsa-learning.dto';
import { UpdateSoftinsaLearningDto } from './dto/update-softinsa-learning.dto';

@ApiTags('softinsa-learning')
@ApiBearerAuth()
@Controller('softinsa-learning')
export class SoftinsaLearningController {
  constructor(private readonly learningService: SoftinsaLearningService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todas as formações internas Softinsa' })
  @ApiQuery({ name: 'department', required: false })
  @ApiQuery({ name: 'mandatory', required: false, type: Boolean })
  findAll(
    @Query('department') department?: string,
    @Query('mandatory') mandatory?: string,
  ) {
    const isMandatory =
      mandatory === 'true' ? true : mandatory === 'false' ? false : undefined;
    return this.learningService.findAll(department, isMandatory);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter formação interna por ID' })
  findOne(@Param('id') id: string) {
    return this.learningService.findOne(id);
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Criar nova formação interna (ADMIN)' })
  create(@Body() dto: CreateSoftinsaLearningDto) {
    return this.learningService.create(dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Atualizar formação interna (ADMIN)' })
  update(@Param('id') id: string, @Body() dto: UpdateSoftinsaLearningDto) {
    return this.learningService.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Eliminar formação interna (ADMIN)' })
  remove(@Param('id') id: string) {
    return this.learningService.remove(id);
  }
}
