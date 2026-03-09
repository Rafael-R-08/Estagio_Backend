import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ScraperService } from './scraper.service';
import { ScrapeDto } from './dto';
import { ScrapedData } from './entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Scraper')
@ApiBearerAuth()
@Controller('scraper')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

  @Post('scrape')
  @ApiOperation({ summary: 'Scrapar URL e guardar na BD' })
  @ApiResponse({
    status: 201,
    description: 'Scraping realizado com sucesso',
    type: ScrapedData,
  })
  @ApiResponse({ status: 400, description: 'URL inválida ou erro no scraping' })
  async scrape(@Body() scrapeDto: ScrapeDto) {
    return this.scraperService.scrapeAndSave(scrapeDto);
  }

  @Get('basic')
  @ApiOperation({ summary: 'Scraping básico (não guarda na BD)' })
  @ApiQuery({ name: 'url', example: 'https://example.com' })
  @ApiResponse({ status: 200, description: 'Dados scrapados' })
  async getBasic(@Query('url') url: string) {
    return this.scraperService.getBasicInfo(url);
  }

  @Get('history')
  @ApiOperation({ summary: 'Ver histórico de scraping' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiResponse({ status: 200, description: 'Lista de scraping realizados' })
  async getHistory(@Query('limit') limit?: number) {
    return this.scraperService.getHistory(limit ? +limit : 20);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter scraping por ID' })
  @ApiResponse({ status: 200, description: 'Dados do scraping' })
  @ApiResponse({ status: 404, description: 'Scraping não encontrado' })
  async getById(@Param('id') id: string) {
    return this.scraperService.getById(id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Apagar scraping (Admin only)' })
  @ApiResponse({ status: 200, description: 'Scraping apagado' })
  @ApiResponse({ status: 403, description: 'Sem permissões' })
  async delete(@Param('id') id: string) {
    return this.scraperService.delete(id);
  }
}
