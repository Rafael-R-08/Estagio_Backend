import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { SlManagerService } from './sl-manager.service';

interface AuthRequest extends Request {
  user: { userId: string; email: string; role: string };
}

@ApiTags('Service Line Manager')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sl-manager')
@Roles('SERVICE_LINE_MANAGER')
export class SlManagerController {
  constructor(private readonly slManagerService: SlManagerService) {}

  @Get('users')
  @ApiOperation({ summary: 'Get all users in the manager\'s service line' })
  @ApiOkResponse({ description: 'Array of users with id, name, email, serviceLine, completed trainings count, certificates count' })
  @ApiForbiddenResponse({ description: 'Forbidden for non SERVICE_LINE_MANAGER users' })
  getUsers(@Req() req: AuthRequest) {
    return this.slManagerService.getManagedUsers(req.user.userId);
  }

  @Get('users/:id/progress')
  @ApiOperation({ summary: 'Get learning progress of a specific user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiOkResponse({ description: 'User progress with trainings list and certificates list' })
  @ApiNotFoundResponse({ description: 'User does not exist' })
  @ApiForbiddenResponse({ description: 'User belongs to a different service line' })
  async getUserProgress(@Param('id') id: string, @Req() req: AuthRequest) {
    const managedLineId = await this.slManagerService.getManagerLineId(req.user.userId);
    return this.slManagerService.getUserProgress(managedLineId, id);
  }
}
