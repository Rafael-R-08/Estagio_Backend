// src/ai/services/ai.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai.service';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../../cache/cache.service';

describe('AiService', () => {
  let service: AiService;
  let configService: ConfigService;
  let cacheService: CacheService;

  const mockConfigService = {
    get: jest.fn().mockReturnValue('fake-api-key'),
  };

  const mockCacheService = {
    get: jest.fn(),
    set: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
    configService = module.get<ConfigService>(ConfigService);
    cacheService = module.get<CacheService>(CacheService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should log error if API key is missing on init', () => {
    const loggerSpy = jest.spyOn((service as any).logger, 'error');
    mockConfigService.get.mockReturnValueOnce(null);
    service.onModuleInit();
    expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('GROQ_API_KEY não está definida'));
  });

  describe('generateText', () => {
    it('should return cached value if available', async () => {
      mockCacheService.get.mockResolvedValueOnce('cached-response');
      const result = await service.generateText('hello');
      expect(result).toBe('cached-response');
      expect(mockCacheService.get).toHaveBeenCalled();
    });

    it('should call groq if cache is empty', async () => {
      mockCacheService.get.mockResolvedValueOnce(null);
      
      // Mocking groq call is complex due to nested structure, 
      // but we can spy on withRetry or the groq client.
      const createSpy = jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'ai-response' } }],
        usage: { total_tokens: 10 }
      });
      (service as any).groq = {
        chat: { completions: { create: createSpy } }
      };

      const result = await service.generateText('hello', { noCache: true });
      expect(result).toBe('ai-response');
      expect(createSpy).toHaveBeenCalled();
    });
  });
});
