// src/ai/tests/rag.integration.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { RagService } from '../services/rag.service';
import { AiService } from '../services/ai.service';
import { EmbeddingService } from '../services/embedding.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConversationService } from '../services/conversation.service';
import { CourseDbService } from '../../search/course-db.service';
import { of } from 'rxjs';

jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn().mockResolvedValue(() => ({
    data: new Float32Array(384),
  })),
}));

describe('RagService (Integration)', () => {
  let service: RagService;
  let aiService: AiService;
  let embeddingService: EmbeddingService;
  let prismaService: PrismaService;

  const mockAiService = {
    generateText: jest.fn().mockResolvedValue('RAG answer'),
    generateStream: jest.fn().mockResolvedValue(of('Stream chunk 1', 'Stream chunk 2')),
  };

  const mockEmbeddingService = {
    searchSimilar: jest.fn().mockResolvedValue([
      { id: '1', content: 'chunk1', similarity: 0.9, source: 'RAG_KNOWLEDGE' }
    ]),
  };

  const mockPrismaService = {
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1', name: 'Test User' }) },
    userSettings: { findUnique: jest.fn().mockResolvedValue({ uiLanguage: 'pt' }) },
    textChunk: { count: jest.fn().mockResolvedValue(10) },
  };

  const mockConversationService = {
    getOrCreateConversation: jest.fn().mockResolvedValue({ id: 'conv-1' }),
    getContextMessages: jest.fn().mockResolvedValue([]),
    addMessage: jest.fn().mockResolvedValue({}),
  };

  const mockCourseDbService = {
    searchFromCache: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RagService,
        { provide: AiService, useValue: mockAiService },
        { provide: EmbeddingService, useValue: mockEmbeddingService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConversationService, useValue: mockConversationService },
        { provide: CourseDbService, useValue: mockCourseDbService },
      ],
    }).compile();

    service = module.get<RagService>(RagService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('query', () => {
    it('should perform a full RAG query and return the answer', async () => {
      const result = await service.query('Como funciona o Cloud?', { 
        generateOptions: { userId: 'user-1' } 
      });
      
      expect(result.answer).toBe('RAG answer');
      expect(mockEmbeddingService.searchSimilar).toHaveBeenCalled();
      expect(mockAiService.generateText).toHaveBeenCalled();
      expect(mockConversationService.addMessage).toHaveBeenCalledTimes(2); // User + Assistant
    });
  });

  describe('queryStream', () => {
    it('should return an observable and persist the full response', (done) => {
      service.queryStream('Como funciona o Cloud?', { 
        generateOptions: { userId: 'user-1' } 
      }).then(stream => {
        let fullAnswer = '';
        stream.subscribe({
          next: val => fullAnswer += val,
          complete: () => {
            expect(fullAnswer).toBe('Stream chunk 1Stream chunk 2');
            // Check persistence (async)
            setTimeout(() => {
                expect(mockConversationService.addMessage).toHaveBeenCalledWith('conv-1', 'assistant', 'Stream chunk 1Stream chunk 2');
                done();
            }, 100);
          }
        });
      });
    });
  });
});
