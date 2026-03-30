import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { IndexingSeedService } from '../src/ai/services/indexing-seed.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const seedService = app.get(IndexingSeedService);
  
  console.log('Starting re-indexing seed...');
  await seedService.seedFromExistingData();
  console.log('Re-indexing seed completed.');
  
  await app.close();
}

bootstrap();
