#!/bin/bash
set -e

# Design Catalog Setup Script
# Downloads all available DESIGN.md files from getdesign.md
# Idempotent: skips brands that already exist

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESIGNS_DIR="${SCRIPT_DIR}/../designs"
mkdir -p "$DESIGNS_DIR"

BRANDS=(
  airbnb airtable apple binance bmw bmw-m bugatti cal claude clay
  clickhouse cohere coinbase composio cursor elevenlabs expo ferrari
  figma framer hashicorp ibm intercom kraken lamborghini linear.app
  lovable mastercard meta minimax mintlify miro mistral.ai mongodb
  nike notion nvidia ollama opencode.ai pinterest playstation posthog
  raycast renault replicate resend revolut runwayml sanity sentry
  shopify slack spacex spotify starbucks stripe supabase superhuman
  tesla theverge together.ai uber vercel vodafone voltagent warp
  webflow wired wise x.ai zapier
)

TOTAL=${#BRANDS[@]}
EXISTING=0
DOWNLOADED=0
FAILED=0
FAILED_BRANDS=""

echo "📦 Design Catalog Setup"
echo "======================="
echo "Target: ${TOTAL} brands"
echo "Directory: ${DESIGNS_DIR}"
echo ""

for BRAND in "${BRANDS[@]}"; do
  TARGET_DIR="${DESIGNS_DIR}/${BRAND}"
  TARGET_FILE="${TARGET_DIR}/DESIGN.md"

  if [ -f "$TARGET_FILE" ]; then
    SIZE=$(wc -c < "$TARGET_FILE" 2>/dev/null || echo "0")
    echo "  ✅ ${BRAND} (already exists, ${SIZE} bytes)"
    ((EXISTING++))
    continue
  fi

  mkdir -p "$TARGET_DIR"
  cd "$DESIGNS_DIR"

  # Try --out flag first (newer getdesign versions)
  if npx getdesign@latest add "$BRAND" --force --out "$TARGET_FILE" 2>/dev/null; then
    # Normalize: getdesign may put the file elsewhere
    if [ -f "$TARGET_FILE" ]; then
      SIZE=$(wc -c < "$TARGET_FILE")
      echo "  ✅ ${BRAND} (${SIZE} bytes)"
      ((DOWNLOADED++))
    elif [ -f "DESIGN.md" ]; then
      mv "DESIGN.md" "$TARGET_FILE"
      SIZE=$(wc -c < "$TARGET_FILE")
      echo "  ✅ ${BRAND} (normalized, ${SIZE} bytes)"
      ((DOWNLOADED++))
    else
      echo "  ❌ ${BRAND} (file not found after download)"
      ((FAILED++))
      FAILED_BRANDS="${FAILED_BRANDS} ${BRAND}"
    fi
  else
    # Fallback: let getdesign put it where it wants, then move
    echo "  🔄 ${BRAND} (trying fallback method...)"
    if npx getdesign@latest add "$BRAND" 2>/dev/null; then
      if [ -f "DESIGN.md" ]; then
        mv "DESIGN.md" "$TARGET_FILE"
        SIZE=$(wc -c < "$TARGET_FILE")
        echo "  ✅ ${BRAND} (fallback, ${SIZE} bytes)"
        ((DOWNLOADED++))
      elif [ -f "${BRAND}/DESIGN.md" ]; then
        mv "${BRAND}/DESIGN.md" "$TARGET_FILE"
        rmdir "${BRAND}" 2>/dev/null || true
        SIZE=$(wc -c < "$TARGET_FILE")
        echo "  ✅ ${BRAND} (moved to target, ${SIZE} bytes)"
        ((DOWNLOADED++))
      else
        echo "  ❌ ${BRAND} (download failed)"
        ((FAILED++))
        FAILED_BRANDS="${FAILED_BRANDS} ${BRAND}"
      fi
    else
      echo "  ❌ ${BRAND} (download failed)"
      ((FAILED++))
      FAILED_BRANDS="${FAILED_BRANDS} ${BRAND}"
    fi
  fi
done

echo ""
echo "======================="
echo "Results"
echo "======================="
echo "Total brands:     ${TOTAL}"
echo "Already existed:  ${EXISTING}"
echo "Downloaded:        ${DOWNLOADED}"
echo "Failed:            ${FAILED}"

if [ $FAILED -gt 0 ]; then
  echo ""
  echo "⚠️  Some downloads failed:${FAILED_BRANDS}"
  echo ""
  echo "You can:"
  echo "   1. Re-run this script to retry failed downloads"
  echo "   2. Download manually from https://getdesign.md"
  echo "   3. Use the design catalog with available brands only"
  exit 1
fi

echo ""
READY=$(find "$DESIGNS_DIR" -name "DESIGN.md" | wc -l | xargs)
echo "✨ All ${READY} design references are ready."
echo "   Location: ${DESIGNS_DIR}"
echo ""
echo "Next: Load the skill with /skill:design-catalog"
