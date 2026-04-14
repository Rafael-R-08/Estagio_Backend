/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import {
  PrismaClient,
  Role,
  TrainingStatus,
  ServiceLine,
  ProcessingStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL não definida');

const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const hash = (pw: string) => bcrypt.hash(pw, 10);

async function createUser(data: {
  id: string;
  email: string;
  name: string;
  password: string;
  role?: Role;
  serviceLine?: ServiceLine;
  managedLineId?: ServiceLine;
  userFunction?: string;
  experienceLevel?: string;
  interests?: string[];
  onboardingDone?: boolean;
  lang?: string;
}) {
  const passwordHash = await hash(data.password);
  const u = await prisma.user.upsert({
    where: { email: data.email },
    update: {
      passwordHash,
      name: data.name,
      role: data.role ?? Role.USER,
      serviceLine: data.serviceLine,
      managedLineId: data.managedLineId,
      userFunction: data.userFunction,
      experienceLevel: data.experienceLevel as any,
      interests: data.interests ?? [],
      onboardingDone: data.onboardingDone ?? true,
    },
    create: {
      id: data.id,
      email: data.email,
      passwordHash,
      name: data.name,
      role: data.role ?? Role.USER,
      serviceLine: data.serviceLine,
      managedLineId: data.managedLineId,
      userFunction: data.userFunction,
      experienceLevel: data.experienceLevel as any,
      interests: data.interests ?? [],
      onboardingDone: data.onboardingDone ?? true,
    },
  });
  await prisma.userSettings.upsert({
    where: { userId: u.id },
    update: { uiLanguage: data.lang ?? 'pt' },
    create: { userId: u.id, uiLanguage: data.lang ?? 'pt' },
  });
  return u;
}

async function main() {
  console.log('Iniciando seed...\n');

  // Plataformas
  const [udemy, msLearn, ibm, academia, trailhead, softinsaEl, softinsaInternal, linkedin, coursera] = await Promise.all([
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
        type: 'Tech',
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
        type: 'Education',
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
        type: 'Tech',
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
        searchEnabled: false,
        apiKeyRequired: true,
        config: {},
      },
    }),
    prisma.learningPlatform.upsert({
      where: { name: 'Softinsa Internal' },
      update: {},
      create: {
        name: 'Softinsa Internal',
        type: 'Internal',
        enabled: true,
        searchEnabled: false,
        config: {},
      },
    }),
    prisma.learningPlatform.upsert({
      where: { name: 'LinkedIn Learning' },
      update: {},
      create: {
        name: 'LinkedIn Learning',
        type: 'Tech',
        enabled: false,
        searchEnabled: false,
        config: {},
      },
    }),
    prisma.learningPlatform.upsert({
      where: { name: 'Coursera' },
      update: {},
      create: {
        name: 'Coursera',
        type: 'Education',
        enabled: false,
        searchEnabled: false,
        config: {},
      },
    }),
  ]);

  // Utilizadores
  const admin = await createUser({
    id: 'seed-admin-001',
    email: 'admin@softinsa.com',
    name: 'Admin Softinsa',
    password: 'Admin@1234',
    role: Role.ADMIN,
    serviceLine: ServiceLine.HYBRID_CLOUD,
    userFunction: 'Administrador de Plataforma',
    experienceLevel: 'especialista',
    interests: ['Cloud', 'IA', 'Segurança', 'Liderança'],
  });
  const manager = await createUser({
    id: 'seed-manager-001',
    email: 'manager.cloud@softinsa.com',
    name: 'Carlos Mendes',
    password: 'Manager@1234',
    role: Role.SERVICE_LINE_MANAGER,
    serviceLine: ServiceLine.HYBRID_CLOUD,
    managedLineId: ServiceLine.HYBRID_CLOUD,
    userFunction: 'Service Line Manager',
    experienceLevel: 'lider',
    interests: ['Cloud Strategy', 'DevOps', 'Azure', 'Gestão de Equipas'],
  });
  await createUser({
    id: 'seed-manager-002',
    email: 'manager.data@softinsa.com',
    name: 'Ana Rodrigues',
    password: 'Manager@1234',
    role: Role.SERVICE_LINE_MANAGER,
    serviceLine: ServiceLine.DATA,
    managedLineId: ServiceLine.DATA,
    userFunction: 'Data Science Manager',
    experienceLevel: 'especialista',
    interests: ['Machine Learning', 'Data Engineering', 'Python', 'Power BI'],
  });
  const userJunior = await createUser({
    id: 'seed-user-001',
    email: 'joao.silva@softinsa.com',
    name: 'João Silva',
    password: 'User@1234',
    serviceLine: ServiceLine.HYBRID_CLOUD,
    userFunction: 'Cloud Engineer Júnior',
    experienceLevel: 'junior',
    interests: ['Azure', 'Docker', 'Kubernetes', 'Linux'],
  });
  const userMid = await createUser({
    id: 'seed-user-002',
    email: 'maria.costa@softinsa.com',
    name: 'Maria Costa',
    password: 'User@1234',
    serviceLine: ServiceLine.DATA,
    userFunction: 'Data Analyst',
    experienceLevel: 'intermedio',
    interests: ['Python', 'SQL', 'Power BI', 'Machine Learning'],
    lang: 'en',
  });
  const userSenior = await createUser({
    id: 'seed-user-003',
    email: 'rui.ferreira@softinsa.com',
    name: 'Rui Ferreira',
    password: 'User@1234',
    serviceLine: ServiceLine.APPLICATION_OPERATIONS,
    userFunction: 'Full Stack Developer',
    experienceLevel: 'senior',
    interests: ['Node.js', 'React', 'TypeScript', 'DevOps', 'CI/CD'],
  });
  const userBiz = await createUser({
    id: 'seed-user-004',
    email: 'sofia.lopes@softinsa.com',
    name: 'Sofia Lopes',
    password: 'User@1234',
    serviceLine: ServiceLine.BUSINESS_APPLICATIONS,
    userFunction: 'ERP Consultant',
    experienceLevel: 'intermedio',
    interests: [
      'SAP',
      'Dynamics 365',
      'Power Platform',
      'Business Intelligence',
    ],
  });
  await createUser({
    id: 'seed-user-005',
    email: 'novo@softinsa.com',
    name: 'Utilizador Novo',
    password: 'User@1234',
    onboardingDone: false,
  });

  // ── Hybrid Cloud (manager: Carlos Mendes) ─────────────────────────────
  const userPedro = await createUser({
    id: 'seed-user-006',
    email: 'pedro.alves@softinsa.com',
    name: 'Pedro Alves',
    password: 'User@1234',
    serviceLine: ServiceLine.HYBRID_CLOUD,
    userFunction: 'Cloud Solution Architect',
    experienceLevel: 'intermedio',
    interests: ['Azure', 'Terraform', 'IaC', 'Networking'],
  });
  const userInes = await createUser({
    id: 'seed-user-007',
    email: 'ines.monteiro@softinsa.com',
    name: 'Inês Monteiro',
    password: 'User@1234',
    serviceLine: ServiceLine.HYBRID_CLOUD,
    userFunction: 'DevOps Engineer',
    experienceLevel: 'senior',
    interests: ['Kubernetes', 'CI/CD', 'Helm', 'Linux', 'GitOps'],
  });
  await createUser({
    id: 'seed-user-008',
    email: 'miguel.santos@softinsa.com',
    name: 'Miguel Santos',
    password: 'User@1234',
    serviceLine: ServiceLine.HYBRID_CLOUD,
    userFunction: 'Cloud Trainee',
    experienceLevel: 'junior',
    interests: ['Azure', 'Cloud', 'Linux'],
  });
  const userBeatriz = await createUser({
    id: 'seed-user-009',
    email: 'beatriz.fonseca@softinsa.com',
    name: 'Beatriz Fonseca',
    password: 'User@1234',
    serviceLine: ServiceLine.HYBRID_CLOUD,
    userFunction: 'Cloud Architect Lead',
    experienceLevel: 'especialista',
    interests: ['Azure Architecture', 'Security', 'Governance', 'FinOps'],
  });

  // ── Data (manager: Ana Rodrigues) ──────────────────────────────────────
  const userLuis = await createUser({
    id: 'seed-user-010',
    email: 'luis.tavares@softinsa.com',
    name: 'Luís Tavares',
    password: 'User@1234',
    serviceLine: ServiceLine.DATA,
    userFunction: 'Data Engineer',
    experienceLevel: 'senior',
    interests: ['PySpark', 'Databricks', 'dbt', 'Data Lakehouse'],
  });
  const userCatarina = await createUser({
    id: 'seed-user-011',
    email: 'catarina.neves@softinsa.com',
    name: 'Catarina Neves',
    password: 'User@1234',
    serviceLine: ServiceLine.DATA,
    userFunction: 'BI Analyst',
    experienceLevel: 'junior',
    interests: ['Power BI', 'DAX', 'Excel', 'SQL'],
  });
  await createUser({
    id: 'seed-user-012',
    email: 'andre.pinto@softinsa.com',
    name: 'André Pinto',
    password: 'User@1234',
    serviceLine: ServiceLine.DATA,
    userFunction: 'Data Analyst',
    experienceLevel: 'intermedio',
    interests: ['SQL', 'Excel', 'Tableau'],
  });

  // ── Application Operations ─────────────────────────────────────────────
  const userDaniela = await createUser({
    id: 'seed-user-013',
    email: 'daniela.ferraz@softinsa.com',
    name: 'Daniela Ferraz',
    password: 'User@1234',
    serviceLine: ServiceLine.APPLICATION_OPERATIONS,
    userFunction: 'Frontend Developer',
    experienceLevel: 'intermedio',
    interests: ['React', 'TypeScript', 'Next.js', 'UX'],
  });
  const userGoncalo = await createUser({
    id: 'seed-user-014',
    email: 'goncalo.silva@softinsa.com',
    name: 'Gonçalo Silva',
    password: 'User@1234',
    serviceLine: ServiceLine.APPLICATION_OPERATIONS,
    userFunction: 'Backend Developer',
    experienceLevel: 'junior',
    interests: ['Node.js', 'REST APIs', 'SQL'],
  });

  // ── Business Applications ──────────────────────────────────────────────
  const userRicardo = await createUser({
    id: 'seed-user-015',
    email: 'ricardo.matos@softinsa.com',
    name: 'Ricardo Matos',
    password: 'User@1234',
    serviceLine: ServiceLine.BUSINESS_APPLICATIONS,
    userFunction: 'SAP Solution Architect',
    experienceLevel: 'senior',
    interests: ['SAP BTP', 'SAP Fiori', 'ABAP', 'Integration Suite'],
  });
  const userMarta = await createUser({
    id: 'seed-user-016',
    email: 'marta.vieira@softinsa.com',
    name: 'Marta Vieira',
    password: 'User@1234',
    serviceLine: ServiceLine.BUSINESS_APPLICATIONS,
    userFunction: 'CRM Specialist',
    experienceLevel: 'junior',
    interests: ['Dynamics 365', 'Power Apps', 'Salesforce'],
  });

  // ── Sourcing & Talent Management (manager: Filipa Costa) ──────────────
  const managerStm = await createUser({
    id: 'seed-manager-003',
    email: 'manager.stm@softinsa.com',
    name: 'Filipa Costa',
    password: 'Manager@1234',
    role: Role.SERVICE_LINE_MANAGER,
    serviceLine: ServiceLine.SOURCING_TALENT_MANAGEMENT,
    managedLineId: ServiceLine.SOURCING_TALENT_MANAGEMENT,
    userFunction: 'HR Technology Director',
    experienceLevel: 'lider',
    interests: ['HR Analytics', 'Talent Management', 'Organizational Change'],
  });
  const userPaulo = await createUser({
    id: 'seed-user-017',
    email: 'paulo.rodrigues@softinsa.com',
    name: 'Paulo Rodrigues',
    password: 'User@1234',
    serviceLine: ServiceLine.SOURCING_TALENT_MANAGEMENT,
    userFunction: 'HR Tech Specialist',
    experienceLevel: 'intermedio',
    interests: ['Workday', 'HR Analytics', 'Recruitment Tech'],
  });

  // Skills
  const skillsMap: Record<string, { skillName: string; level: string }[]> = {
    [userJunior.id]: [
      { skillName: 'Azure', level: 'iniciante' },
      { skillName: 'Docker', level: 'iniciante' },
      { skillName: 'Linux', level: 'intermedio' },
      { skillName: 'Git', level: 'intermedio' },
    ],
    [userMid.id]: [
      { skillName: 'Python', level: 'experiente' },
      { skillName: 'SQL', level: 'experiente' },
      { skillName: 'Power BI', level: 'intermedio' },
      { skillName: 'Machine Learning', level: 'iniciante' },
    ],
    [userSenior.id]: [
      { skillName: 'Node.js', level: 'experiente' },
      { skillName: 'TypeScript', level: 'experiente' },
      { skillName: 'React', level: 'experiente' },
      { skillName: 'Docker', level: 'intermedio' },
      { skillName: 'PostgreSQL', level: 'intermedio' },
    ],
    [userBiz.id]: [
      { skillName: 'SAP', level: 'intermedio' },
      { skillName: 'Power Platform', level: 'iniciante' },
      { skillName: 'Excel Avançado', level: 'experiente' },
    ],
    [manager.id]: [
      { skillName: 'Azure', level: 'experiente' },
      { skillName: 'Gestão de Projetos', level: 'experiente' },
      { skillName: 'DevOps', level: 'intermedio' },
    ],
    [admin.id]: [
      { skillName: 'NestJS', level: 'experiente' },
      { skillName: 'TypeScript', level: 'experiente' },
    ],
    [userPedro.id]: [
      { skillName: 'Azure', level: 'intermedio' },
      { skillName: 'Terraform', level: 'intermedio' },
      { skillName: 'Networking', level: 'iniciante' },
    ],
    [userInes.id]: [
      { skillName: 'Kubernetes', level: 'experiente' },
      { skillName: 'Helm', level: 'intermedio' },
      { skillName: 'CI/CD', level: 'experiente' },
      { skillName: 'Linux', level: 'experiente' },
    ],
    [userBeatriz.id]: [
      { skillName: 'Azure Architecture', level: 'experiente' },
      { skillName: 'Azure Security', level: 'experiente' },
      { skillName: 'FinOps', level: 'intermedio' },
      { skillName: 'Terraform', level: 'experiente' },
    ],
    [userLuis.id]: [
      { skillName: 'PySpark', level: 'experiente' },
      { skillName: 'Databricks', level: 'experiente' },
      { skillName: 'dbt', level: 'intermedio' },
      { skillName: 'SQL', level: 'experiente' },
    ],
    [userCatarina.id]: [
      { skillName: 'Power BI', level: 'intermedio' },
      { skillName: 'DAX', level: 'iniciante' },
      { skillName: 'Excel Avançado', level: 'intermedio' },
      { skillName: 'SQL', level: 'iniciante' },
    ],
    [userDaniela.id]: [
      { skillName: 'React', level: 'intermedio' },
      { skillName: 'TypeScript', level: 'intermedio' },
      { skillName: 'Next.js', level: 'iniciante' },
      { skillName: 'CSS', level: 'intermedio' },
    ],
    [userGoncalo.id]: [
      { skillName: 'Node.js', level: 'iniciante' },
      { skillName: 'Express', level: 'iniciante' },
      { skillName: 'REST APIs', level: 'iniciante' },
    ],
    [userRicardo.id]: [
      { skillName: 'SAP BTP', level: 'experiente' },
      { skillName: 'SAP Fiori', level: 'experiente' },
      { skillName: 'ABAP', level: 'intermedio' },
    ],
    [userMarta.id]: [
      { skillName: 'Dynamics 365', level: 'iniciante' },
      { skillName: 'Power Apps', level: 'iniciante' },
    ],
    [managerStm.id]: [
      { skillName: 'HR Analytics', level: 'experiente' },
      { skillName: 'Gestão de Pessoas', level: 'experiente' },
      { skillName: 'Workday', level: 'intermedio' },
    ],
    [userPaulo.id]: [
      { skillName: 'Workday', level: 'intermedio' },
      { skillName: 'HR Analytics', level: 'iniciante' },
      { skillName: 'Excel Avançado', level: 'intermedio' },
    ],
  };
  for (const [userId, skills] of Object.entries(skillsMap)) {
    await prisma.userSkill.deleteMany({ where: { userId } });
    await prisma.userSkill.createMany({
      data: skills.map((s) => ({
        userId,
        skillName: s.skillName,
        level: s.level as any,
      })),
    });
  }

  // TrainingRecords (sem Course — cursos vêm de APIs externas)
  const trainings = [
    {
      id: 'tr-joao-001',
      userId: userJunior.id,
      platformId: msLearn.id,
      title: 'Azure Fundamentals AZ-900',
      url: 'https://learn.microsoft.com/azure/az-900',
      status: TrainingStatus.completed,
      completedAt: new Date('2025-11-01'),
      rating: 5,
      progressLevel: '100%',
      durationHours: 8.0,
      notes: 'Excelente introdução ao Azure.',
    },
    {
      id: 'tr-joao-002',
      userId: userJunior.id,
      platformId: udemy.id,
      title: 'Docker & Kubernetes: The Practical Guide',
      url: 'https://udemy.com/docker-kubernetes',
      status: TrainingStatus.ongoing,
      progressLevel: '45%',
      durationHours: 22.0,
    },
    {
      id: 'tr-joao-003',
      userId: userJunior.id,
      platformId: msLearn.id,
      title: 'Azure Administrator AZ-104',
      url: 'https://learn.microsoft.com/azure/az-104',
      status: TrainingStatus.priority,
    },
    {
      id: 'tr-maria-001',
      userId: userMid.id,
      platformId: coursera.id,
      title: 'IBM Data Science Professional Certificate',
      url: 'https://coursera.org/ibm-data-science',
      status: TrainingStatus.completed,
      completedAt: new Date('2025-08-15'),
      rating: 4,
      progressLevel: '100%',
      durationHours: 60.0,
      notes: 'Programa muito completo. Projetos práticos com Python e ML.',
    },
    {
      id: 'tr-maria-002',
      userId: userMid.id,
      platformId: udemy.id,
      title: 'Power BI Masterclass 2026',
      url: 'https://udemy.com/powerbi-masterclass',
      status: TrainingStatus.completed,
      completedAt: new Date('2025-10-20'),
      rating: 5,
      progressLevel: '100%',
      durationHours: 14.0,
    },
    {
      id: 'tr-maria-003',
      userId: userMid.id,
      platformId: coursera.id,
      title: 'Machine Learning Specialization — Stanford',
      url: 'https://coursera.org/ml-stanford',
      status: TrainingStatus.ongoing,
      progressLevel: '30%',
      durationHours: 90.0,
      notes: 'Módulo 2 — Árvores de decisão',
    },
    {
      id: 'tr-maria-004',
      userId: userMid.id,
      platformId: linkedin.id,
      title: 'Advanced SQL for Data Analysis',
      url: 'https://linkedin.com/learning/sql-advanced',
      status: TrainingStatus.later,
    },
    {
      id: 'tr-rui-001',
      userId: userSenior.id,
      platformId: udemy.id,
      title: 'Node.js Best Practices & Architecture',
      url: 'https://udemy.com/nodejs-architecture',
      status: TrainingStatus.completed,
      completedAt: new Date('2025-06-01'),
      rating: 5,
      progressLevel: '100%',
      durationHours: 18.0,
    },
    {
      id: 'tr-rui-002',
      userId: userSenior.id,
      platformId: udemy.id,
      title: 'React & TypeScript 2026 — Complete Guide',
      url: 'https://udemy.com/react-typescript-2026',
      status: TrainingStatus.completed,
      completedAt: new Date('2025-09-10'),
      rating: 4,
      progressLevel: '100%',
      durationHours: 30.0,
    },
    {
      id: 'tr-rui-003',
      userId: userSenior.id,
      platformId: udemy.id,
      title: 'GitHub Actions — CI/CD Pipelines',
      url: 'https://udemy.com/github-actions',
      status: TrainingStatus.ongoing,
      progressLevel: '70%',
      durationHours: 10.0,
    },
    {
      id: 'tr-rui-004',
      userId: userSenior.id,
      platformId: msLearn.id,
      title: 'Azure DevOps Engineer Expert AZ-400',
      url: 'https://learn.microsoft.com/azure/az-400',
      status: TrainingStatus.priority,
    },
    {
      id: 'tr-sofia-001',
      userId: userBiz.id,
      platformId: linkedin.id,
      title: 'SAP S/4HANA Fundamentals',
      url: 'https://linkedin.com/learning/sap-s4hana',
      status: TrainingStatus.completed,
      completedAt: new Date('2025-07-20'),
      rating: 4,
      progressLevel: '100%',
      durationHours: 12.0,
    },
    {
      id: 'tr-sofia-002',
      userId: userBiz.id,
      platformId: msLearn.id,
      title: 'Microsoft Power Platform Fundamentals PL-900',
      url: 'https://learn.microsoft.com/power-platform/pl-900',
      status: TrainingStatus.ongoing,
      progressLevel: '55%',
      durationHours: 8.0,
    },
    {
      id: 'tr-sofia-003',
      userId: userBiz.id,
      platformId: coursera.id,
      title: 'Business Intelligence with Power BI',
      url: 'https://coursera.org/bi-powerbi',
      status: TrainingStatus.priority,
    },
    {
      id: 'tr-carlos-001',
      userId: manager.id,
      platformId: msLearn.id,
      title: 'Azure Solutions Architect Expert AZ-305',
      url: 'https://learn.microsoft.com/azure/az-305',
      status: TrainingStatus.completed,
      completedAt: new Date('2025-03-15'),
      rating: 5,
      progressLevel: '100%',
      durationHours: 40.0,
    },
    {
      id: 'tr-carlos-002',
      userId: manager.id,
      platformId: softinsaInternal.id,
      title: 'Softinsa Leadership Program 2025',
      url: 'https://learning.softinsa.com/leadership-2025',
      status: TrainingStatus.completed,
      completedAt: new Date('2025-12-01'),
      rating: 5,
      progressLevel: '100%',
      durationHours: 20.0,
    },
    {
      id: 'tr-admin-001',
      userId: admin.id,
      platformId: udemy.id,
      title: "NestJS: The Complete Developer's Guide",
      url: 'https://udemy.com/nestjs-complete',
      status: TrainingStatus.completed,
      completedAt: new Date('2025-05-01'),
      rating: 5,
      progressLevel: '100%',
      durationHours: 25.0,
    },

    // ── Pedro Alves — HYBRID_CLOUD (cert WARNING: AZ-104 expira Mai 18)
    {
      id: 'tr-pedro-001',
      userId: userPedro.id,
      platformId: msLearn.id,
      title: 'Azure Administrator AZ-104',
      url: 'https://learn.microsoft.com/azure/az-104',
      status: TrainingStatus.completed,
      completedAt: new Date('2026-01-15'),
      rating: 4,
      progressLevel: '100%',
      durationHours: 30.0,
    },
    {
      id: 'tr-pedro-002',
      userId: userPedro.id,
      platformId: udemy.id,
      title: 'Terraform — Getting Started on Azure',
      url: 'https://udemy.com/terraform-azure',
      status: TrainingStatus.ongoing,
      progressLevel: '60%',
      durationHours: 12.0,
    },

    // ── Inês Monteiro — HYBRID_CLOUD (cert INFO: CKA expira Jun 17)
    {
      id: 'tr-ines-001',
      userId: userInes.id,
      platformId: udemy.id,
      title: 'Certified Kubernetes Administrator (CKA)',
      url: 'https://udemy.com/cka',
      status: TrainingStatus.completed,
      completedAt: new Date('2025-10-05'),
      rating: 5,
      progressLevel: '100%',
      durationHours: 28.0,
    },
    {
      id: 'tr-ines-002',
      userId: userInes.id,
      platformId: udemy.id,
      title: 'GitHub Actions Advanced — GitOps Workflows',
      url: 'https://udemy.com/github-actions-advanced',
      status: TrainingStatus.completed,
      completedAt: new Date('2025-12-20'),
      rating: 5,
      progressLevel: '100%',
      durationHours: 15.0,
    },
    {
      id: 'tr-ines-003',
      userId: userInes.id,
      platformId: udemy.id,
      title: 'Helm Charts Masterclass',
      url: 'https://udemy.com/helm-charts',
      status: TrainingStatus.ongoing,
      progressLevel: '40%',
      durationHours: 10.0,
    },

    // ── Beatriz Fonseca — HYBRID_CLOUD (cert CRÍTICO: AZ-305 expira Abr 23)
    {
      id: 'tr-beatriz-001',
      userId: userBeatriz.id,
      platformId: msLearn.id,
      title: 'Azure Solutions Architect Expert AZ-305',
      url: 'https://learn.microsoft.com/azure/az-305',
      status: TrainingStatus.completed,
      completedAt: new Date('2024-04-23'),
      rating: 5,
      progressLevel: '100%',
      durationHours: 40.0,
      notes: 'Renovação necessária em breve.',
    },
    {
      id: 'tr-beatriz-002',
      userId: userBeatriz.id,
      platformId: linkedin.id,
      title: 'FinOps Certified Practitioner',
      url: 'https://linkedin.com/learning/finops',
      status: TrainingStatus.completed,
      completedAt: new Date('2025-02-10'),
      rating: 4,
      progressLevel: '100%',
      durationHours: 16.0,
    },

    // ── Luís Tavares — DATA
    {
      id: 'tr-luis-001',
      userId: userLuis.id,
      platformId: coursera.id,
      title: 'Databricks Certified Data Engineer Associate',
      url: 'https://coursera.org/databricks-engineer',
      status: TrainingStatus.completed,
      completedAt: new Date('2025-09-01'),
      rating: 5,
      progressLevel: '100%',
      durationHours: 35.0,
    },
    {
      id: 'tr-luis-002',
      userId: userLuis.id,
      platformId: udemy.id,
      title: 'dbt (data build tool) — Complete Bootcamp',
      url: 'https://udemy.com/dbt-bootcamp',
      status: TrainingStatus.completed,
      completedAt: new Date('2025-11-15'),
      rating: 5,
      progressLevel: '100%',
      durationHours: 18.0,
    },
    {
      id: 'tr-luis-003',
      userId: userLuis.id,
      platformId: udemy.id,
      title: 'Apache Spark with PySpark 3.0',
      url: 'https://udemy.com/pyspark-3',
      status: TrainingStatus.ongoing,
      progressLevel: '55%',
      durationHours: 22.0,
    },

    // ── Catarina Neves — DATA
    {
      id: 'tr-catarina-001',
      userId: userCatarina.id,
      platformId: msLearn.id,
      title: 'Microsoft Power BI Data Analyst PL-300',
      url: 'https://learn.microsoft.com/power-bi/pl-300',
      status: TrainingStatus.completed,
      completedAt: new Date('2026-02-10'),
      rating: 4,
      progressLevel: '100%',
      durationHours: 20.0,
    },
    {
      id: 'tr-catarina-002',
      userId: userCatarina.id,
      platformId: udemy.id,
      title: 'Excel Power Query & DAX Fundamentals',
      url: 'https://udemy.com/excel-dax',
      status: TrainingStatus.completed,
      completedAt: new Date('2026-01-05'),
      rating: 4,
      progressLevel: '100%',
      durationHours: 10.0,
    },
    {
      id: 'tr-catarina-003',
      userId: userCatarina.id,
      platformId: linkedin.id,
      title: 'SQL for Business Intelligence',
      url: 'https://linkedin.com/learning/sql-bi',
      status: TrainingStatus.priority,
    },

    // ── Daniela Ferraz — APPLICATION_OPERATIONS
    {
      id: 'tr-daniela-001',
      userId: userDaniela.id,
      platformId: udemy.id,
      title: 'React 18 — The Complete Guide',
      url: 'https://udemy.com/react-18',
      status: TrainingStatus.completed,
      completedAt: new Date('2025-08-20'),
      rating: 5,
      progressLevel: '100%',
      durationHours: 32.0,
    },
    {
      id: 'tr-daniela-002',
      userId: userDaniela.id,
      platformId: udemy.id,
      title: 'Next.js 14 & React — The Complete Guide',
      url: 'https://udemy.com/nextjs-14',
      status: TrainingStatus.completed,
      completedAt: new Date('2025-11-30'),
      rating: 5,
      progressLevel: '100%',
      durationHours: 25.0,
    },
    {
      id: 'tr-daniela-003',
      userId: userDaniela.id,
      platformId: udemy.id,
      title: 'Vue 3 — The Composition API',
      url: 'https://udemy.com/vue-3-composition',
      status: TrainingStatus.ongoing,
      progressLevel: '35%',
      durationHours: 14.0,
    },

    // ── Gonçalo Silva — APPLICATION_OPERATIONS (INATIVO: última conclusão Nov 2024)
    {
      id: 'tr-goncalo-001',
      userId: userGoncalo.id,
      platformId: udemy.id,
      title: 'Node.js, Express, MongoDB Bootcamp',
      url: 'https://udemy.com/nodejs-bootcamp',
      status: TrainingStatus.completed,
      completedAt: new Date('2024-10-12'),
      rating: 3,
      progressLevel: '100%',
      durationHours: 20.0,
    },
    {
      id: 'tr-goncalo-002',
      userId: userGoncalo.id,
      platformId: udemy.id,
      title: 'REST API Design Best Practices',
      url: 'https://udemy.com/rest-api-design',
      status: TrainingStatus.completed,
      completedAt: new Date('2024-11-05'),
      rating: 4,
      progressLevel: '100%',
      durationHours: 8.0,
    },

    // ── Ricardo Matos — BUSINESS_APPLICATIONS (cert CRÍTICO: SAP BTP expira Abr 23)
    {
      id: 'tr-ricardo-001',
      userId: userRicardo.id,
      platformId: linkedin.id,
      title: 'SAP BTP Developer Certification',
      url: 'https://linkedin.com/learning/sap-btp-dev',
      status: TrainingStatus.completed,
      completedAt: new Date('2024-04-20'),
      rating: 5,
      progressLevel: '100%',
      durationHours: 24.0,
    },
    {
      id: 'tr-ricardo-002',
      userId: userRicardo.id,
      platformId: linkedin.id,
      title: 'SAP Fiori & UI5 Development',
      url: 'https://linkedin.com/learning/sap-fiori-ui5',
      status: TrainingStatus.completed,
      completedAt: new Date('2025-01-15'),
      rating: 5,
      progressLevel: '100%',
      durationHours: 20.0,
    },
    {
      id: 'tr-ricardo-003',
      userId: userRicardo.id,
      platformId: udemy.id,
      title: 'SAP S/4HANA Cloud Integration',
      url: 'https://udemy.com/sap-s4hana-cloud',
      status: TrainingStatus.ongoing,
      progressLevel: '50%',
      durationHours: 18.0,
    },

    // ── Marta Vieira — BUSINESS_APPLICATIONS
    {
      id: 'tr-marta-001',
      userId: userMarta.id,
      platformId: msLearn.id,
      title: 'Microsoft Dynamics 365 Fundamentals MB-910',
      url: 'https://learn.microsoft.com/dynamics-365/mb-910',
      status: TrainingStatus.completed,
      completedAt: new Date('2025-12-15'),
      rating: 4,
      progressLevel: '100%',
      durationHours: 12.0,
    },
    {
      id: 'tr-marta-002',
      userId: userMarta.id,
      platformId: msLearn.id,
      title: 'Power Apps: Build Canvas Apps',
      url: 'https://learn.microsoft.com/power-apps/canvas',
      status: TrainingStatus.ongoing,
      progressLevel: '25%',
      durationHours: 10.0,
    },

    // ── Filipa Costa — SOURCING_TALENT_MANAGEMENT (manager)
    {
      id: 'tr-filipa-001',
      userId: managerStm.id,
      platformId: linkedin.id,
      title: 'HR Analytics & People Data Strategy',
      url: 'https://linkedin.com/learning/hr-analytics',
      status: TrainingStatus.completed,
      completedAt: new Date('2025-06-10'),
      rating: 5,
      progressLevel: '100%',
      durationHours: 14.0,
    },
    {
      id: 'tr-filipa-002',
      userId: managerStm.id,
      platformId: coursera.id,
      title: 'People Management & Organizational Behavior',
      url: 'https://coursera.org/people-management',
      status: TrainingStatus.completed,
      completedAt: new Date('2025-09-20'),
      rating: 5,
      progressLevel: '100%',
      durationHours: 20.0,
    },

    // ── Paulo Rodrigues — SOURCING_TALENT_MANAGEMENT
    {
      id: 'tr-paulo-001',
      userId: userPaulo.id,
      platformId: linkedin.id,
      title: 'Workday HCM Fundamentals',
      url: 'https://linkedin.com/learning/workday-hcm',
      status: TrainingStatus.completed,
      completedAt: new Date('2026-01-20'),
      rating: 4,
      progressLevel: '100%',
      durationHours: 16.0,
    },
    {
      id: 'tr-paulo-002',
      userId: userPaulo.id,
      platformId: linkedin.id,
      title: 'LinkedIn Recruiter Masterclass',
      url: 'https://linkedin.com/learning/recruiter',
      status: TrainingStatus.completed,
      completedAt: new Date('2025-11-10'),
      rating: 4,
      progressLevel: '100%',
      durationHours: 8.0,
    },
  ];

  for (const t of trainings) {
    await prisma.trainingRecord.upsert({
      where: { id: t.id },
      update: {
        status: t.status,
        progressLevel: t.progressLevel ?? null,
        notes: (t as any).notes ?? null,
        rating: t.rating ?? null,
        completedAt: t.completedAt ?? null,
        durationHours: t.durationHours ?? null,
      },
      create: {
        id: t.id,
        userId: t.userId,
        platformId: t.platformId,
        title: t.title,
        url: t.url,
        status: t.status,
        progressLevel: t.progressLevel ?? null,
        notes: (t as any).notes ?? null,
        rating: t.rating ?? null,
        completedAt: t.completedAt ?? null,
        durationHours: t.durationHours ?? null,
      },
    });
  }

  // Certificados
  // Expirações para cobrir todos os níveis de alerta no manager:
  //   new Date('2026-04-23') → ~20 dias → CRITICAL
  //   new Date('2026-05-18') → ~45 dias → WARNING
  //   new Date('2026-06-17') → ~75 dias → INFO
  //   null                   → sem expiração
  const certs = [
    {
      id: 'cert-joao-001',
      trainingId: 'tr-joao-001',
      userId: userJunior.id,
      fileUrl: '/uploads/certificates/cert-joao-001.pdf',
      courseName: 'Microsoft Azure Fundamentals AZ-900',
      provider: 'Microsoft',
      completionDate: new Date('2025-11-01'),
      expirationDate: null,
      status: ProcessingStatus.COMPLETED,
    },
    {
      id: 'cert-pedro-001',
      trainingId: 'tr-pedro-001',
      userId: userPedro.id,
      fileUrl: '/uploads/certificates/cert-pedro-001.pdf',
      courseName: 'Microsoft Azure Administrator AZ-104',
      provider: 'Microsoft',
      completionDate: new Date('2026-01-15'),
      expirationDate: new Date('2026-05-18'),
      status: ProcessingStatus.COMPLETED,
    },
    {
      id: 'cert-ines-001',
      trainingId: 'tr-ines-001',
      userId: userInes.id,
      fileUrl: '/uploads/certificates/cert-ines-001.pdf',
      courseName: 'Certified Kubernetes Administrator (CKA)',
      provider: 'CNCF',
      completionDate: new Date('2025-10-05'),
      expirationDate: new Date('2026-06-17'),
      status: ProcessingStatus.COMPLETED,
    },
    {
      id: 'cert-beatriz-001',
      trainingId: 'tr-beatriz-001',
      userId: userBeatriz.id,
      fileUrl: '/uploads/certificates/cert-beatriz-001.pdf',
      courseName: 'Azure Solutions Architect Expert AZ-305',
      provider: 'Microsoft',
      completionDate: new Date('2024-04-23'),
      expirationDate: new Date('2026-04-23'),
      status: ProcessingStatus.COMPLETED,
    },
    {
      id: 'cert-carlos-001',
      trainingId: 'tr-carlos-001',
      userId: manager.id,
      fileUrl: '/uploads/certificates/cert-carlos-001.pdf',
      courseName: 'Azure Solutions Architect Expert AZ-305',
      provider: 'Microsoft',
      completionDate: new Date('2025-03-15'),
      expirationDate: null,
      status: ProcessingStatus.COMPLETED,
    },
    {
      id: 'cert-luis-001',
      trainingId: 'tr-luis-001',
      userId: userLuis.id,
      fileUrl: '/uploads/certificates/cert-luis-001.pdf',
      courseName: 'Databricks Certified Data Engineer Associate',
      provider: 'Databricks',
      completionDate: new Date('2025-09-01'),
      expirationDate: null,
      status: ProcessingStatus.COMPLETED,
    },
    {
      id: 'cert-catarina-001',
      trainingId: 'tr-catarina-001',
      userId: userCatarina.id,
      fileUrl: '/uploads/certificates/cert-catarina-001.pdf',
      courseName: 'Microsoft Power BI Data Analyst PL-300',
      provider: 'Microsoft',
      completionDate: new Date('2026-02-10'),
      expirationDate: null,
      status: ProcessingStatus.COMPLETED,
    },
    {
      id: 'cert-ricardo-001',
      trainingId: 'tr-ricardo-001',
      userId: userRicardo.id,
      fileUrl: '/uploads/certificates/cert-ricardo-001.pdf',
      courseName: 'SAP BTP Developer Certification',
      provider: 'SAP',
      completionDate: new Date('2024-04-20'),
      expirationDate: new Date('2026-04-23'),
      status: ProcessingStatus.COMPLETED,
    },
    {
      id: 'cert-marta-001',
      trainingId: 'tr-marta-001',
      userId: userMarta.id,
      fileUrl: '/uploads/certificates/cert-marta-001.pdf',
      courseName: 'Microsoft Dynamics 365 Fundamentals MB-910',
      provider: 'Microsoft',
      completionDate: new Date('2025-12-15'),
      expirationDate: null,
      status: ProcessingStatus.COMPLETED,
    },
  ];

  for (const c of certs) {
    await prisma.certificate.upsert({
      where: { trainingId: c.trainingId },
      update: {
        courseName: c.courseName,
        provider: c.provider,
        completionDate: c.completionDate,
        expirationDate: c.expirationDate,
        status: c.status,
      },
      create: {
        id: c.id,
        trainingId: c.trainingId,
        userId: c.userId,
        fileUrl: c.fileUrl,
        courseName: c.courseName,
        provider: c.provider,
        completionDate: c.completionDate,
        expirationDate: c.expirationDate,
        status: c.status,
      },
    });
  }

  console.log('\n✅ Seed concluído!\n');
  console.log(
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  );
  console.log('UTILIZADORES DE TESTE');
  console.log(
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  );
  console.log(
    'Admin                admin@softinsa.com              Admin@1234',
  );
  console.log(
    '─── MANAGERS ────────────────────────────────────────────────────────────',
  );
  console.log(
    'Manager Cloud        manager.cloud@softinsa.com      Manager@1234  (HYBRID_CLOUD)',
  );
  console.log(
    'Manager Data         manager.data@softinsa.com       Manager@1234  (DATA)',
  );
  console.log(
    'Manager STM          manager.stm@softinsa.com        Manager@1234  (SOURCING)',
  );
  console.log(
    '─── HYBRID CLOUD — 5 membros ────────────────────────────────────────────',
  );
  console.log(
    'João Silva           joao.silva@softinsa.com         User@1234  junior · cert s/ expiração',
  );
  console.log(
    'Pedro Alves          pedro.alves@softinsa.com        User@1234  intermedio · cert ⚠ WARNING Mai 18',
  );
  console.log(
    'Inês Monteiro        ines.monteiro@softinsa.com      User@1234  senior · cert ℹ INFO Jun 17',
  );
  console.log(
    'Miguel Santos        miguel.santos@softinsa.com      User@1234  junior · ⛔ SEM FORMAÇÕES',
  );
  console.log(
    'Beatriz Fonseca      beatriz.fonseca@softinsa.com    User@1234  especialista · cert 🔴 CRÍTICO Abr 23',
  );
  console.log(
    '─── DATA — 4 membros ────────────────────────────────────────────────────',
  );
  console.log(
    'Maria Costa          maria.costa@softinsa.com        User@1234  intermedio',
  );
  console.log(
    'Luís Tavares         luis.tavares@softinsa.com       User@1234  senior · cert s/ expiração',
  );
  console.log(
    'Catarina Neves       catarina.neves@softinsa.com     User@1234  junior · cert s/ expiração',
  );
  console.log(
    'André Pinto          andre.pinto@softinsa.com        User@1234  intermedio · ⛔ SEM FORMAÇÕES',
  );
  console.log(
    '─── APPLICATION OPERATIONS — 3 membros ─────────────────────────────────',
  );
  console.log(
    'Rui Ferreira         rui.ferreira@softinsa.com       User@1234  senior',
  );
  console.log(
    'Daniela Ferraz       daniela.ferraz@softinsa.com     User@1234  intermedio',
  );
  console.log(
    'Gonçalo Silva        goncalo.silva@softinsa.com      User@1234  junior · ⛔ INATIVO 17 meses',
  );
  console.log(
    '─── BUSINESS APPLICATIONS — 3 membros ──────────────────────────────────',
  );
  console.log(
    'Sofia Lopes          sofia.lopes@softinsa.com        User@1234  intermedio',
  );
  console.log(
    'Ricardo Matos        ricardo.matos@softinsa.com      User@1234  senior · cert 🔴 CRÍTICO Abr 23',
  );
  console.log(
    'Marta Vieira         marta.vieira@softinsa.com       User@1234  junior · cert s/ expiração',
  );
  console.log(
    '─── SOURCING & TALENT MANAGEMENT — 1 membro ────────────────────────────',
  );
  console.log(
    'Paulo Rodrigues      paulo.rodrigues@softinsa.com    User@1234  intermedio',
  );
  console.log(
    '─── OUTRO ───────────────────────────────────────────────────────────────',
  );
  console.log(
    'Utilizador Novo      novo@softinsa.com               User@1234  onboarding pendente',
  );
  console.log(
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  );
}

main()
  .catch((e) => {
    console.error('Seed falhou:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
