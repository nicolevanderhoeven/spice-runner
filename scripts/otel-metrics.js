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
    let lastActivityTime = Date.now();
    let sessionStartTime = null;
    
    // Timeout configuration
    const IDLE_TIMEOUT_MS = 5 * 60 * 1000;      // 5 minutes of inactivity
    const MAX_SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes absolute maximum
    const HEARTBEAT_INTERVAL_MS = 5000;         // 5 seconds between heartbeats

    // Function to send heartbeat event
    function sendHeartbeat() {
      if (!isGameActive) {
        return;
      }

      const now = Date.now();
      const idleTime = now - lastActivityTime;
      const sessionDuration = sessionStartTime ? now - sessionStartTime : 0;
      
      // Check for idle timeout
      if (idleTime > IDLE_TIMEOUT_MS) {
        console.log(`⏰ Session timeout after ${Math.round(idleTime / 1000)}s of inactivity`);
        faro.api.pushEvent('game_session_timeout', {
          sessionId: window.gameSessionId,
          timestamp: now,
          reason: 'idle',
          idleTime: idleTime
        });
        window.gameMetrics.setInactive();
        return;
      }
      
      // Check for maximum session duration
      if (sessionDuration > MAX_SESSION_DURATION_MS) {
        console.log(`⏰ Maximum session duration reached (${Math.round(sessionDuration / 60000)} minutes)`);
        faro.api.pushEvent('game_session_timeout', {
          sessionId: window.gameSessionId,
          timestamp: now,
          reason: 'max_duration',
          sessionDuration: sessionDuration
        });
        window.gameMetrics.setInactive();
        return;
      }
      
      // Send heartbeat
      faro.api.pushEvent('game_session_heartbeat', {
        sessionId: window.gameSessionId,
        timestamp: now,
        status: 'active',
        idleTime: idleTime,
        sessionDuration: sessionDuration
      });
      console.log(`💓 Heartbeat (idle: ${Math.round(idleTime/1000)}s, session: ${Math.round(sessionDuration/1000)}s)`);
    }

    // Store the game active state globally so instrumentation can update it
    window.gameMetrics = {
      setActive: function() {
        if (!isGameActive) {
          isGameActive = true;
          sessionStartTime = Date.now();
          lastActivityTime = Date.now();
          console.log('🎮 Game session marked ACTIVE');
          
          // Send immediate heartbeat
          sendHeartbeat();
          
          // Start periodic heartbeat
          heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
        }
      },
      
      setInactive: function() {
        if (isGameActive) {
          isGameActive = false;
          const sessionDuration = sessionStartTime ? Date.now() - sessionStartTime : 0;
          console.log(`💤 Game session marked INACTIVE (duration: ${Math.round(sessionDuration/1000)}s)`);
          
          // Stop heartbeat
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
          }
          
          // Send final inactive event
          faro.api.pushEvent('game_session_heartbeat', {
            sessionId: window.gameSessionId,
            timestamp: Date.now(),
            status: 'inactive',
            sessionDuration: sessionDuration
          });
          
          // Reset timers
          sessionStartTime = null;
        }
      },
      
      updateActivity: function() {
        lastActivityTime = Date.now();
      },
      
      isActive: function() {
        return isGameActive;
      }
    };
    
    // Detect tab visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && isGameActive) {
        console.log('👁️ Tab hidden - session continues but will timeout if idle');
        // Don't stop heartbeat, but it will timeout naturally if no activity
      } else if (!document.hidden && isGameActive) {
        console.log('👁️ Tab visible - updating activity timestamp');
        lastActivityTime = Date.now(); // Reset idle timer when tab becomes visible
      }
    });
    
    // Detect tab/window close
    window.addEventListener('beforeunload', () => {
      if (isGameActive) {
        console.log('🚪 Tab closing - marking session inactive');
        // Send synchronous inactive event
        navigator.sendBeacon(
          window.location.origin + '/alloy/collect',
          JSON.stringify({
            type: 'event',
            name: 'game_session_close',
            data: {
              sessionId: window.gameSessionId,
              timestamp: Date.now(),
              reason: 'tab_close'
            }
          })
        );
        window.gameMetrics.setInactive();
      }
    });

    console.log('✅ Game Session Metrics initialized successfully');
    console.log('💓 Heartbeats: every 5s | Idle timeout: 5min | Max session: 30min');
  }).catch((error) => {
    console.error('❌ Failed to initialize Game Session Metrics:', error);
  });
})();

