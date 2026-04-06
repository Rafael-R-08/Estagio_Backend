import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { UpdateAdminPlatformDto } from './dto/update-admin-platform.dto';
import { CreateAdminPlatformDto } from './dto/create-admin-platform.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';

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
  updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserDto,
    @CurrentUser() requesterId: string,
  ) {
    return this.adminService.updateUser(id, dto, requesterId);
  }

  @Patch('users/:id/role')
  @ApiOperation({ summary: 'Atualizar role do utilizador (USER | ADMIN | SERVICE_LINE_MANAGER)' })
  updateUserRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() requesterId: string,
  ) {
    return this.adminService.updateUser(id, { role: dto.role, managedLineId: dto.managedLineId }, requesterId);
  }

  @Patch('users/:id/deactivate')
  @ApiOperation({ summary: 'Desativar utilizador' })
  deactivateUser(@Param('id') id: string, @CurrentUser() requesterId: string) {
    return this.adminService.updateUser(id, { isActive: false }, requesterId);
  }

  @Patch('users/:id/activate')
  @ApiOperation({ summary: 'Ativar utilizador' })
  activateUser(@Param('id') id: string, @CurrentUser() requesterId: string) {
    return this.adminService.updateUser(id, { isActive: true }, requesterId);
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

  @Post('platforms')
  @ApiOperation({ summary: 'Adicionar nova plataforma externa' })
  createPlatform(@Body() dto: CreateAdminPlatformDto) {
    return this.adminService.createPlatform(dto);
  }

  @Patch('platforms/:id')
  @ApiOperation({
    summary: 'Atualizar plataforma (isActive, isSearchEnabled, apiKey, apiEndpoint, config, ...)',
  })
  updatePlatform(@Param('id') id: string, @Body() dto: UpdateAdminPlatformDto) {
    return this.adminService.updatePlatform(id, dto);
  }
}
