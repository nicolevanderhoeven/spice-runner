/**
 * Telemetry Heartbeat Script
 * 
 * A k6 browser script that plays the Spice Runner game to generate Faro telemetry events.
 * Designed to run periodically (e.g., via cron) to keep dashboard panels populated.
 * 
 * Events generated:
 * - game_session_start: When the game initializes
 * - game_start: When gameplay begins
 * - player_jump: Each time the player jumps
 * - game_collision: When player hits an obstacle
 * - game_over: When the game ends
 * - high_score: If a new high score is achieved
 * 
 * Usage:
 *   k6 run scripts/telemetry-heartbeat.js
 *   
 * With custom URL:
 *   k6 run -e BASE_URL=http://localhost:8080 scripts/telemetry-heartbeat.js
 * 
 * Smoke test (single quick iteration):
 *   k6 run -e SMOKE=true scripts/telemetry-heartbeat.js
 */

import { browser } from 'k6/browser';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'https://nvdh.dev/spice/';
const SMOKE_TEST = __ENV.SMOKE === 'true';
const ROUNDS_PER_ITERATION = SMOKE_TEST ? 1 : 3;

export const options = {
  cloud: {
    projectID: 7131998,
    name: 'Spice Runner Telemetry Heartbeat',
  },
  scenarios: {
    telemetryHeartbeat: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      options: {
        browser: {
          type: 'chromium',
        },
      },
    },
  },
  thresholds: {
    checks: ['rate>0.8'],
  },
};

export default async function () {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log(`🎮 Starting telemetry heartbeat against ${BASE_URL}`);
    console.log(`📊 Will play ${ROUNDS_PER_ITERATION} round(s)`);

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const splashVisible = await page.locator('#splash-screen').isVisible();
    check(splashVisible, {
      'splash screen is visible': (v) => v === true,
    });

    if (splashVisible) {
      console.log('👆 Dismissing splash screen...');
      await page.locator('#start-btn').click();
      await page.waitForSelector('#splash-screen.hidden', { timeout: 5000 });
    }

    // Wait for the Runner to be fully loaded (note: singleton uses instance_ with underscore)
    console.log('⏳ Waiting for game engine to initialize...');
    try {
      await page.waitForFunction(
        () => typeof window.Runner !== 'undefined' && window.Runner.instance_ !== null,
        { timeout: 10000 }
      );
      console.log('✓ Game engine loaded');
    } catch (e) {
      console.log('⚠️ Timeout waiting for Runner, checking state...');
      const runnerState = await page.evaluate(() => ({
        runnerExists: typeof window.Runner !== 'undefined',
        instanceExists: window.Runner?.instance_ !== null,
        instanceActivated: window.Runner?.instance_?.activated
      }));
      console.log('  Runner state:', JSON.stringify(runnerState));
    }
    sleep(0.5);

    // Click on the game area to ensure it has focus (try multiple selectors)
    const clickTargets = ['.runner-canvas', '.runner-container', '#main-frame-error', 'body'];
    for (const selector of clickTargets) {
      try {
        const el = page.locator(selector);
        if (await el.isVisible({ timeout: 1000 })) {
          await el.click();
          console.log(`🎯 Clicked ${selector} for focus`);
          break;
        }
      } catch {
        // Try next selector
      }
    }

    for (let round = 1; round <= ROUNDS_PER_ITERATION; round++) {
      console.log(`\n🎯 Round ${round}/${ROUNDS_PER_ITERATION}`);
      await playOneRound(page, round);
      
      if (round < ROUNDS_PER_ITERATION) {
        sleep(1);
      }
    }

    console.log('\n✅ Telemetry heartbeat complete!');

  } catch (error) {
    console.error('❌ Error during telemetry heartbeat:', error);
    throw error;
  } finally {
    await page.close();
    await context.close();
  }
}

