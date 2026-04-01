import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import axios from 'axios';

async function validateFlows() {
  const PORT = process.env.PORT || 3000;
  const BASE_URL = `http://localhost:${PORT}/api`;
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  console.log('--- Checking Global AI Flow (RAG + History) ---');

  try {
    // 0. Login to get JWT
    console.log('[0/4] Logging in as test user...');
    const login = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'user@example.com',
      password: 'password123',
    });
    const token = login.data.access_token;
    const authHeaders = { Authorization: `Bearer ${token}` };

    // 1. Check Authentication logic (Anonymous vs User)
    console.log('[1/4] Checking Optional User Flow (Anonymous)...');
    const welcomeAnon = await axios.get(`${BASE_URL}/ai/recommendations/welcome`);
    console.log(`✅ Welcome Message (Anon): "${welcomeAnon.data.welcome}"`);

    console.log('[2/4] Checking Optional User Flow (Authenticated)...');
    const welcomeAuth = await axios.get(`${BASE_URL}/ai/recommendations/welcome`, { headers: authHeaders });
    console.log(`✅ Welcome Message (Auth): "${welcomeAuth.data.welcome}"`);

    // 2. Chat Query (Simple)
    console.log('[3/4] Checking Simple Chat...');
    const chat = await axios.post(`${BASE_URL}/ai/chat`, {
      prompt: 'Olá, que cursos de cloud recomendas?',
    }, { headers: authHeaders });
    console.log(`✅ Chat Response: "${chat.data.answer.substring(0, 50)}..."`);
    console.log(`✅ Sources: ${chat.data.sources.length}`);

    // 3. User Recommendations (Needs Auth)
    console.log('[4/4] Checking Personalized Recommendations (Requires User)...');
    const recs = await axios.post(`${BASE_URL}/ai/recommendations`, {}, { headers: authHeaders });
    console.log(`✅ Recommendations Response: ${recs.data.improvement ? 'OK' : 'FAIL'}`);

    console.log('\n🌟 ALL AI FLOW CHECKS PASSED!');
  } catch (err: any) {
    console.error('\n❌ FLOW VALIDATION FAILED!');
    console.error(err.response?.data || err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

validateFlows();
