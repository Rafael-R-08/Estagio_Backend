import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Verificando os últimos cursos inseridos na cache da Microsoft Learn...');
  
  const platform = await prisma.learningPlatform.findFirst({
    where: { name: { contains: 'Microsoft Learn', mode: 'insensitive' } }
  });

  if (!platform) {
    console.error('Plataforma Microsoft Learn não encontrada.');
    return;
  }

  const courses = await prisma.course.findMany({
    where: { platformId: platform.id },
    orderBy: { lastUpdated: 'desc' },
    take: 5,
    select: {
      title: true,
      level: true,
      durationHours: true,
      language: true,
      lastUpdated: true,
      description: true
    }
  });

  if (courses.length === 0) {
    console.log('Nenhum curso encontrado na cache para esta plataforma.');
    return;
  }

  courses.forEach((c, i) => {
    console.log(`\n[${i + 1}] ${c.title}`);
    console.log(`- Nível: ${c.level || 'NULL'}`);
    console.log(`- Duração: ${c.durationHours || 'NULL'}h`);
    console.log(`- Idioma: ${c.language || 'NULL'}`);
    console.log(`- Descrição (primeiros 50 chars): ${c.description?.slice(0, 50)}...`);
  });
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
