/**
 * Game Session Metrics Heartbeat
 * 
 * This script sends periodic heartbeat events via Faro to indicate
 * an active game session. These events are converted to Prometheus
 * metrics by Alloy for autoscaling purposes.
 */

(function() {
  'use strict';

  console.log('🔧 Initializing Game Session Metrics...');

  // Wait for Faro to be ready
  function waitForFaro() {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (window.faroInstance) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  waitForFaro().then(() => {
    const faro = window.faroInstance;
    let isGameActive = false;
    let heartbeatInterval = null;

    // Function to send heartbeat event
    function sendHeartbeat() {
      if (isGameActive) {
        faro.api.pushEvent('game_session_heartbeat', {
          sessionId: window.gameSessionId,
          timestamp: Date.now(),
          status: 'active'
        });
        console.log('💓 Game session heartbeat sent');
      }
    }

    // Store the game active state globally so instrumentation can update it
    window.gameMetrics = {
      setActive: function() {
        if (!isGameActive) {
          isGameActive = true;
          console.log('🎮 Game session marked ACTIVE');
          
          // Send immediate heartbeat
          sendHeartbeat();
          
          // Start periodic heartbeat every 5 seconds
          heartbeatInterval = setInterval(sendHeartbeat, 5000);
        }
      },
      
      setInactive: function() {
        if (isGameActive) {
          isGameActive = false;
          console.log('💤 Game session marked INACTIVE');
          
          // Stop heartbeat
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
          }
          
          // Send final inactive event
          faro.api.pushEvent('game_session_heartbeat', {
            sessionId: window.gameSessionId,
            timestamp: Date.now(),
            status: 'inactive'
          });
        }
      },
      
      isActive: function() {
        return isGameActive;
      }
    };

    console.log('✅ Game Session Metrics initialized successfully');
    console.log('💓 Heartbeats will be sent every 5 seconds when game is active');
  }).catch((error) => {
    console.error('❌ Failed to initialize Game Session Metrics:', error);
  });
})();

