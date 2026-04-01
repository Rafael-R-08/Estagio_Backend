import axios from 'axios';
import 'dotenv/config';

async function testEndpoints() {
  const PORT = process.env.PORT || 3000;
  const BASE_URL = `http://localhost:${PORT}/api`;

  const endpoints = [
    { method: 'GET', url: '/ai/health' },
    { method: 'GET', url: '/ai/recommendations/welcome' },
    { method: 'POST', url: '/analysis/course' },
    { method: 'POST', url: '/analysis/batch' },
    { method: 'GET', url: '/ai/indexing-stats' },
  ];

  console.log('--- Testing AI Endpoints Status ---');
  let failures = 0;

  for (const endpoint of endpoints) {
    try {
      if (endpoint.method === 'GET') {
        const response = await axios.get(`${BASE_URL}${endpoint.url}`);
        console.log(`✅ ${endpoint.method} ${endpoint.url} - Status: ${response.status}`);
      } else {
        const response = await axios.post(`${BASE_URL}${endpoint.url}`, {});
        console.log(`✅ ${endpoint.method} ${endpoint.url} - Status: ${response.status}`);
      }
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 404 || status >= 500) {
        console.log(`❌ ${endpoint.method} ${endpoint.url} - Status: ${status || 'ERR'}`);
        failures++;
      } else {
        console.log(`ℹ️ ${endpoint.method} ${endpoint.url} - Status: ${status || 'ERR'} (Expected if protected)`);
      }
    }
  }

  // Check for Job Status (dangerous public endpoints)
  console.log('--- Checking Sensitive Endpoints Accessibility ---');
  try {
    const jobStatus = await axios.get(`${BASE_URL}/certificates/job/test-id`);
    console.log(`⚠️  GET /certificates/job/test-id - Open: ${jobStatus.status}`);
    failures++;
  } catch (err: any) {
    console.log(`🔒 GET /certificates/job/test-id - Secured: ${err.response?.status}`);
  }

  if (failures > 0) {
    console.error(`\n❌ ENDPOINT TESTING FAILED with ${failures} errors!`);
    process.exit(1);
  }
}

testEndpoints();
