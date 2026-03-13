import { Body, Controller, Delete, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { UpdateAdminPlatformDto } from './dto/update-admin-platform.dto';
import { Role } from '@prisma/client';

class UpdateRoleDto {
  role: Role;
}

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── Users ────────────────────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'Listar todos os utilizadores' })
  getUsers() {
    return this.adminService.getUsers();
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Obter utilizador por ID' })
  getUser(@Param('id') id: string) {
    return this.adminService.getUser(id);
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Atualizar utilizador (role, isActive, name)' })
  updateUser(@Param('id') id: string, @Body() dto: UpdateAdminUserDto) {
    return this.adminService.updateUser(id, dto);
  }

  @Patch('users/:id/role')
  @ApiOperation({ summary: 'Atualizar role do utilizador' })
  updateUserRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.adminService.updateUser(id, { role: dto.role });
  }

  @Patch('users/:id/deactivate')
  @ApiOperation({ summary: 'Desativar utilizador' })
  deactivateUser(@Param('id') id: string) {
    return this.adminService.updateUser(id, { isActive: false });
  }

  @Patch('users/:id/activate')
  @ApiOperation({ summary: 'Ativar utilizador' })
  activateUser(@Param('id') id: string) {
    return this.adminService.updateUser(id, { isActive: true });
  }

  @Delete('users/:id')
  @ApiOperation({ summary: 'Eliminar utilizador' })
  deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  // ── Analytics ────────────────────────────────────────────────────────────

  @Get('analytics')
  @ApiOperation({ summary: 'Estatísticas gerais da plataforma' })
  getAnalytics() {
    return this.adminService.getAnalytics();
  }

  // ── Platforms ────────────────────────────────────────────────────────────

  @Get('platforms')
  @ApiOperation({ summary: 'Listar todas as plataformas' })
  getPlatforms() {
    return this.adminService.getPlatforms();
  }

  @Patch('platforms/:id')
  @ApiOperation({
    summary: 'Atualizar plataforma (isActive, isSearchEnabled, apiKey, ...)',
  })
  updatePlatform(@Param('id') id: string, @Body() dto: UpdateAdminPlatformDto) {
    return this.adminService.updatePlatform(id, dto);
  }
}
