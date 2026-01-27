/**
 * Grafana Faro SDK Initialization
 * 
 * This script initializes Faro for Real User Monitoring (RUM)
 * and sends telemetry to BOTH:
 *   1. Local Alloy sidecar via /alloy/collect (for in-cluster observability stack)
 *   2. Grafana Cloud Frontend O11y (for cloud-based monitoring)
 */

(function() {
  'use strict';

  console.log('🔧 Initializing Grafana Faro (dual-send mode)...');

  // Wait for Faro SDK to be loaded
  if (typeof window.GrafanaFaroWebSdk === 'undefined') {
    console.error('❌ Faro SDK not loaded!');
    return;
  }

  try {
    // =========================================================================
    // Primary Instance: Local Alloy sidecar (for in-cluster stack)
    // =========================================================================
    const alloyUrl = window.location.origin + '/alloy/collect';
    console.log('🔧 Initializing Faro (Alloy) with URL:', alloyUrl);
    
    const alloyFaro = window.GrafanaFaroWebSdk.initializeFaro({
      url: alloyUrl,
      app: {
        name: 'spice-runner',
        version: '1.0.0',
        environment: 'production'
      }
    });

    // Store Alloy Faro instance globally
    window.faroInstance = alloyFaro;

    console.log('✅ Faro (Alloy) initialized successfully');

    // =========================================================================
    // Secondary Instance: Grafana Cloud Frontend O11y
    // =========================================================================
    const grafanaCloudUrl = 'https://faro-collector-prod-us-central-0.grafana.net/collect/2e0bbd062f25d71c122cb237d06a4c43';
    console.log('🔧 Initializing Faro (Grafana Cloud) with URL:', grafanaCloudUrl);

    const cloudFaro = window.GrafanaFaroWebSdk.initializeFaro({
      url: grafanaCloudUrl,
      app: {
        name: 'spice-runner',
        version: '1.0.0',
        environment: 'production'
      },
      isolate: true  // Required for multiple Faro instances
    });

    // Store Grafana Cloud Faro instance globally
    window.faroCloudInstance = cloudFaro;

    console.log('✅ Faro (Grafana Cloud) initialized successfully');

    // =========================================================================
    // Session Setup
    // =========================================================================
    
    // Generate session ID immediately at page load
    // This ensures all events (including pre-game events) have a sessionId
    window.gameSessionId = Date.now().toString();

    console.log('📊 Dual-send telemetry enabled:');
    console.log('   → Alloy:', alloyUrl);
    console.log('   → Grafana Cloud:', grafanaCloudUrl.replace(/\/collect\/.*/, '/collect/[REDACTED]'));
    console.log('🔑 Session ID:', window.gameSessionId);
    console.log('🌐 User Agent:', navigator.userAgent);
    console.log('📱 Screen:', `${window.screen.width}x${window.screen.height}`);

    // Defensive check: Verify sessionId was created
    if (!window.gameSessionId) {
      console.error('❌ CRITICAL: Failed to generate sessionId!');
    }

    // =========================================================================
    // Helper: Push events to BOTH instances
    // =========================================================================
    window.faroPushEventBoth = function(eventName, eventData) {
      if (window.faroInstance) {
        window.faroInstance.api.pushEvent(eventName, eventData);
      }
      if (window.faroCloudInstance) {
        window.faroCloudInstance.api.pushEvent(eventName, eventData);
      }
    };

    window.faroPushMeasurementBoth = function(measurement) {
      if (window.faroInstance) {
        window.faroInstance.api.pushMeasurement(measurement);
      }
      if (window.faroCloudInstance) {
        window.faroCloudInstance.api.pushMeasurement(measurement);
      }
    };

    window.faroPushErrorBoth = function(error) {
      if (window.faroInstance) {
        window.faroInstance.api.pushError(error);
      }
      if (window.faroCloudInstance) {
        window.faroCloudInstance.api.pushError(error);
      }
    };

    // Push initial event to confirm Faro is working (to both)
    console.log('📤 Pushing initial game_loaded event (to both instances)...');
    window.faroPushEventBoth('game_loaded', {
      sessionId: window.gameSessionId,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      screenResolution: `${window.screen.width}x${window.screen.height}`
    });
    console.log('✅ Initial event pushed to both instances');

  } catch (error) {
    console.error('❌ Failed to initialize Faro:', error);
    console.error('❌ Error details:', error.message, error.stack);
  }
})();

