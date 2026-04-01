import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MicrosoftLearnAdapter } from './adapters/microsoft-learn.adapter';
import { UdemyAdapter } from './adapters/udemy.adapter';
import { IbmSkillsBuildAdapter } from './adapters/ibm-skillsbuild.adapter';
import { AcademiaPortugalDigitalAdapter } from './adapters/academia-portugal-digital.adapter';
import { TrailheadAdapter } from './adapters/trailhead.adapter';
import { SoftinsaEverydayLearningAdapter } from './adapters/softinsa-el.adapter';
import { IPlatformAdapter } from './interfaces/platform-adapter.interface';

@Injectable()
export class PlatformRegistry implements OnModuleInit {
  private readonly logger = new Logger(PlatformRegistry.name);
  private readonly adapters = new Map<string, IPlatformAdapter>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly msLearn: MicrosoftLearnAdapter,
    private readonly udemy: UdemyAdapter,
    private readonly ibm: IbmSkillsBuildAdapter,
    private readonly academia: AcademiaPortugalDigitalAdapter,
    private readonly trailhead: TrailheadAdapter,
    private readonly softinsa: SoftinsaEverydayLearningAdapter,
  ) {}

  async onModuleInit() {
    this.register(this.msLearn);
    this.register(this.udemy);
    this.register(this.ibm);
    this.register(this.academia);
    this.register(this.trailhead);
    this.register(this.softinsa);
    
    this.logger.log(`Registados ${this.adapters.size} adaptadores de plataforma.`);
  }

  private register(adapter: IPlatformAdapter) {
    this.adapters.set(adapter.platformName, adapter);
  }

  /**
   * Retorna os adaptadores ativos com as configurações carregadas da DB
   */
  async getActiveAdapters(): Promise<IPlatformAdapter[]> {
    const platforms = await this.prisma.learningPlatform.findMany({
      where: { enabled: true, searchEnabled: true },
    });

    const activeAdapters: IPlatformAdapter[] = [];

    for (const p of platforms) {
      const adapter = this.adapters.get(p.name);
      if (adapter) {
        // Atualizar config dinâmica da base class se necessário.
        // Como o adapter é Singleton, passamos as configs da DB para o adapter.
        (adapter as any).platform = {
           id: p.id,
           name: p.name,
           type: p.type,
           apiEndpoint: p.apiEndpoint,
           apiKeyRequired: p.apiKeyRequired,
           config: p.config || {},
        };
        activeAdapters.push(adapter);
      }
    }

    return activeAdapters;
  }

  getByName(name: string): IPlatformAdapter | undefined {
    return this.adapters.get(name);
  }
}
