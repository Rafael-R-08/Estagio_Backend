import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { CourseResult } from '../src/search/interfaces/platform-adapter.interface';
import { isLikelyTrainingResult } from '../src/search/utils/training-result-filter.util';

const APPLY_FLAG = '--apply';
const applyChanges = process.argv.includes(APPLY_FLAG);

const BATCH_SIZE = 500;
const DELETE_CHUNK_SIZE = 200;
const PRESERVE_PLATFORM_KEYWORDS = ['internal', 'softinsa'];

type CourseRow = {
  id: string;
  externalId: string;
  title: string;
  description: string | null;
  url: string;
  instructor: string | null;
  rating: number | null;
  durationHours: number | null;
  level: 'beginner' | 'intermediate' | 'advanced' | null;
  tags: string[];
  platformId: string;
  platform: {
    name: string;
  };
};

function toCourseResult(row: CourseRow): CourseResult {
  return {
    externalId: row.externalId,
    title: row.title,
    description: row.description || '',
    url: row.url,
    instructor: row.instructor || undefined,
    rating: row.rating || undefined,
    durationHours: row.durationHours || undefined,
    level: row.level || undefined,
    tags: row.tags || [],
    platformId: row.platformId,
    platformName: row.platform.name,
  };
}

function shouldPreserveByPlatform(platformName: string): boolean {
  const lower = platformName.toLowerCase();
  return PRESERVE_PLATFORM_KEYWORDS.some((keyword) => lower.includes(keyword));
}

async function cleanupNonTrainingCourses() {
  console.log('🧹 Non-training course cleanup');
  console.log(`Mode: ${applyChanges ? 'APPLY (deletes rows)' : 'DRY RUN (no deletions)'}`);

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

    if (!courseTableExists[0]?.exists) {
      console.log('ℹ️ Table "Course" does not exist yet. Nothing to clean.');
      return;
    }

    const idsToDelete: string[] = [];
    const flaggedByPlatform = new Map<string, number>();
    const sampleRows: Array<{ platform: string; title: string; url: string }> = [];
    let scanned = 0;
    let cursor: string | undefined;

    while (true) {
      const rows = await prisma.course.findMany({
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
        include: {
          platform: {
            select: { name: true },
          },
        },
      });

      if (rows.length === 0) break;

      for (const row of rows as CourseRow[]) {
        scanned += 1;

        if (shouldPreserveByPlatform(row.platform.name)) {
          continue;
        }

        const looksLikeTraining = isLikelyTrainingResult(toCourseResult(row));
        if (!looksLikeTraining) {
          idsToDelete.push(row.id);
          const currentCount = flaggedByPlatform.get(row.platform.name) || 0;
          flaggedByPlatform.set(row.platform.name, currentCount + 1);

          if (sampleRows.length < 10) {
            sampleRows.push({
              platform: row.platform.name,
              title: row.title,
              url: row.url,
            });
          }
        }
      }

      cursor = rows[rows.length - 1]?.id;
    }

    console.log(`\n📊 Scanned rows: ${scanned}`);
    console.log(`🚩 Flagged as non-training: ${idsToDelete.length}`);

    if (flaggedByPlatform.size > 0) {
      console.log('\nBy platform:');
      for (const [platform, count] of flaggedByPlatform.entries()) {
        console.log(`- ${platform}: ${count}`);
      }
    }

    if (sampleRows.length > 0) {
      console.log('\nSample rows to remove:');
      for (const row of sampleRows) {
        console.log(`- [${row.platform}] ${row.title} -> ${row.url}`);
      }
    }

    if (!applyChanges) {
      console.log('\nℹ️ Dry-run complete. No rows were deleted.');
      console.log('Run with --apply to perform deletion.');
      return;
    }

    if (idsToDelete.length === 0) {
      console.log('✅ Nothing to delete.');
      return;
    }

    let deleted = 0;
    for (let i = 0; i < idsToDelete.length; i += DELETE_CHUNK_SIZE) {
      const chunk = idsToDelete.slice(i, i + DELETE_CHUNK_SIZE);
      const result = await prisma.course.deleteMany({
        where: {
          id: {
            in: chunk,
          },
        },
      });
      deleted += result.count;
    }

    console.log(`\n✅ Deleted rows: ${deleted}`);
  } catch (err: any) {
    console.error('❌ Non-training cleanup failed:', err.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void cleanupNonTrainingCourses();
