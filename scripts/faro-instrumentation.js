/**
 * Spice Runner Game Instrumentation with Grafana Faro
 * 
 * This script instruments the Spice Runner game to track:
 * - Game sessions
 * - Player actions (jumps, ducks)
 * - Collisions
 * - Scores
 * - Performance metrics
 */

(function() {
  'use strict';

  console.log('🎮 Instrumenting Spice Runner with Faro...');

  // Wait for both Faro and the game to be ready
  function waitForDependencies() {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (window.faroInstance && typeof window.Runner !== 'undefined') {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  waitForDependencies().then(() => {
    const faro = window.faroInstance;
    // Use the globally-set sessionId from faro-init.js
    // This ensures consistency across all events from page load onwards
    let currentSessionId = window.gameSessionId;
    let sessionStartTime = null;

    // Defensive check: Log error if sessionId is null
    if (!currentSessionId) {
      console.error('❌ CRITICAL: sessionId is null! This should never happen.');
      console.error('   Check that faro-init.js ran before faro-instrumentation.js');
      console.error('   window.gameSessionId =', window.gameSessionId);
    }

    // Helper function to safely push events with sessionId validation
    function safePushEvent(eventName, eventData) {
      if (!currentSessionId) {
        console.error(`❌ Cannot push event '${eventName}': sessionId is null!`, eventData);
        return;
      }
      faro.api.pushEvent(eventName, eventData);
    }

    // Track game initialization
    const originalInit = window.Runner.prototype.init;
    window.Runner.prototype.init = function() {
      // Use existing sessionId (set at page load), don't create a new one
      sessionStartTime = Date.now();
      
      safePushEvent('game_session_start', {
        sessionId: currentSessionId,
        timestamp: sessionStartTime
      });

      console.log('🎮 Game session started:', currentSessionId);
      return originalInit.apply(this, arguments);
    };

    // Track game start
    const originalPlayIntro = window.Runner.prototype.playIntro;
    window.Runner.prototype.playIntro = function() {
      safePushEvent('game_start', {
        sessionId: currentSessionId,
        timestamp: Date.now()
      });

      console.log('▶️ Game started');
      return originalPlayIntro.apply(this, arguments);
    };

    // Helper function to get the actual displayed score
    function getDisplayedScore(runner) {
      // The game displays the score via distanceMeter.getActualDistance()
      // which divides distanceRan by the coefficient
      if (runner.distanceMeter && runner.distanceMeter.getActualDistance) {
        return Math.floor(runner.distanceMeter.getActualDistance(runner.distanceRan));
      }
      // Fallback: manually calculate (distanceRan is typically 10x the displayed score)
      return runner.distanceRan ? Math.floor(runner.distanceRan / 10) : 0;
    }

    // Track player jumps
    const originalOnKeyDown = window.Runner.prototype.onKeyDown;
    window.Runner.prototype.onKeyDown = function(e) {
      const result = originalOnKeyDown.apply(this, arguments);
      
      if (e.keyCode === 38 || e.keyCode === 32) { // Up arrow or Space
        safePushEvent('player_jump', {
          sessionId: currentSessionId,
          score: getDisplayedScore(this),
          timestamp: Date.now()
        });
      }

      return result;
    };

    // Track collisions and game over
    const originalGameOver = window.Runner.prototype.gameOver;
    window.Runner.prototype.gameOver = function() {
      const finalScore = getDisplayedScore(this);
      const sessionDuration = Date.now() - sessionStartTime;

      safePushEvent('game_collision', {
        sessionId: currentSessionId,
        score: finalScore,
        timestamp: Date.now()
      });

      safePushEvent('game_over', {
        sessionId: currentSessionId,
        finalScore: finalScore,
        sessionDuration: sessionDuration,
        timestamp: Date.now()
      });

      faro.api.pushMeasurement({
        type: 'game_score',
        values: {
          score: finalScore,
          duration: sessionDuration
        }
      });

      console.log('💥 Game over! Final score:', finalScore);
      return originalGameOver.apply(this, arguments);
    };

    // Track high scores
    const originalSetHighScore = window.Runner.prototype.setHighScore;
    window.Runner.prototype.setHighScore = function(distance) {
      // setHighScore receives the already-calculated display score
      const score = Math.floor(distance);
      
      safePushEvent('high_score', {
        sessionId: currentSessionId,
        score: score,
        timestamp: Date.now()
      });

      console.log('🏆 New high score:', score);
      return originalSetHighScore.apply(this, arguments);
    };

    // Track game restarts
    const originalRestart = window.Runner.prototype.restart;
    window.Runner.prototype.restart = function() {
      // Log game restart (but keep same sessionId for the page session)
      sessionStartTime = Date.now();
      
      safePushEvent('game_restart', {
        sessionId: currentSessionId,
        timestamp: Date.now()
      });

      console.log('🔄 Game restarted, session:', currentSessionId);
      return originalRestart.apply(this, arguments);
    };

    console.log('✅ Spice Runner instrumented with Faro');
  });
})();

