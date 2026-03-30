import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { RagService } from '../src/ai/services/rag.service';
import { RecommendationService } from '../src/ai/services/recommendation.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const ragService = app.get(RagService);
  const recommendationService = app.get(RecommendationService);
  const prisma = app.get(PrismaService);

  console.log('🚀 Final Deep Validation of IA (Llama 3.3)...');

  const users = await prisma.user.findMany({ 
    take: 5, 
    include: { settings: true } 
  });
  
  if (users.length === 0) {
    console.error('❌ No users found.');
    await app.close();
    return;
  }

  const userEN = users.find(u => u.settings?.uiLanguage === 'en') || users[0];

  console.log(`\n### SCENARIO: Language Mix & RAG Quality ###`);
  const mixedQuery = "Quais são as principais competências de IA?";
  const mixedResult: any = await ragService.query(mixedQuery, { 
    generateOptions: { userId: userEN.id } 
  });
  
  console.log(`Query (PT): ${mixedQuery}`);
  console.log(`Lang preference: ${userEN.settings?.uiLanguage}`);
  console.log(`Response Snippet: ${mixedResult.answer.substring(0, 100)}...`);
  console.log(`RAG Quality (avgSimilarity): ${mixedResult.qualityScore.toFixed(4)}`);
  console.log(`Sources: ${mixedResult.sources.length}`);

  console.log(`\n### SCENARIO: Empty Context (General Knowledge) ###`);
  const irrelevantQuery = "Como cozinhar arroz na Softinsa?";
  const emptyRes: any = await ragService.query(irrelevantQuery, { topK: 1 });
  console.log(`Query: ${irrelevantQuery}`);
  console.log(`Sources (>0.65): ${emptyRes.sources.length}`);
  console.log(`AI General Response: ${emptyRes.answer.substring(0, 100)}...`);

  console.log(`\n### SCENARIO: New / Clean User Recommendations ###`);
  const cleanUser = await prisma.user.create({
    data: {
      email: `clean_${Date.now()}@test.com`,
      passwordHash: 'fake',
      name: 'Clean User',
      settings: { create: { uiLanguage: 'pt' } }
    }
  });

  try {
    const recs: any = await recommendationService.recommendForUser(cleanUser.id);
    console.log(`✅ Recommendations generated: ${Object.keys(recs).length > 0 ? 'YES' : 'NO'}`);
    if (recs.improvement) console.log('✅ improvement key found');
  } catch (err) {
    console.error(`❌ Fail: ${err.message}`);
  } finally {
    await prisma.user.delete({ where: { id: cleanUser.id } });
  }

  console.log('\n🚀 Validation Report Finished Successfully.');
  await app.close();
}

bootstrap();
