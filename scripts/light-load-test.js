import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics
const successRate = new Rate('successful_requests');
const pageLoadTime = new Trend('page_load_time');
const errorCount = new Counter('error_count');

// Test configuration - Light load test
export const options = {
  // Ramp up to 50 VUs over 1 minute, then immediately end
  stages: [
    { duration: '1m', target: 50 },   // Ramp up to 50 VUs over 1 minute
    { duration: '0s', target: 0 },    // End immediately
  ],

  // Thresholds define success criteria
  thresholds: {
    http_req_duration: ['p(95)<1000'], // 95% under 1 second
    http_req_failed: ['rate<0.10'],    // Error rate under 10%
    successful_requests: ['rate>0.90'], // Success rate over 90%
  },
};

// Get base URL from environment variable or use default
const BASE_URL = __ENV.SERVICE_URL || 'http://localhost:8080';

export default function () {
  // Each VU simulates one game session
  const mainPageResponse = http.get(`${BASE_URL}/spice/`);
  
  const mainPageSuccess = check(mainPageResponse, {
    'main page status is 200': (r) => r.status === 200,
    'main page loads in < 1s': (r) => r.timings.duration < 1000,
    'main page has content': (r) => r.body.length > 0,
  });

  successRate.add(mainPageSuccess);
  pageLoadTime.add(mainPageResponse.timings.duration);
  
  if (!mainPageSuccess) {
    errorCount.add(1);
    console.error(`Main page failed: ${mainPageResponse.status}`);
  }

  // Load one critical asset to simulate actual game session start
  const runnerResponse = http.get(`${BASE_URL}/spice/scripts/runner.js`);
  
  const runnerSuccess = check(runnerResponse, {
    'runner.js status is 200': (r) => r.status === 200,
  });

  successRate.add(runnerSuccess);
  
  if (!runnerSuccess) {
    errorCount.add(1);
  }

  // Small sleep to simulate realistic page load timing
  sleep(1);
}

// Setup function - runs once at the start
export function setup() {
  console.log(`Starting LIGHT load test against ${BASE_URL}`);
  console.log('Test profile:');
  console.log('  - Duration: 1 minute');
  console.log('  - Target: 50 concurrent game sessions');
  console.log('  - Expected pods: 2-4 pods should be sufficient');
  console.log('');
  console.log('Monitor with:');
  console.log('  kubectl get hpa -n default --watch');
  console.log('  kubectl get pods -n default -l app=spice-runner --watch');
  console.log('');
  
  // Verify the service is accessible
  const response = http.get(`${BASE_URL}/spice/`);
  if (response.status !== 200) {
    throw new Error(`Service not accessible at ${BASE_URL} (status: ${response.status})`);
  }
  
  console.log('✓ Service is accessible. Starting light load test...\n');
  return { startTime: new Date().toISOString() };
}

// Teardown function - runs once at the end
export function teardown(data) {
  console.log('\n========================================');
  console.log('Light load test complete!');
  console.log(`Started at: ${data.startTime}`);
  console.log(`Ended at: ${new Date().toISOString()}`);
  console.log('========================================');
  console.log('\nNext steps:');
  console.log('1. Check scaling events:');
  console.log('   kubectl describe hpa -n default');
  console.log('');
  console.log('2. View current pods:');
  console.log('   kubectl get pods -n default -l app=spice-runner');
  console.log('');
  console.log('3. Monitor scale-down (takes ~5 minutes):');
  console.log('   watch kubectl get pods -n default -l app=spice-runner');
  console.log('');
}

