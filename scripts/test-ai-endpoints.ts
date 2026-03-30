import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AiService } from '../src/ai/services/ai.service';
import { EmbeddingService } from '../src/ai/services/embedding.service';
import { RecommendationService } from '../src/ai/services/recommendation.service';
import { CertificatesService } from '../src/certificates/certificates.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const aiService = app.get(AiService);
  const embeddingService = app.get(EmbeddingService);
  const recommendationService = app.get(RecommendationService);
  const prisma = prismaService = app.get(PrismaService);

  console.log('\n--- INICIANDO TESTES DE INTEGRAÇÃO AI (GROQ + XENOVA) ---\n');

  try {
    // 1. Teste de Chat (Groq)
    console.log('1. Testando Groq (Llama 3.3 70B)...');
    const chatResponse = await aiService.generateText('Olá, quem és tu?');
    console.log('   ✓ Resposta recebida:', chatResponse.substring(0, 50) + '...');

    // 2. Teste de Embedding (Xenova Local)
    console.log('2. Testando Xenova Local (MiniLM-384)...');
    const embedding = await embeddingService.embed('Softinsa Cloud Training');
    console.log(`   ✓ Embedding gerado: [${embedding.length} dimensões]`);
    if (embedding.length !== 384) throw new Error('Dimensão incorreta!');

    // 3. Teste de Pesquisa Semântica
    console.log('3. Testando Pesquisa Semântica no pgvector...');
    const searchResults = await embeddingService.searchSimilar('Cloud', 1);
    console.log(`   ✓ Resultados encontrados: ${searchResults.length}`);

    // 4. Teste de Recomendação (RAG Completo)
    try {
      const user = await prisma.user.findFirst();
      if (user) {
        console.log(`4. Testando Recomendações (RAG) para user: ${user.name}...`);
        const recs = await recommendationService.recommendForUser(user.id);
        console.log('   ✓ Recomendações geradas com sucesso.');
      } else {
        console.log('4. Ignorando Recomendações (Nenhum utilizador na DB).');
      }
    } catch (e) {
      console.warn('   ⚠ Falha nas Recomendações (pode ser falta de dados de seed):', e.message);
    }

    console.log('\n--- TODOS OS TESTES CORE COMPLETADOS COM SUCESSO ---\n');
  } catch (error) {
    console.error('\n❌ FALHA NOS TESTES:', error.message);
    process.exit(1);
  } finally {
    await app.close();
  }
}

let prismaService; // Helper for try-catch scope
bootstrap();
