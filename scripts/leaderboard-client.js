/**
 * Leaderboard Client
 * 
 * Handles player name capture and score submission to the leaderboard API
 * Shows modal AFTER game ends and ONLY for scores > 1000
 */

(function() {
  'use strict';

  console.log('🏆 Initializing Leaderboard Client...');

  // Configuration
  const LEADERBOARD_API_URL = window.location.origin.includes('localhost') 
    ? 'http://localhost:8080'
    : '/spice/leaderboard';  // Proxied through ingress in production
  
  const SCORE_THRESHOLD = 1000; // Only show leaderboard for scores above this

  let playerName = null;
  let pendingSubmission = null; // Store score and sessionId while waiting for name

  // Setup modal handlers on page load
  window.addEventListener('load', function() {
    const modal = document.getElementById('player-name-modal');
    const input = document.getElementById('player-name-input');
    const startBtn = document.getElementById('start-game-btn');

    // Try to load saved player name from localStorage
    const savedName = localStorage.getItem('spice-runner-player-name');
    if (savedName) {
      input.value = savedName;
      playerName = savedName; // Pre-set for auto-submit
    }

    // Handle submit button click
    startBtn.addEventListener('click', function() {
      playerName = input.value.trim() || 'Anonymous';
      
      // Save to localStorage
      localStorage.setItem('spice-runner-player-name', playerName);
      
      // Hide modal
      modal.classList.remove('active');
      
      console.log('🎮 Player name set:', playerName);
      
      // If there's a pending submission, submit it now
      if (pendingSubmission) {
        submitScoreNow(pendingSubmission.score, pendingSubmission.sessionId);
        pendingSubmission = null;
      }
    });

    // Allow Enter key to submit
    input.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        startBtn.click();
      }
    });

    // Update button text
    startBtn.textContent = 'SUBMIT SCORE';
    
    // Update heading for post-game context
    const heading = modal.querySelector('h2');
    const subtext = modal.querySelector('p');
    
    // We'll update these dynamically when showing the modal
  });

  // Show modal and prompt for name (only for scores > threshold)
  function promptForName(score, sessionId) {
    // Check score threshold
    if (score <= SCORE_THRESHOLD) {
      console.log(`📊 Score ${score} below threshold (${SCORE_THRESHOLD}), skipping leaderboard`);
      return;
    }

    const modal = document.getElementById('player-name-modal');
    const input = document.getElementById('player-name-input');
    const heading = modal.querySelector('h2');
    const subtext = modal.querySelector('p[style*="margin-bottom"]');

    // Update modal text for post-game
    heading.textContent = `🏆 HIGH SCORE: ${score}! 🏆`;
    subtext.textContent = 'Enter your name for the leaderboard:';

    // Store submission details
    pendingSubmission = { score, sessionId };

    // If we have a saved name, auto-submit
    if (playerName) {
      console.log('🎮 Using saved name:', playerName);
      submitScoreNow(score, sessionId);
      return;
    }

    // Show modal for name input
    modal.classList.add('active');
    input.focus();
    console.log('📝 Prompting player for name...');
  }

  // Actually submit the score to the API
  async function submitScoreNow(score, sessionId) {
    if (!playerName) {
      playerName = 'Anonymous';
    }

    console.log('📤 Submitting score to leaderboard:', { playerName, score, sessionId });

    try {
      // Send score with trace context propagation
      const response = await fetch(`${LEADERBOARD_API_URL}/api/scores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Propagate trace context if available (for distributed tracing)
          ...(window.faroInstance && window.faroInstance.api.getTraceContext 
            ? { 'traceparent': window.faroInstance.api.getTraceContext() }
            : {})
        },
        body: JSON.stringify({
          playerName: playerName,
          score: score,
          sessionId: sessionId
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ Score submitted successfully:', result);
      
      // Show rank to player
      if (result.rank) {
        console.log(`🏆 Your rank: #${result.rank}`);
        
        // Push event to Faro for tracking
        if (window.faroInstance) {
          window.faroInstance.api.pushEvent('score_submitted_to_leaderboard', {
            playerName: playerName,
            score: score,
            rank: result.rank,
            sessionId: sessionId
          });
        }
      }

      return result;
    } catch (error) {
      console.error('❌ Failed to submit score:', error);
      
      // Track error in Faro
      if (window.faroInstance) {
        window.faroInstance.api.pushError(error);
      }
      
      throw error;
    }
  }

  // Expose API for game instrumentation
  window.leaderboardClient = {
    getPlayerName: function() {
      return playerName || 'Anonymous';
    },
    
    // Called by game instrumentation after game over
    handleGameOver: function(score, sessionId) {
      promptForName(score, sessionId);
    },
    
    isReady: function() {
      return true; // Always ready now (no pre-game requirement)
    }
  };

  console.log('✅ Leaderboard Client initialized (post-game mode, threshold: ' + SCORE_THRESHOLD + ')');
})();

