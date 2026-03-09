import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { chromium } from '@playwright/test';
import { PrismaService } from '../prisma/prisma.service';
import { ScrapeDto } from './dto';

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);

  constructor(private prisma: PrismaService) {}

  async scrapeAndSave(scrapeDto: ScrapeDto) {
    const { url, selectors, elements } = scrapeDto;

    try {
      this.logger.log(`Iniciando scraping de: ${url}`);

      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      const title = await page.title();

      const h1 = await page
        .$eval('h1', (el) => el.textContent?.trim() || null)
        .catch(() => null);

      const links = await page.$$eval('a', (as) =>
        as.slice(0, 50).map((a) => ({
          text: (a.textContent || '').trim(),
          href: (a as HTMLAnchorElement).href,
        })),
      );

      let customData: Record<string, any> = {};

      if (selectors) {
        const selectorArray = selectors.split(',').map((s) => s.trim());
        const selectorResults = await this.scrapeSelectors(page, selectorArray);
        customData = { ...customData, ...selectorResults };
      }

      if (elements && elements.length > 0) {
        const elementResults = await this.scrapeSelectors(page, elements);
        customData = { ...customData, ...elementResults };
      }

      await browser.close();

      const scrapedData = {
        title,
        h1,
        linksCount: links.length,
        links,
        customData,
        timestamp: new Date().toISOString(),
      };

      const savedData = await this.prisma.scrapedPage.create({
        data: {
          url,
          data: scrapedData,
        },
        select: {
          id: true,
          url: true,
          data: true,
          scrapedAt: true,
          error: true,
        },
      });

      this.logger.log(`Scraping concluído e salvo: ${savedData.id}`);

      return savedData;
    } catch (error: any) {
      this.logger.error(`Erro ao scrapar ${url}: ${error.message}`);

      await this.prisma.scrapedPage.create({
        data: {
          url,
          data: {},
          error: error.message,
        },
      });

      throw new BadRequestException(`Erro ao scrapar URL: ${error.message}`);
    }
  }

  async getBasicInfo(url: string) {
    try {
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      const title = await page.title();
      const h1 = await page
        .$eval('h1', (el) => el.textContent?.trim() || null)
        .catch(() => null);

      const links = await page.$$eval('a', (as) =>
        as.slice(0, 50).map((a) => ({
          text: (a.textContent || '').trim(),
          href: (a as HTMLAnchorElement).href,
        })),
      );

      await browser.close();

      return {
        title,
        h1,
        linksCount: links.length,
        links,
      };
    } catch (error: any) {
      this.logger.error(`Erro ao scrapar ${url}: ${error.message}`);
      throw new BadRequestException(`Erro ao scrapar URL: ${error.message}`);
    }
  }

  async getHistory(limit = 20) {
    return this.prisma.scrapedPage.findMany({
      take: limit,
      orderBy: { scrapedAt: 'desc' },
      select: {
        id: true,
        url: true,
        scrapedAt: true,
        error: true,
      },
    });
  }

  async getById(id: string) {
    const result = await this.prisma.scrapedPage.findUnique({
      where: { id },
    });

    if (!result) {
      throw new BadRequestException('Scraping não encontrado');
    }

    return result;
  }

  async delete(id: string) {
    await this.getById(id);

    await this.prisma.scrapedPage.delete({
      where: { id },
    });

    return { message: 'Scraping apagado com sucesso' };
  }

  private async scrapeSelectors(page: any, selectors: string[]) {
    const results: Record<string, any> = {};

    for (const selector of selectors) {
      try {
        const elements = await page.$$(selector);
        const texts = await Promise.all(
          elements.map((el: any) => el.textContent()),
        );
        results[selector] = texts
          .map((t) => t?.trim())
          .filter((t) => t && t.length > 0);
      } catch {
        results[selector] = null;
      }
    }

    return results;
  }
}
