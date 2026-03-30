const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../src/app.module');
const { IndexingSeedService } = require('../src/ai/services/indexing-seed.service');

async function trigger() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const seedService = app.get(IndexingSeedService);
  
  console.log('Triggering manual seed from existing data...');
  await seedService.seedFromExistingData();
  
  console.log('Seed complete. Checking count...');
  const { PrismaService } = require('../src/prisma/prisma.service');
  const prisma = app.get(PrismaService);
  const count = await prisma.textChunk.count();
  console.log('Final count:', count);
  
  await app.close();
}

trigger().catch(console.error);
