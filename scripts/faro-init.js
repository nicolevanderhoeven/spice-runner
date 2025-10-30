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
    const faroUrl = window.location.origin + '/alloy/collect';
    console.log('🔧 Initializing Faro with URL:', faroUrl);
    
    const faro = window.GrafanaFaroWebSdk.initializeFaro({
      url: faroUrl,
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
    console.log('📊 Sending telemetry to:', faroUrl);
    console.log('🔑 Session ID:', window.gameSessionId);
    console.log('🌐 User Agent:', navigator.userAgent);
    console.log('📱 Screen:', `${window.screen.width}x${window.screen.height}`);

    // Defensive check: Verify sessionId was created
    if (!window.gameSessionId) {
      console.error('❌ CRITICAL: Failed to generate sessionId!');
    }

    // Push initial event to confirm Faro is working
    console.log('📤 Pushing initial game_loaded event...');
    faro.api.pushEvent('game_loaded', {
      sessionId: window.gameSessionId,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      screenResolution: `${window.screen.width}x${window.screen.height}`
    });
    console.log('✅ Initial event pushed');

  } catch (error) {
    console.error('❌ Failed to initialize Faro:', error);
    console.error('❌ Error details:', error.message, error.stack);
  }
})();

