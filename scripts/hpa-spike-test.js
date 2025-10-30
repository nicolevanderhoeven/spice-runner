import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';

// Custom metrics
const successRate = new Rate('successful_requests');
const errorCount = new Counter('error_count');

// Aggressive spike test to quickly trigger HPA
export const options = {
  stages: [
    { duration: '30s', target: 100 },  // Quick ramp to 100 VUs
    { duration: '2m', target: 150 },   // Increase to 150 VUs
    { duration: '2m', target: 150 },   // Hold at 150 VUs
    { duration: '30s', target: 0 },    // Quick ramp down
  ],

  thresholds: {
    http_req_duration: ['p(95)<1000'], // More lenient during spike
    http_req_failed: ['rate<0.10'],    // Allow up to 10% errors during spike
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
  console.log('HPA SPIKE TEST');
  console.log('========================================');
  console.log(`Target: ${BASE_URL}`);
  console.log('Duration: ~5 minutes');
  console.log('This test will aggressively spike load to trigger fast HPA scaling');
  console.log('');
  console.log('Expected behavior:');
  console.log('  - Rapid CPU/Memory increase');
  console.log('  - HPA should trigger scale-up within 60-90 seconds');
  console.log('  - Pods should scale from 2 to 6-10');
  console.log('');
}

export function teardown(data) {
  console.log('\nSpike test complete!');
  console.log('HPA should now begin scale-down (takes ~5 minutes)');
}

