#!/bin/bash
# Run the telemetry heartbeat script to generate Faro events for dashboard population
#
# Usage:
#   ./scripts/run-telemetry-heartbeat.sh              # Normal mode (3 rounds)
#   ./scripts/run-telemetry-heartbeat.sh --smoke      # Smoke test (1 quick round)
#   ./scripts/run-telemetry-heartbeat.sh --local      # Against localhost:8080
#
# Environment variables:
#   BASE_URL    - Override the target URL (default: https://nvdh.dev/spice/)
#   SMOKE       - Set to "true" for smoke test mode

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Defaults
SMOKE="${SMOKE:-false}"
BASE_URL="${BASE_URL:-https://nvdh.dev/spice/}"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --smoke)
            SMOKE="true"
            shift
            ;;
        --local)
            BASE_URL="http://localhost:8080/spice/"
            shift
            ;;
        --url)
            BASE_URL="$2"
            shift 2
            ;;
        -h|--help)
            echo "Telemetry Heartbeat - Generate Faro events for Grafana dashboards"
            echo ""
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --smoke       Run a quick smoke test (1 round, fewer jumps)"
            echo "  --local       Target localhost:8080 instead of production"
            echo "  --url URL     Use a custom URL"
            echo "  -h, --help    Show this help message"
            echo ""
            echo "Environment variables:"
            echo "  BASE_URL      Target URL (default: https://nvdh.dev/spice/)"
            echo "  SMOKE         Set to 'true' for smoke test mode"
            echo ""
            echo "Examples:"
            echo "  $0                          # Normal run against production"
            echo "  $0 --smoke                  # Quick validation"
            echo "  $0 --local                  # Test against local server"
            echo "  BASE_URL=http://myhost $0   # Custom URL via env var"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Spice Runner Telemetry Heartbeat       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo -e "${RED}Error: k6 is not installed${NC}"
    echo ""
    echo "Install k6 with browser support:"
    echo "  macOS:   brew install k6"
    echo "  Linux:   See https://k6.io/docs/get-started/installation/"
    echo "  Windows: choco install k6"
    echo ""
    echo "Note: k6 browser module requires k6 v0.46.0 or later"
    exit 1
fi

# Check k6 version for browser support
K6_VERSION=$(k6 version 2>/dev/null | head -1 | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
echo -e "${CYAN}k6 version: ${K6_VERSION}${NC}"

# Show configuration
echo -e "${YELLOW}Configuration:${NC}"
echo -e "  Target URL: ${GREEN}${BASE_URL}${NC}"
if [ "$SMOKE" = "true" ]; then
    echo -e "  Mode:       ${CYAN}Smoke Test (quick validation)${NC}"
else
    echo -e "  Mode:       ${GREEN}Normal (3 rounds)${NC}"
fi
echo ""

# Run the test
echo -e "${GREEN}Starting telemetry heartbeat...${NC}"
echo ""

k6 run \
    -e BASE_URL="$BASE_URL" \
    -e SMOKE="$SMOKE" \
    "$SCRIPT_DIR/telemetry-heartbeat.js"

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✓ Telemetry heartbeat complete!${NC}"
    echo ""
    echo -e "${YELLOW}Check your Grafana dashboard for new events:${NC}"
    echo "  • Game Sessions (game_session_start)"
    echo "  • Total Jumps (player_jump)"
    echo "  • Games Played (game_over)"
    echo "  • Collisions (game_collision)"
else
    echo -e "${RED}✗ Telemetry heartbeat failed with exit code: $EXIT_CODE${NC}"
fi

exit $EXIT_CODE
