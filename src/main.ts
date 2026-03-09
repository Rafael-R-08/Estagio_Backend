import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Servir ficheiros locais (fallback quando Azure não está configurado)
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  app.enableCors();
  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('LearningHub API')
    .setDescription('API Documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  app.enableShutdownHooks();

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
