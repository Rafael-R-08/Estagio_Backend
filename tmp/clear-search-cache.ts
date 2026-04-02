import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando limpeza da cache da base de dados...');
  
  // Encontrar o ID da plataforma Microsoft Learn
  const platform = await prisma.learningPlatform.findFirst({
    where: { name: { contains: 'Microsoft Learn', mode: 'insensitive' } }
  });

  if (!platform) {
    console.error('Plataforma "Microsoft Learn" não encontrada.');
    return;
  }

  const deleted = await prisma.course.deleteMany({
    where: { platformId: platform.id }
  });

  console.log(`Limpeza concluída! ${deleted.count} cursos da Microsoft Learn removidos da cache.`);
}

main()
  .catch((e) => {
    console.error('Erro ao limpar cache:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
