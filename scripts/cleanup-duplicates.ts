import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

async function cleanup() {
  console.log('🧹 Cleaning up duplicates before applying unique constraints...');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const courseTableExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'Course'
      ) AS "exists"
    `;

    const chunkTableExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'text_chunks'
      ) AS "exists"
    `;

    // 1. Deduplicate Courses (externalId, platformId)
    console.log('[1/2] Deduplicating Courses...');
    if (!courseTableExists[0]?.exists) {
      console.log('ℹ️ Table "Course" does not exist yet. Skipping course deduplication.');
    }

    if (courseTableExists[0]?.exists) {
      const duplicateCourses = await prisma.$queryRaw<any[]>`
        SELECT "externalId", "platformId", count(*) 
        FROM "Course" 
        GROUP BY "externalId", "platformId" 
        HAVING count(*) > 1
      `;

      for (const dup of duplicateCourses) {
        const records = await prisma.course.findMany({
          where: { externalId: dup.externalId, platformId: dup.platformId },
          orderBy: { lastUpdated: 'desc' },
        });
        const idsToDelete = records.slice(1).map(r => r.id);
        await prisma.course.deleteMany({ where: { id: { in: idsToDelete } } });
        console.log(`🗑️ Deleted ${idsToDelete.length} duplicate courses for ${dup.externalId}`);
      }
    }

    // 2. Deduplicate TextChunks (source, sourceId)
    console.log('[2/2] Deduplicating TextChunks...');
    if (!chunkTableExists[0]?.exists) {
      console.log('ℹ️ Table "text_chunks" does not exist yet. Skipping chunk deduplication.');
    }

    if (chunkTableExists[0]?.exists) {
      const duplicateChunks = await prisma.$queryRaw<any[]>`
        SELECT "source", "sourceId", count(*) 
        FROM text_chunks
        GROUP BY "source", "sourceId" 
        HAVING count(*) > 1
      `;

      for (const dup of duplicateChunks) {
        const records = await prisma.textChunk.findMany({
          where: { source: dup.source, sourceId: dup.sourceId },
          orderBy: { createdAt: 'desc' },
        });
        const idsToDelete = records.slice(1).map(r => r.id);
        await prisma.textChunk.deleteMany({ where: { id: { in: idsToDelete } } });
        console.log(`🗑️ Deleted ${idsToDelete.length} duplicate chunks for ${dup.sourceId}`);
      }
    }

    console.log('✅ Cleanup complete!');
  } catch (err: any) {
    console.error('❌ Cleanup failed:', err.message);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

cleanup();
