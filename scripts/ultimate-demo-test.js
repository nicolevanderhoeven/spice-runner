import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

// Custom metrics
const successRate = new Rate('successful_requests');
const errorCount = new Counter('error_count');
const requestDuration = new Trend('request_duration');

// 🔥 ULTIMATE DEMO TEST - MASSIVE SCALING 🔥
// Designed to push KEDA to maximum and trigger 10+ nodes
export const options = {
  stages: [
    { duration: '1m', target: 300 },     // Quick ramp to 300 VUs
    { duration: '1m', target: 800 },     // Aggressive ramp to 800 VUs
    { duration: '3m', target: 1200 },    // Push to 1200 VUs
    { duration: '5m', target: 1500 },    // MAXIMUM: 1500 VUs
    { duration: '2m', target: 1000 },    // Gradual decrease
    { duration: '1m', target: 500 },     // Continue down
    { duration: '1m', target: 0 },       // Complete ramp down
  ],

  thresholds: {
    http_req_duration: ['p(95)<5000'],   // Very lenient - expect high latency
    http_req_failed: ['rate<0.25'],      // Allow up to 25% failures under extreme load
    successful_requests: ['rate>0.75'],  // Success rate over 75%
  },
};

const BASE_URL = __ENV.SERVICE_URL || 'http://localhost:8080';

export default function () {
  // Make multiple requests to maximize load
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

  sleep(0.1); // Very short sleep = maximum requests per second
}

export function setup() {
  console.log('========================================');
  console.log('🔥 ULTIMATE DEMO - EXTREME SCALING TEST');
  console.log('========================================');
  console.log(`Target: ${BASE_URL}`);
  console.log('Duration: ~14 minutes');
  console.log('');
  console.log('⚡ EXTREME LOAD PROFILE:');
  console.log('  - 1m:  Ramp to 300 VUs');
  console.log('  - 1m:  Ramp to 800 VUs');
  console.log('  - 3m:  Ramp to 1200 VUs');
  console.log('  - 5m:  HOLD AT 1500 VUs (MAXIMUM PRESSURE)');
  console.log('  - 4m:  Gradual ramp down');
  console.log('');
  console.log('🎯 EXPECTED KUBERNETES BEHAVIOR:');
  console.log('  ✓ Pods: 3 → 100-150 pods');
  console.log('  ✓ Nodes: 3 → 10-12 nodes');
  console.log('  ✓ Scale-up: Continuous over 5-10 minutes');
  console.log('  ✓ CPU will spike to 30%+ threshold');
  console.log('  ✓ HTTP requests will MASSIVELY exceed 10 req/s threshold');
  console.log('  ✓ Dramatic cluster growth!');
  console.log('');
  console.log('📊 MONITORING:');
  console.log('  watch -n 2 "kubectl get nodes | wc -l && kubectl get pods -l app=spice-runner | wc -l"');
  console.log('');
  
  // Verify service is accessible
  const response = http.get(`${BASE_URL}/spice/`);
  if (response.status !== 200) {
    throw new Error(`Service not accessible at ${BASE_URL} (status: ${response.status})`);
  }
  
  console.log('✅ Service is accessible. Starting ULTIMATE DEMO TEST...\n');
  console.log('🍿 Grab popcorn and watch the cluster scale! 🍿\n');
  return { startTime: new Date().toISOString() };
}

export function teardown(data) {
  console.log('\n========================================');
  console.log('🎉 ULTIMATE DEMO TEST COMPLETE!');
  console.log('========================================');
  console.log(`Started: ${data.startTime}`);
  console.log(`Ended: ${new Date().toISOString()}`);
  console.log('');
  console.log('📊 CHECK YOUR CLUSTER:');
  console.log('');
  console.log('1. Node count:');
  console.log('   kubectl get nodes');
  console.log('');
  console.log('2. Pod count:');
  console.log('   kubectl get pods -l app=spice-runner -n default | wc -l');
  console.log('');
  console.log('3. Scaling events:');
  console.log('   kubectl describe scaledobject spice-runner-keda -n default');
  console.log('');
  console.log('4. Watch scale-down (will take 2-10 minutes):');
  console.log('   watch "kubectl get nodes && echo && kubectl get pods -l app=spice-runner"');
  console.log('');
  console.log('💰 Cost reminder: Scale down when demo is done!');
  console.log('');
}

