import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { AiService } from './ai/ai.service';

import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly aiService: AiService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('ai/test')
  async testAi() {
    return await this.aiService.generateText('Olá, quem és tu?');
  }
}
