import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

// Custom metrics
const successRate = new Rate('successful_requests');
const errorCount = new Counter('error_count');
const requestDuration = new Trend('request_duration');

// MEGA SPIKE TEST - Designed to force KEDA to scale aggressively
export const options = {
  stages: [
    { duration: '30s', target: 100 },    // Warm up to 100 VUs
    { duration: '30s', target: 300 },    // Spike to 300 VUs
    { duration: '2m', target: 500 },     // Ramp to 500 VUs
    { duration: '2m', target: 500 },     // Hold at 500 VUs (sustained high load)
    { duration: '1m', target: 200 },     // Ramp down to 200
    { duration: '30s', target: 0 },      // Quick ramp down to 0
  ],

  thresholds: {
    http_req_duration: ['p(95)<3000'],   // Lenient - allow slower response under load
    http_req_failed: ['rate<0.15'],      // Allow up to 15% failures under extreme load
    successful_requests: ['rate>0.85'],  // Success rate over 85%
  },
};

const BASE_URL = __ENV.SERVICE_URL || 'http://localhost:8080';

export default function () {
  // Make multiple requests to increase load
  const batch = http.batch([
    ['GET', `${BASE_URL}/spice/`],
    ['GET', `${BASE_URL}/spice/scripts/runner.js`],
    ['GET', `${BASE_URL}/spice/img/favicon.ico`],
  ]);
  
  batch.forEach((response) => {
    const success = check(response, {
      'status is 200': (r) => r.status === 200,
    });
    
    successRate.add(success);
    requestDuration.add(response.timings.duration);
    
    if (!success) {
      errorCount.add(1);
    }
  });

  sleep(0.2); // Very short sleep = more requests per second
}

export function setup() {
  console.log('========================================');
  console.log('🚀 MEGA SPIKE TEST - AGGRESSIVE SCALING');
  console.log('========================================');
  console.log(`Target: ${BASE_URL}`);
  console.log('Duration: ~6.5 minutes');
  console.log('');
  console.log('Load Profile:');
  console.log('  - 30s: Ramp to 100 VUs (warm up)');
  console.log('  - 30s: Spike to 300 VUs (first wave)');
  console.log('  - 2m:  Ramp to 500 VUs (sustained pressure)');
  console.log('  - 2m:  Hold 500 VUs (peak load)');
  console.log('  - 1m:  Ramp down to 200 VUs');
  console.log('  - 30s: Ramp to 0 VUs');
  console.log('');
  console.log('Expected KEDA Behavior:');
  console.log('  ✓ Pods should scale from 1 → 6-10');
  console.log('  ✓ CPU will spike (50%+ threshold)');
  console.log('  ✓ HTTP requests will exceed 20 req/s threshold');
  console.log('  ✓ Scale-up should happen in 30-60 seconds');
  console.log('  ✓ Scale-down will occur 2 minutes after test ends');
  console.log('');
  
  // Verify service is accessible
  const response = http.get(`${BASE_URL}/spice/`);
  if (response.status !== 200) {
    throw new Error(`Service not accessible at ${BASE_URL} (status: ${response.status})`);
  }
  
  console.log('✅ Service is accessible. Starting MEGA SPIKE TEST...\n');
  return { startTime: new Date().toISOString() };
}

export function teardown(data) {
  console.log('\n========================================');
  console.log('🎉 MEGA SPIKE TEST COMPLETE!');
  console.log('========================================');
  console.log(`Started: ${data.startTime}`);
  console.log(`Ended: ${new Date().toISOString()}`);
  console.log('');
  console.log('Next Steps:');
  console.log('1. Check current pod count:');
  console.log('   kubectl get pods -l app=spice-runner -n default');
  console.log('');
  console.log('2. View scaling events:');
  console.log('   kubectl describe scaledobject spice-runner-keda -n default');
  console.log('');
  console.log('3. Monitor scale-down (takes ~2 minutes):');
  console.log('   watch kubectl get pods -l app=spice-runner -n default');
  console.log('');
  console.log('4. Check node count:');
  console.log('   kubectl get nodes');
  console.log('');
}





