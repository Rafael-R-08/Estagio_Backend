import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const counts = await prisma.course.groupBy({
    by: ['platformId'],
    _count: { id: true },
  });
  const platforms = await prisma.learningPlatform.findMany();
  counts.forEach(c => {
    const p = platforms.find(pl => pl.id === c.platformId);
    console.log(`${p?.name}: ${c._count.id}`);
  });
}
main().catch(console.error).finally(() => prisma.$disconnect());
