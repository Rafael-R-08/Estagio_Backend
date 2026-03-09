import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete,
  UseGuards 
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBearerAuth 
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { CreateUserDto, UpdateUserDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Criar novo utilizador (Admin only)' })
  @ApiResponse({ status: 201, description: 'Utilizador criado com sucesso' })
  @ApiResponse({ status: 403, description: 'Sem permissões' })
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos os utilizadores' })
  @ApiResponse({ status: 200, description: 'Lista de utilizadores' })
  findAll() {
    return this.userService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter utilizador por ID' })
  @ApiResponse({ status: 200, description: 'Utilizador encontrado' })
  @ApiResponse({ status: 404, description: 'Utilizador não encontrado' })
  findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar utilizador' })
  @ApiResponse({ status: 200, description: 'Utilizador atualizado' })
  @ApiResponse({ status: 404, description: 'Utilizador não encontrado' })
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.userService.update(id, updateUserDto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Apagar utilizador (Admin only)' })
  @ApiResponse({ status: 200, description: 'Utilizador apagado' })
  @ApiResponse({ status: 403, description: 'Sem permissões' })
  @ApiResponse({ status: 404, description: 'Utilizador não encontrado' })
  remove(@Param('id') id: string) {
    return this.userService.remove(id);
  }
}
