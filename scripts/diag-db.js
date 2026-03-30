const { Client } = require('pg');

async function test() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  
  console.log('Testing vector insert...');
  try {
    const vector = '[' + Array(3072).fill(0.1).join(',') + ']';
    await client.query(`
      INSERT INTO text_chunks (id, content, embedding, source, metadata, "createdAt", "lastUpdatedAt")
      VALUES (gen_random_uuid(), 'Diagnostic Test', $1::vector, 'RAG_KNOWLEDGE', '{}', NOW(), NOW())
    `, [vector]);
    console.log('SUCCESS: Inserted 1 dummy chunk.');
    
    const count = await client.query('SELECT count(*) FROM text_chunks');
    console.log('Total chunks:', count.rows[0].count);
  } catch (e) {
    console.error('DIAGNOSTIC FAILURE:', e.message);
    if (e.message.includes('dimension')) {
       console.log('DIMENSION MISMATCH DETECTED!');
    }
  } finally {
    await client.end();
  }
}

test();
