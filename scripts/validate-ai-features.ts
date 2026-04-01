import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import Groq from 'groq-sdk';
import { pipeline } from '@xenova/transformers';

async function validate() {
  console.log('🔍 Validating AI Infrastructure...');
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const modelName = 'Xenova/all-MiniLM-L6-v2';

  try {
    // 1. Prisma Check
    console.log('--- [1/4] Checking DB Connection ---');
    await prisma.$connect();
    const count = await prisma.textChunk.count();
    console.log(`✅ Prisma connected. Total chunks: ${count}`);

    // 2. Groq Check
    console.log('--- [2/4] Checking Groq API ---');
    const chat = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'Health check' }],
      max_tokens: 5,
    });
    console.log(`✅ Groq Response: "${chat.choices[0].message.content}"`);

    // 3. Embedding Check
    console.log('--- [3/4] Checking Local Embeddings (Transformers.js) ---');
    const extractor = await pipeline('feature-extraction', modelName);
    const output = await extractor('Softinsa Learning Hub', { pooling: 'mean', normalize: true });
    console.log(`✅ Embedding generated: ${output.data.length} dimensions`);

    // 4. Vector Query Check
    console.log('--- [4/4] Checking Vector Search (Cosine Similarity) ---');
    if (count > 0) {
      const embeddingStr = `[${Array.from(output.data).join(',')}]`;
      const result = await prisma.$queryRawUnsafe<any[]>(`
        SELECT id, content, (embedding <=> $1::vector) as distance
        FROM text_chunks
        ORDER BY distance ASC
        LIMIT 1
      `, embeddingStr);
      console.log(`✅ Vector search OK. Nearest chunk ID: ${result[0]?.id || 'N/A'}`);
    } else {
      console.log('⚠️ Skipping vector search (Empty table)');
    }

    console.log('\n🌟 ALL AI INFRASTRUCTURE CHECKS PASSED!');
  } catch (err: any) {
    console.error('\n❌ VALIDATION FAILED!');
    console.error(err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

validate();
