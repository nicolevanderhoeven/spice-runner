import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';

// Custom metrics
const successRate = new Rate('successful_requests');
const errorCount = new Counter('error_count');

// EXTREME load test - 1000 VUs to push KEDA to maximum
export const options = {
  stages: [
    { duration: '30s', target: 500 },   // Quick ramp to 500 VUs
    { duration: '1m', target: 1000 },   // Ramp to 1000 VUs
    { duration: '3m', target: 1000 },   // Hold at 1000 VUs (sustained extreme load)
    { duration: '1m', target: 500 },    // Ramp down to 500
    { duration: '30s', target: 0 },     // Quick ramp down to 0
  ],

  thresholds: {
    http_req_duration: ['p(95)<2000'], // Very lenient - expect slower response under extreme load
    http_req_failed: ['rate<0.20'],    // Allow up to 20% failures under extreme load
  },
};

const BASE_URL = __ENV.SERVICE_URL || 'http://localhost:8080';

export default function () {
  const response = http.get(`${BASE_URL}/spice/`, {
    timeout: '10s',
  });
  
  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'response time OK': (r) => r.timings.duration < 2000,
  });

  successRate.add(success);
  if (!success) {
    errorCount.add(1);
  }

  sleep(0.3); // Shorter sleep for more aggressive load
}

export function setup() {
  console.log('========================================');
  console.log('EXTREME LOAD TEST - 1000 VUs');
  console.log('========================================');
  console.log(`Target: ${BASE_URL}`);
  console.log('Duration: ~6 minutes');
  console.log('This test will generate EXTREME load to push KEDA to maximum scaling');
  console.log('');
  console.log('Load Profile:');
  console.log('  - Ramp to 500 VUs in 30s');
  console.log('  - Ramp to 1000 VUs in 1m');
  console.log('  - Hold 1000 VUs for 3m (sustained extreme load)');
  console.log('  - Gradual ramp down');
  console.log('');
  console.log('Expected behavior:');
  console.log('  - EXTREME CPU/Memory/Traffic increase');
  console.log('  - KEDA should scale to 8-10 pods (maximum)');
  console.log('  - Response times may increase significantly under load');
  console.log('');
}

export function teardown(data) {
  console.log('\n========================================');
  console.log('EXTREME LOAD TEST COMPLETE!');
  console.log('========================================');
  console.log('KEDA should now begin scale-down (takes ~5 minutes)');
  console.log('Expect to see pods gradually reduce from 8-10 back to 1');
}

