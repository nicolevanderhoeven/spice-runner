/**
 * T-Rex Runner Game Instrumentation with Grafana Faro
 * 
 * This script instruments the T-Rex game to track:
 * - Game sessions
 * - Player actions (jumps, ducks)
 * - Collisions
 * - Scores
 * - Performance metrics
 */

(function() {
  'use strict';

  console.log('🎮 Instrumenting T-Rex Runner with Faro...');

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
    let currentSessionId = null;
    let sessionStartTime = null;

    // Track game initialization
    const originalInit = window.Runner.prototype.init;
    window.Runner.prototype.init = function() {
      currentSessionId = Date.now().toString();
      sessionStartTime = Date.now();
      
      faro.api.pushEvent('game_session_start', {
        sessionId: currentSessionId,
        timestamp: sessionStartTime
      });

      console.log('🎮 Game session started:', currentSessionId);
      return originalInit.apply(this, arguments);
    };

    // Track game start
    const originalPlayIntro = window.Runner.prototype.playIntro;
    window.Runner.prototype.playIntro = function() {
      faro.api.pushEvent('game_start', {
        sessionId: currentSessionId,
        timestamp: Date.now()
      });

      console.log('▶️ Game started');
      return originalPlayIntro.apply(this, arguments);
    };

    // Track player jumps
    const originalOnKeyDown = window.Runner.prototype.onKeyDown;
    window.Runner.prototype.onKeyDown = function(e) {
      const result = originalOnKeyDown.apply(this, arguments);
      
      if (e.keyCode === 38 || e.keyCode === 32) { // Up arrow or Space
        faro.api.pushEvent('player_jump', {
          sessionId: currentSessionId,
          score: this.distanceRan ? Math.floor(this.distanceRan) : 0,
          timestamp: Date.now()
        });
      }

      return result;
    };

    // Track collisions and game over
    const originalGameOver = window.Runner.prototype.gameOver;
    window.Runner.prototype.gameOver = function() {
      const finalScore = this.distanceRan ? Math.floor(this.distanceRan) : 0;
      const sessionDuration = Date.now() - sessionStartTime;

      faro.api.pushEvent('game_collision', {
        sessionId: currentSessionId,
        score: finalScore,
        timestamp: Date.now()
      });

      faro.api.pushEvent('game_over', {
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
      const score = Math.floor(distance);
      
      faro.api.pushEvent('high_score', {
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
      // Log previous session end
      if (currentSessionId) {
        faro.api.pushEvent('game_session_end', {
          sessionId: currentSessionId,
          timestamp: Date.now()
        });
      }

      // Start new session
      currentSessionId = Date.now().toString();
      sessionStartTime = Date.now();
      
      faro.api.pushEvent('game_restart', {
        sessionId: currentSessionId,
        timestamp: Date.now()
      });

      console.log('🔄 Game restarted, new session:', currentSessionId);
      return originalRestart.apply(this, arguments);
    };

    console.log('✅ T-Rex Runner instrumented with Faro');
  });
})();

