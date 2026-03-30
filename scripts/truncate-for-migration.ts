import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  console.log('Truncating tables...');
  try {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE text_chunks CASCADE;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "Course" CASCADE;');
    console.log('Tables truncated successfully.');
  } catch (e) {
    console.error('Error truncating tables:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
