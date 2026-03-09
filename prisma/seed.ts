import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaClient, Role, TrainingStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('❌ DATABASE_URL não definida no .env');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

// -------------------------------------------------------------
// SEED
// -------------------------------------------------------------
async function main() {
  console.log('🚀 Iniciando seed...');

  // -------------------------------------------------------------
  // 1) Criar plataformas (Udemy, Microsoft Learn, Trailhead)
  // -------------------------------------------------------------
  const platforms = await Promise.all([
    prisma.learningPlatform.upsert({
      where: { name: 'Udemy' },
      update: {},
      create: {
        name: 'Udemy',
        type: 'Tech',
        apiKeyRequired: false,
        enabled: true,
        searchEnabled: true,
        config: {}
      }
    }),

    prisma.learningPlatform.upsert({
      where: { name: 'Microsoft Learn' },
      update: {},
      create: {
        name: 'Microsoft Learn',
        type: 'Cloud',
        apiKeyRequired: false,
        enabled: true,
        searchEnabled: true,
        config: {}
      }
    }),

    prisma.learningPlatform.upsert({
      where: { name: 'Trailhead' },
      update: {},
      create: {
        name: 'Trailhead',
        type: 'CRM',
        apiKeyRequired: false,
        enabled: true,
        searchEnabled: true,
        config: {}
      }
    }),

    prisma.learningPlatform.upsert({
      where: { name: 'Academia Portugal Digital' },
      update: {},
      create: {
        name: 'Academia Portugal Digital',
        type: 'Digital Competencies',
        apiKeyRequired: false,
        enabled: true,
        searchEnabled: true,
        config: {}
      }
    })
  ]);

  const udemy = platforms[0];
  const msLearn = platforms[1];
  const academiapt = platforms[3];

  // -------------------------------------------------------------
  // 2) Criar ADMIN
  // -------------------------------------------------------------
  const adminEmail = 'admin@admin.com';
  const adminPass = 'Admin1234';
  const adminHash = await bcrypt.hash(adminPass, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: adminHash,
      name: 'Administrator',
      role: Role.ADMIN,
      experienceLevel: 'senior',
      techStack: ['Node.js', 'Prisma'],
      interests: ['Backend', 'APIs']
    }
  });

  await prisma.userPreferences.upsert({
    where: { userId: admin.id },
    update: {},
    create: {
      userId: admin.id,
      enabledPlatforms: platforms.map((p) => p.id),
      learningGoals: ['Gerir Plataforma', 'Monitorizar Treinos']
    }
  });

  // -------------------------------------------------------------
  // 3) Criar USER normal (perfil rico para testar recomendações)
  // -------------------------------------------------------------
  const userEmail = 'user@example.com';
  const userPass = 'password123';
  const userHash = await bcrypt.hash(userPass, 10);

  const user = await prisma.user.upsert({
    where: { email: userEmail },
    update: {
      experienceLevel: 'mid',
      techStack: ['React', 'Node.js', 'TypeScript', 'PostgreSQL'],
      interests: ['Cloud', 'DevOps', 'Backend', 'APIs'],
    },
    create: {
      email: userEmail,
      passwordHash: userHash,
      name: 'User Example',
      role: Role.USER,
      experienceLevel: 'mid',
      techStack: ['React', 'Node.js', 'TypeScript', 'PostgreSQL'],
      interests: ['Cloud', 'DevOps', 'Backend', 'APIs'],
    },
  });

  await prisma.userPreferences.upsert({
    where: { userId: user.id },
    update: {
      enabledPlatforms: [udemy.id, msLearn.id, academiapt.id],
      learningGoals: ['Aprender Azure', 'Melhorar skills em DevOps', 'Aprofundar NestJS'],
    },
    create: {
      userId: user.id,
      enabledPlatforms: [udemy.id, msLearn.id, academiapt.id],
      learningGoals: ['Aprender Azure', 'Melhorar skills em DevOps', 'Aprofundar NestJS'],
    },
  });

  // -------------------------------------------------------------
  // 4) Criar vários Training Records para o user
  // -------------------------------------------------------------
  // Limpa treinos anteriores para evitar duplicados no re-seed
  await prisma.trainingRecord.deleteMany({ where: { userId: user.id } });

  const trainings = await Promise.all([
    prisma.trainingRecord.create({
      data: {
        userId: user.id,
        platformId: udemy.id,
        title: 'Node.js Best Practices',
        url: 'https://www.udemy.com/course/nodejs-best-practices/',
        status: TrainingStatus.completed,
        notes: 'Excelente curso, muito prático',
        rating: 5,
        durationHours: 12,
        completedAt: new Date('2025-12-15'),
      },
    }),
    prisma.trainingRecord.create({
      data: {
        userId: user.id,
        platformId: msLearn.id,
        title: 'Introduction to Azure Cloud Services',
        url: 'https://learn.microsoft.com/azure/intro',
        status: TrainingStatus.ongoing,
        notes: 'A meio do curso',
        rating: 4,
        durationHours: 8,
        startedAt: new Date('2026-01-10'),
      },
    }),
    prisma.trainingRecord.create({
      data: {
        userId: user.id,
        platformId: udemy.id,
        title: 'Docker & Kubernetes: The Complete Guide',
        url: 'https://www.udemy.com/course/docker-and-kubernetes/',
        status: TrainingStatus.priority,
        notes: 'Quero terminar este mês',
        durationHours: 20,
      },
    }),
    prisma.trainingRecord.create({
      data: {
        userId: user.id,
        platformId: msLearn.id,
        title: 'TypeScript para Developers',
        url: 'https://learn.microsoft.com/typescript',
        status: TrainingStatus.completed,
        rating: 5,
        durationHours: 6,
        completedAt: new Date('2025-11-20'),
      },
    }),
    prisma.trainingRecord.create({
      data: {
        userId: user.id,
        platformId: udemy.id,
        title: 'PostgreSQL Advanced Queries',
        url: 'https://www.udemy.com/course/postgresql-advanced/',
        status: TrainingStatus.later,
        durationHours: 10,
      },
    }),
  ]);

  // -------------------------------------------------------------
  // 5) Criar certificado para o treino concluído
  // -------------------------------------------------------------
  await prisma.certificate.upsert({
    where: { trainingId: trainings[0].id },
    update: {},
    create: {
      trainingId: trainings[0].id,
      userId: user.id,
      fileUrl: 's3://bucket/certificates/nodejs-best-practices.pdf',
      courseName: 'Node.js Best Practices',
      provider: 'Udemy',
      completionDate: new Date('2025-12-15'),
      durationHours: 12,
      extractedMetadata: { imported: true },
    },
  });

  console.log('✅ Seed concluído com sucesso!');
}

// -------------------------------------------------------------
// EXECUÇÃO + SHUTDOWN CORRETO
// -------------------------------------------------------------
main()
  .catch((e) => {
    console.error('❌ Seed falhou:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

export default main;
