/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaClient, Role, TrainingStatus, ServiceLine } from '@prisma/client';
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
  console.log('🚀 Iniciando seed...');

  const platforms = await Promise.all([
    prisma.learningPlatform.upsert({
      where: { name: 'Udemy' },
      update: {},
      create: {
        name: 'Udemy',
        type: 'Tech',
        enabled: true,
        searchEnabled: true,
        config: {},
      },
    }),
    prisma.learningPlatform.upsert({
      where: { name: 'Microsoft Learn' },
      update: {},
      create: {
        name: 'Microsoft Learn',
        type: 'Cloud',
        enabled: true,
        searchEnabled: true,
        config: {},
      },
    }),
    prisma.learningPlatform.upsert({
      where: { name: 'IBM SkillsBuild' },
      update: {},
      create: {
        name: 'IBM SkillsBuild',
        type: 'General',
        enabled: true,
        searchEnabled: true,
        config: {},
      },
    }),
    prisma.learningPlatform.upsert({
      where: { name: 'Academia Portugal Digital' },
      update: {},
      create: {
        name: 'Academia Portugal Digital',
        type: 'Public',
        enabled: true,
        searchEnabled: true,
        config: {},
      },
    }),
    prisma.learningPlatform.upsert({
      where: { name: 'Trailhead' },
      update: {},
      create: {
        name: 'Trailhead',
        type: 'Salesforce',
        enabled: true,
        searchEnabled: true,
        config: {},
      },
    }),
    prisma.learningPlatform.upsert({
      where: { name: 'Softinsa Everyday Learning' },
      update: {},
      create: {
        name: 'Softinsa Everyday Learning',
        type: 'Internal',
        enabled: true,
        searchEnabled: true,
        config: {},
      },
    }),
  ]);

  const udemy = platforms[0];
  const msLearn = platforms[1];

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
      { userId: user.id, skillName: 'React', level: 'intermedio' },
      { userId: user.id, skillName: 'TypeScript', level: 'experiente' },
    ]
  });

  // 0) Utilizador para testar Onboarding (vazio)
  await prisma.user.upsert({
    where: { email: 'newuser@example.com' },
    update: { onboardingDone: false },
    create: {
      email: 'newuser@example.com',
      passwordHash: userHash,
      name: 'New User',
      role: Role.USER,
      onboardingDone: false,
    }
  });

  await prisma.user.upsert({
    where: { email: 'onboarding-test@example.com' },
    update: { onboardingDone: false },
    create: {
      email: 'onboarding-test@example.com',
      passwordHash: userHash,
      name: 'Onboard Tester',
      role: Role.USER,
      onboardingDone: false,
    }
  });

  // 1) Concluída
  const t1 = await prisma.trainingRecord.create({
    data: {
      userId: user.id,
      platformId: udemy.id,
      title: 'Node.js Best Practices',
      url: 'https://www.udemy.com/course/nodejs-best-practices/',
      status: TrainingStatus.completed,
      rating: 5,
      relevance: 5,
      notes: 'Conceitos fundamentais de arquitetura limpa.',
      startedAt: new Date('2025-11-01'),
      completedAt: new Date('2025-12-15'),
    },
  });

  await prisma.trainingDocument.create({
    data: {
      trainingId: t1.id,
      fileUrl: 'https://example.com/notes.pdf',
      fileName: 'Apontamentos_NodeJS.pdf',
    }
  });

  // 2) Em Progresso
  const t2 = await prisma.trainingRecord.create({
    data: {
      userId: user.id,
      platformId: msLearn.id,
      title: 'Introduction to Azure Cloud Services',
      url: 'https://learn.microsoft.com/azure/intro',
      status: TrainingStatus.ongoing,
      progressLevel: 'Em evolução',
      startedAt: new Date('2026-01-10'),
      notes: 'Focar na parte de IAM.',
    },
  });
  
  await prisma.trainingDocument.create({
    data: {
      trainingId: t2.id,
      fileUrl: 'https://example.com/azure-iam.docx',
      fileName: 'Azure_IAM_Notes.docx',
    }
  });

  // 3) Guardada
  await prisma.trainingRecord.create({
    data: {
      userId: user.id,
      platformId: udemy.id,
      title: 'Advanced PostgreSQL',
      url: 'https://www.udemy.com/course/postgres-advanced/',
      status: TrainingStatus.priority,
      priorityOrder: 1,
    },
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
