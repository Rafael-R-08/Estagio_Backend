import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CollectionsService } from './collections.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { AddCourseToCollectionDto } from './dto/add-course-to-collection.dto';

@ApiTags('Collections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Post()
  @ApiOperation({ summary: 'Criar uma nova coleção/playlist' })
  @ApiCreatedResponse({ description: 'Coleção criada' })
  create(@CurrentUser() userId: string, @Body() dto: CreateCollectionDto) {
    return this.collectionsService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar coleções do utilizador autenticado' })
  @ApiOkResponse({ description: 'Lista de coleções com contagem de cursos' })
  findAll(@CurrentUser() userId: string) {
    return this.collectionsService.findAll(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhes de uma coleção com cursos incluídos' })
  @ApiParam({ name: 'id', description: 'ID da coleção' })
  findOne(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.collectionsService.findOne(id, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Renomear / editar coleção' })
  @ApiParam({ name: 'id', description: 'ID da coleção' })
  update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCollectionDto,
  ) {
    return this.collectionsService.update(id, userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar coleção e os seus cursos' })
  @ApiParam({ name: 'id', description: 'ID da coleção' })
  @ApiNoContentResponse({ description: 'Coleção eliminada' })
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.collectionsService.remove(id, userId);
  }

  @Post(':id/courses')
  @ApiOperation({ summary: 'Adicionar curso à coleção' })
  @ApiParam({ name: 'id', description: 'ID da coleção' })
  @ApiCreatedResponse({ description: 'Curso adicionado à coleção' })
  addCourse(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() dto: AddCourseToCollectionDto,
  ) {
    return this.collectionsService.addCourse(id, userId, dto);
  }

  @Delete(':id/courses/:externalId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover curso da coleção' })
  @ApiParam({ name: 'id', description: 'ID da coleção' })
  @ApiParam({ name: 'externalId', description: 'ID externo do curso' })
  @ApiNoContentResponse({ description: 'Curso removido' })
  removeCourse(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Param('externalId') externalId: string,
  ) {
    return this.collectionsService.removeCourse(id, userId, externalId);
  }
}
