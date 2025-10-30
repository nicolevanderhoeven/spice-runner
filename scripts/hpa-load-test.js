import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics
const successRate = new Rate('successful_requests');
const pageLoadTime = new Trend('page_load_time');
const errorCount = new Counter('error_count');

// Test configuration
export const options = {
  // Stages define load profile over time
  stages: [
    { duration: '2m', target: 50 },   // Ramp up to 50 VUs over 2 minutes
    { duration: '5m', target: 100 },  // Increase to 100 VUs and maintain for 5 minutes
    { duration: '3m', target: 200 },  // Spike to 200 VUs for 3 minutes
    { duration: '3m', target: 100 },  // Scale back to 100 VUs
    { duration: '2m', target: 0 },    // Ramp down to 0
  ],

  // Thresholds define success criteria
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% under 500ms, 99% under 1s
    http_req_failed: ['rate<0.05'],                  // Error rate under 5%
    successful_requests: ['rate>0.95'],              // Success rate over 95%
  },

  // Configure external output (optional)
  // Uncomment to send metrics to your monitoring system
  // ext: {
  //   loadimpact: {
  //     projectID: 'YOUR_PROJECT_ID',
  //     name: 'Spice Runner HPA Test'
  //   }
  // }
};

// Get base URL from environment variable or use default
const BASE_URL = __ENV.SERVICE_URL || 'http://localhost:8080';

export default function () {
  // Test the main game page
  const mainPageResponse = http.get(`${BASE_URL}/spice/`);
  
  const mainPageSuccess = check(mainPageResponse, {
    'main page status is 200': (r) => r.status === 200,
    'main page loads in < 500ms': (r) => r.timings.duration < 500,
    'main page has content': (r) => r.body.length > 0,
  });

  successRate.add(mainPageSuccess);
  pageLoadTime.add(mainPageResponse.timings.duration);
  
  if (!mainPageSuccess) {
    errorCount.add(1);
    console.error(`Main page failed: ${mainPageResponse.status}`);
  }

  // Small delay between requests (simulate realistic user behavior)
  sleep(0.5);

  // Test static assets (simulating a real user loading the page)
  const assetTests = [
    { name: 'runner.js', path: '/spice/scripts/runner.js' },
    { name: 'favicon', path: '/spice/img/favicon.ico' },
  ];

  assetTests.forEach(asset => {
    const response = http.get(`${BASE_URL}${asset.path}`);
    
    const assetSuccess = check(response, {
      [`${asset.name} status is 200`]: (r) => r.status === 200,
      [`${asset.name} loads quickly`]: (r) => r.timings.duration < 200,
    });

    successRate.add(assetSuccess);
    
    if (!assetSuccess) {
      errorCount.add(1);
    }
  });

  sleep(1);
}

// Setup function - runs once per VU at the start
export function setup() {
  console.log(`Starting HPA load test against ${BASE_URL}`);
  console.log('Test will run for approximately 15 minutes');
  console.log('Expected behavior:');
  console.log('  - Pods should scale from 2 to ~4-6 during sustained load');
  console.log('  - Pods may reach 10 during spike (200 VUs)');
  console.log('  - Pods should scale down after load decreases');
  console.log('');
  console.log('Monitor with:');
  console.log('  kubectl get hpa spice-runner-hpa -n default --watch');
  console.log('  kubectl get pods -n default -l app=spice-runner --watch');
  console.log('');
  
  // Verify the service is accessible
  const response = http.get(`${BASE_URL}/spice/`);
  if (response.status !== 200) {
    throw new Error(`Service not accessible at ${BASE_URL} (status: ${response.status})`);
  }
  
  console.log('Service is accessible. Starting load test...\n');
  return { startTime: new Date().toISOString() };
}

// Teardown function - runs once at the end
export function teardown(data) {
  console.log('\n========================================');
  console.log('Load test complete!');
  console.log(`Started at: ${data.startTime}`);
  console.log(`Ended at: ${new Date().toISOString()}`);
  console.log('========================================');
  console.log('\nNext steps:');
  console.log('1. Check HPA scaling events:');
  console.log('   kubectl describe hpa spice-runner-hpa -n default');
  console.log('');
  console.log('2. Monitor scale-down (takes ~5 minutes):');
  console.log('   watch kubectl get pods -n default -l app=spice-runner');
  console.log('');
  console.log('3. View pod resource usage:');
  console.log('   kubectl top pods -n default -l app=spice-runner');
  console.log('');
}

