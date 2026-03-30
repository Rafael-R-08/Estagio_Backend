import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const API_URL = 'http://localhost:3000/api';
const LOG_FILE = path.join(process.cwd(), 'logs', `application-${new Date().toISOString().split('T')[0]}.log`);

async function testStreaming() {
    console.log('\n--- TESTANDO STREAMING SSE ---\n');
    try {
        const response = await axios.post(`${API_URL}/ai/chat/stream`, 
            { prompt: 'Olá, em 3 palavras.' },
            { responseType: 'stream' }
        );

        return new Promise((resolve, reject) => {
            let chunkCount = 0;
            response.data.on('data', (chunk: Buffer) => {
                const text = chunk.toString();
                if (text.includes('data:')) {
                    chunkCount++;
                    process.stdout.write('.');
                }
            });

            response.data.on('end', () => {
                console.log(`\n✓ Stream concluído. Recebidos ${chunkCount} chunks.`);
                resolve(true);
            });

            response.data.on('error', (err: any) => reject(err));
        });
    } catch (error: any) {
        console.error('❌ Falha no teste de streaming:', error.message);
        return false;
    }
}

async function testLogging() {
    console.log('\n--- TESTANDO LOGS ESTRUTURADOS ---\n');
    try {
        // Faz uma chamada normal para gerar log de tokens
        await axios.post(`${API_URL}/ai/generate`, { prompt: 'Teste de log' });
        
        // Aguarda um pouco para o winston gravar
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (fs.existsSync(LOG_FILE)) {
            const content = fs.readFileSync(LOG_FILE, 'utf8');
            const lines = content.trim().split('\n');
            const lastLog = JSON.parse(lines[lines.length - 1]);

            if (lastLog.message === 'Groq API Usage' && lastLog.prompt_tokens) {
                console.log('✓ Log JSON detectado com sucesso.');
                console.log(`  - Modelo: ${lastLog.model}`);
                console.log(`  - Tokens: ${lastLog.total_tokens}`);
                console.log(`  - Latência: ${lastLog.latency_ms}ms`);
                return true;
            }
        }
        console.error('❌ Log esperado não encontrado ou formato incorreto.');
        return false;
    } catch (error: any) {
        console.error('❌ Falha no teste de logging:', error.message);
        return false;
    }
}

async function runTests() {
    const streamOk = await testStreaming();
    const logOk = await testLogging();

    if (streamOk && logOk) {
        console.log('\n✅ TODOS OS TESTES PASSARAM COM SUCESSO!\n');
    } else {
        console.log('\n❌ ALGUNS TESTES FALHARAM.\n');
        process.exit(1);
    }
}

runTests();