async function playOneRound(page, roundNumber) {
  console.log('  ▶️ Starting game...');
  
  // Start the game by calling onKeyDown directly (note: singleton uses instance_)
  await page.evaluate(() => {
    const runner = window.Runner?.instance_;
    if (runner) {
      const mockEvent = {
        keyCode: 32,
        type: 'keydown',
        preventDefault: () => {},
        target: document.body
      };
      runner.onKeyDown(mockEvent);
    }
  });
  sleep(0.5);
  
  // Check if game started
  let gameActive = await page.evaluate(() => {
    return window.Runner?.instance_?.activated === true;
  });
  
  if (!gameActive) {
    console.log('  🔄 Retrying game start...');
    // Try direct activation as fallback
    await page.evaluate(() => {
      const runner = window.Runner?.instance_;
      if (runner) {
        runner.loadSounds();
        runner.activated = true;
        runner.started = true;
        runner.paused = false;
        if (!runner.raqId) {
          runner.update();
        }
      }
    });
    sleep(0.3);
    
    gameActive = await page.evaluate(() => {
      return window.Runner?.instance_?.activated === true;
    });
  }
  
  check(gameActive, {
    [`round ${roundNumber}: game is active`]: (v) => v === true,
  });

  if (!gameActive) {
    console.log('  ❌ Could not start game, skipping round');
    return;
  }
  
  console.log('  ✓ Game is active');

  const jumpCount = SMOKE_TEST ? 5 : 8 + Math.floor(Math.random() * 5);
  console.log(`  🦘 Performing ${jumpCount} jumps...`);

  for (let i = 0; i < jumpCount; i++) {
    // Call onKeyDown directly on the Runner instance for reliable event handling
    await page.evaluate(() => {
      const runner = window.Runner?.instance_;
      if (runner && !runner.crashed) {
        const mockEvent = {
          keyCode: Math.random() > 0.5 ? 32 : 38,
          type: 'keydown',
          preventDefault: () => {},
          target: document.body
        };
        runner.onKeyDown(mockEvent);
      }
    });
    
    const jumpDelay = 0.4 + Math.random() * 0.3;
    sleep(jumpDelay);
  }

  console.log('  ⏳ Waiting for game over (collision)...');
  const maxWaitTime = SMOKE_TEST ? 20000 : 30000;
  const startTime = Date.now();
  
  // Wait for crash, occasionally jumping
  let crashed = false;
  while (Date.now() - startTime < maxWaitTime) {
    crashed = await page.evaluate(() => {
      return window.Runner?.instance_?.crashed === true;
    });
    
    if (crashed) break;
    
    // Occasional jump to keep game interesting
    if (Math.random() > 0.6) {
      await page.evaluate(() => {
        const runner = window.Runner?.instance_;
        if (runner && !runner.crashed) {
          const mockEvent = {
            keyCode: 32,
            type: 'keydown',
            preventDefault: () => {},
            target: document.body
          };
          runner.onKeyDown(mockEvent);
        }
      });
    }
    
    sleep(0.3);
  }

  check(crashed, {
    [`round ${roundNumber}: game ended (collision detected)`]: (v) => v === true,
  });

  if (crashed) {
    const score = await page.evaluate(() => {
      const runner = window.Runner?.instance_;
      if (runner?.distanceMeter) {
        return Math.floor(runner.distanceMeter.getActualDistance(runner.distanceRan));
      }
      return 0;
    });
    console.log(`  💥 Game over! Score: ${score}`);
    
    // Small delay before potential restart
    sleep(0.5);
  } else {
    console.log('  ⚠️ Game did not crash within timeout');
  }
}

export function setup() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║     Spice Runner Telemetry Heartbeat       ║');
  console.log('╠════════════════════════════════════════════╣');
  console.log(`║ Target URL: ${BASE_URL.padEnd(30)}║`);
  console.log(`║ Rounds: ${ROUNDS_PER_ITERATION}                                   ║`);
  console.log(`║ Mode: ${SMOKE_TEST ? 'Smoke Test' : 'Normal'}                           ║`);
  console.log('╚════════════════════════════════════════════╝');
  console.log('');
  console.log('This script generates Faro telemetry events:');
  console.log('  • game_session_start');
  console.log('  • game_start');
  console.log('  • player_jump');
  console.log('  • game_collision');
  console.log('  • game_over');
  console.log('');
  
  return { startTime: new Date().toISOString() };
}

export function teardown(data) {
  console.log('\n════════════════════════════════════════════');
  console.log('Telemetry heartbeat session complete!');
  console.log(`Started at: ${data.startTime}`);
  console.log(`Ended at: ${new Date().toISOString()}`);
  console.log('════════════════════════════════════════════');
  console.log('\nEvents should now appear in:');
  console.log('  • Grafana Loki (job="faro")');
  console.log('  • Spice Runner Overview Dashboard');
  console.log('');
}
