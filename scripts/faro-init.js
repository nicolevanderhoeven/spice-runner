/**
 * Grafana Faro SDK Initialization
 * 
 * This script initializes Faro for Real User Monitoring (RUM)
 * and sends telemetry to the Alloy sidecar via /alloy/collect endpoint.
 */

(function() {
  'use strict';

  console.log('🔧 Initializing Grafana Faro...');

  // Wait for Faro SDK to be loaded
  if (typeof window.GrafanaFaroWebSdk === 'undefined') {
    console.error('❌ Faro SDK not loaded!');
    return;
  }

  try {
    // Initialize Faro with correct configuration
    const faro = window.GrafanaFaroWebSdk.initializeFaro({
      url: window.location.origin + '/alloy/collect',
      app: {
        name: 'spice-runner',
        version: '1.0.0',
        environment: 'production'
      }
    });

    // Store Faro instance globally (avoid window.faro which is read-only)
    window.faroInstance = faro;

    // Generate session ID immediately at page load
    // This ensures all events (including pre-game events) have a sessionId
    window.gameSessionId = Date.now().toString();

    console.log('✅ Grafana Faro initialized successfully');
    console.log('📊 Sending telemetry to:', window.location.origin + '/alloy/collect');
    console.log('🔑 Session ID:', window.gameSessionId);

    // Defensive check: Verify sessionId was created
    if (!window.gameSessionId) {
      console.error('❌ CRITICAL: Failed to generate sessionId!');
    }

    // Push initial event to confirm Faro is working
    faro.api.pushEvent('game_loaded', {
      sessionId: window.gameSessionId,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      screenResolution: `${window.screen.width}x${window.screen.height}`
    });

  } catch (error) {
    console.error('❌ Failed to initialize Faro:', error);
  }
})();

