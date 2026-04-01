/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaClient, Role, TrainingStatus, ServiceLine, CourseLevel } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('❌ DATABASE_URL não definida no .env');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🚀 Iniciando seed profissional (Correção ExternalId & Normalização)...');

  const platforms = await Promise.all([
    prisma.learningPlatform.upsert({
      where: { name: 'Udemy' },
      update: {},
      create: { name: 'Udemy', type: 'Tech', enabled: true, searchEnabled: true, config: {} },
    }),
    prisma.learningPlatform.upsert({
      where: { name: 'Microsoft Learn' },
      update: {},
      create: { name: 'Microsoft Learn', type: 'Cloud', enabled: true, searchEnabled: true, config: {} },
    }),
    prisma.learningPlatform.upsert({
      where: { name: 'Internal' },
      update: {},
      create: { name: 'Internal', type: 'Internal', enabled: true, searchEnabled: true, config: {} },
    }),
  ]);

  const udemy = platforms[0];
  const msLearn = platforms[1];
  const internal = platforms[2];

  const userHash = await bcrypt.hash('password123', 10);
  const user = await prisma.user.upsert({
    where: { email: 'user@example.com' },
    update: {},
    create: {
      email: 'user@example.com',
      passwordHash: userHash,
      name: 'User Example',
      role: Role.USER,
      serviceLine: ServiceLine.HYBRID_CLOUD,
      onboardingDone: true,
      experienceLevel: 'intermedio',
      interests: ['Cloud', 'DevOps', 'Backend'],
      userFunction: 'Full Stack Developer',
    }
  });

  // Skills
  await prisma.userSkill.deleteMany({ where: { userId: user.id } });
  await prisma.userSkill.createMany({
    data: [
      { userId: user.id, skillName: 'Node.js', level: 'experiente' },
      { userId: user.id, skillName: 'TypeScript', level: 'experiente' },
    ]
  });

  // Seed Courses with External IDs (Normalização)
  console.log('📦 Seeding Courses for Indexing...');
  const course1 = await prisma.course.upsert({
    where: { id: 'seed-course-1' }, 
    update: {},
    create: {
      id: 'seed-course-1',
      externalId: 'udemy-node-best-practices',
      platformId: udemy.id,
      title: 'Node.js Best Practices 2026',
      description: 'Advanced patterns for enterprise applications.',
      url: 'https://udemy.com/node-best-practices',
      level: CourseLevel.advanced,
      tags: ['Nodejs', 'Architecture', 'Backend'],
      rating: 4.8,
    }
  });

  // Criar TrainingRecord correspondente para compatibilidade com testes de PDF/Background
  await prisma.trainingRecord.upsert({
    where: { id: 'seed-training-1' },
    update: {},
    create: {
      id: 'seed-training-1',
      userId: user.id,
      platformId: udemy.id,
      title: 'Node.js Best Practices 2026',
      url: 'https://udemy.com/node-best-practices',
      status: TrainingStatus.completed,
    }
  });

  await prisma.course.upsert({
    where: { id: 'seed-course-2' },
    update: {},
    create: {
      id: 'seed-course-2',
      externalId: 'ms-azure-fundamentals',
      platformId: msLearn.id,
      title: 'Azure Fundamentals AZ-900',
      description: 'Cloud concepts, Azure services, and workloads.',
      url: 'https://learn.microsoft.com/az-900',
      level: CourseLevel.beginner,
      tags: ['Azure', 'Cloud', 'Infrastructure'],
      rating: 4.9,
    }
  });

  await prisma.course.upsert({
    where: { id: 'seed-course-3' },
    update: {},
    create: {
      id: 'seed-course-3',
      externalId: 'internal-softinsa-onboarding',
      platformId: internal.id,
      title: 'Softinsa Hybrid Cloud Onboarding',
      description: 'Internal guide for new joiners in the Hybrid Cloud SL.',
      url: 'https://learning.softinsa.com/onboarding',
      level: CourseLevel.intermediate,
      tags: ['Softinsa', 'Internal', 'Cloud'],
      rating: 5.0,
    }
  });

  console.log('✅ Seed concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Seed falhou:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
