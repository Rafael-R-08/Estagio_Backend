import 'dotenv/config';
import axios from 'axios';
import FormData = require('form-data');
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const API_URL = 'http://localhost:3000/api';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function runTest() {
  console.log('--- TESTANDO PROCESSAMENTO DE PDF EM BACKGROUND (E2E) ---\n');

  try {
    // 0. Login para obter token JWT
    const login = await axios.post(`${API_URL}/auth/login`, {
      email: 'user@example.com',
      password: 'password123',
    });
    const token = login.data.access_token;
    const authHeaders = { Authorization: `Bearer ${token}` };

    // 1. Obter TrainingId do utilizador autenticado
    let training = await prisma.trainingRecord.findFirst({
      where: { userId: login.data.user.id },
      orderBy: { createdAt: 'desc' },
    });

    if (!training) throw new Error('Training record não encontrado. O seed correu?');

    if (training) {
      const existingCert = await prisma.certificate.findUnique({
        where: { trainingId: training.id },
      });

      if (existingCert) {
        training = await prisma.trainingRecord.findFirst({
          where: {
            userId: login.data.user.id,
            certificate: null,
          },
          orderBy: { createdAt: 'desc' },
        });
      }
    }

    if (!training) {
      const platform = await prisma.learningPlatform.findFirst({
        where: { enabled: true },
      });

      training = await prisma.trainingRecord.create({
        data: {
          userId: login.data.user.id,
          platformId: platform?.id,
          title: `Background PDF Test ${Date.now()}`,
          url: 'https://example.com/background-pdf-test',
          status: 'ongoing',
        },
      });
    }
    
    console.log(`✓ Encontrado Training ID: ${training.id}`);

    // 2. Preparar o "PDF"
    const form = new FormData();
    const dummyPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Title (Teste) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
    
    form.append('file', dummyPdf, { filename: 'certificado_bullmq_test.pdf', contentType: 'application/pdf' });
    form.append('trainingId', training.id);
    form.append('courseName', 'BullMQ Background Processing');

    console.log('1. A enviar upload de certificado...');
    const uploadRes = await axios.post(`${API_URL}/certificates`, form, {
      headers: {
        ...form.getHeaders(),
        ...authHeaders,
      },
    });

    const { id: certId, jobId } = uploadRes.data;
    console.log(`✓ Upload aceite. Certificado ID: ${certId}, Job ID: ${jobId}`);

    // 3. Polling do status do Job
    console.log('2. A aguardar processamento (Polling)...');
    let completed = false;
    for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const statusRes = await axios.get(`${API_URL}/certificates/job/${jobId}`, {
          headers: authHeaders,
        });
        const { state, failedReason, result } = statusRes.data;
        
        console.log(`   - Tentativa ${i+1}: Estado = ${state}`);
        
        if (state === 'completed') {
            console.log('\n✅ TESTE PASSOU! O Worker processou o PDF com sucesso.');
            console.log('   Metadados Extraídos:', JSON.stringify(result.extractedMetadata, null, 2));
            completed = true;
            break;
        } else if (state === 'failed') {
            console.log(`\n❌ O JOB FALHOU: ${failedReason}`);
            break;
        }
    }

    if (!completed) console.log('\n⚠️ Timeout ao aguardar o worker.');

  } catch (error: any) {
    console.error('❌ Erro no teste:', error.response?.data || error.message);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

runTest();
