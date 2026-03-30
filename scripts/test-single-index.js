const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../src/app.module');
const { IndexingService } = require('../src/ai/services/indexing.service');
const { CourseCreatedEvent } = require('../src/ai/events/course-indexing.event');
const { ChunkSource } = require('@prisma/client');

async function testSingle() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const service = app.get(IndexingService);
  
  const event = new CourseCreatedEvent(
    'test-id',
    'Teste de Indexação',
    'Descrição de teste para validar o fluxo de embedding 3072.',
    'Test Platform',
    'Tech',
    'Beginner',
    ChunkSource.EXTERNAL_COURSE
  );
  
  console.log('Attempting to index single course...');
  try {
    const result = await service.indexCourse(event);
    console.log('Result:', result ? 'SUCCESS' : 'FAILURE');
  } catch (e) {
    console.error('CRITICAL ERROR:', e);
  }
  
  await app.close();
}

testSingle().catch(console.error);
