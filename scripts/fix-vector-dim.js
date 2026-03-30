const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/learninghub'
  });
  
  await client.connect();
  console.log('Connected to DB. Altering vector dimensions...');
  
  try {
    // Truncate first to be safe
    await client.query('TRUNCATE TABLE text_chunks;');
    await client.query('TRUNCATE TABLE "Course";');
    
    // Alter column type (using cast)
    await client.query('ALTER TABLE text_chunks ALTER COLUMN embedding TYPE vector(384) USING embedding::vector(384);');
    await client.query('ALTER TABLE "Course" ALTER COLUMN embedding TYPE vector(384) USING embedding::vector(384);');
    
    console.log('Vector dimensions updated to 384.');
  } catch (e) {
    console.error('Error updating dimensions:', e);
  } finally {
    await client.end();
  }
}

main();
