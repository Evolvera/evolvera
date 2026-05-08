#!/bin/bash
#
# update-index.sh — Add new brand entry to design-index.json
#
# Usage:
#   ./update-index.sh --slug "my-brand" --name "My Brand" --category "saas" \
#     --vibe "modern,minimal,corporate" --colors "#FF0000,#00FF00" \
#     --fonts "Inter,Helvetica" --use-cases "saas,enterprise" \
#     --keywords "red,modern,saas"
#
# Or with explicit paths:
#   ./update-index.sh --slug "my-brand" --name "My Brand" --category "saas" \
#     --vibe "modern,minimal" --index "/path/to/design-index.json" \
#     --catalog-dir "/path/to/design-catalog"
#

set -e

# Default paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CATALOG_DIR="$(dirname "$SCRIPT_DIR")"
INDEX_FILE="$CATALOG_DIR/design-index.json"
BACKUP_FILE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --slug)
      SLUG="$2"
      shift 2
      ;;
    --name)
      NAME="$2"
      shift 2
      ;;
    --category)
      CATEGORY="$2"
      shift 2
      ;;
    --vibe)
      VIBE="$2"
      shift 2
      ;;
    --colors)
      COLORS="$2"
      shift 2
      ;;
    --fonts)
      FONTS="$2"
      shift 2
      ;;
    --use-cases)
      USE_CASES="$2"
      shift 2
      ;;
    --keywords)
      KEYWORDS="$2"
      shift 2
      ;;
    --index)
      INDEX_FILE="$2"
      shift 2
      ;;
    --catalog-dir)
      CATALOG_DIR="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate required arguments
if [ -z "$SLUG" ] || [ -z "$NAME" ] || [ -z "$CATEGORY" ]; then
  echo "Usage: $0 --slug SLUG --name NAME --category CATEGORY [options]"
  echo ""
  echo "Required:"
  echo "  --slug      Brand slug (kebab-case, unique)"
  echo "  --name      Brand display name"
  echo "  --category  Category (fintech|saas|ecommerce|social|productivity|developer-tools|creative|automotive|enterprise|media|consumer|industry|healthcare|education)"
  echo ""
  echo "Optional:"
  echo "  --vibe       Comma-separated vibe keywords"
  echo "  --colors     Comma-separated hex colors"
  echo "  --fonts      Comma-separated font families"
  echo "  --use-cases  Comma-separated use cases"
  echo "  --keywords   Comma-separated search keywords"
  echo "  --index      Path to design-index.json (default: auto-detect)"
  exit 1
fi

# Validate slug format (kebab-case)
if ! [[ "$SLUG" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "ERROR: Slug must be kebab-case (a-z, 0-9, hyphens only)"
  exit 1
fi

# Validate category
VALID_CATEGORIES="fintech saas ecommerce social productivity developer-tools creative automotive enterprise media consumer industry healthcare education"
if ! echo "$VALID_CATEGORIES" | grep -qw "$CATEGORY"; then
  echo "ERROR: Invalid category '$CATEGORY'"
  echo "Valid categories: $VALID_CATEGORIES"
  exit 1
fi

# Check if index file exists
if [ ! -f "$INDEX_FILE" ]; then
  echo "ERROR: design-index.json not found at $INDEX_FILE"
  exit 1
fi

# Check if slug already exists
if grep -q "\"slug\": \"$SLUG\"" "$INDEX_FILE"; then
  echo "ERROR: Slug '$SLUG' already exists in design-index.json"
  exit 1
fi

# Create backup
BACKUP_FILE="$INDEX_FILE.backup.$(date +%Y%m%d_%H%M%S)"
cp "$INDEX_FILE" "$BACKUP_FILE"
echo "📋 Backup created: $BACKUP_FILE"

# Convert comma-separated to JSON arrays
vibe_json="[$(echo "$VIBE" | sed 's/,/", "/g' | sed 's/^/"/' | sed 's/$/"/')]"
colors_json="[$(echo "$COLORS" | sed 's/,/", "/g' | sed 's/^/"/' | sed 's/$/"/')]"
fonts_json="[$(echo "$FONTS" | sed 's/,/", "/g' | sed 's/^/"/' | sed 's/$/"/')]"
use_cases_json="[$(echo "$USE_CASES" | sed 's/,/", "/g' | sed 's/^/"/' | sed 's/$/"/')]"
keywords_json="[$(echo "$KEYWORDS" | sed 's/,/", "/g' | sed 's/^/"/' | sed 's/$/"/')]"

# Create new entry
NEW_ENTRY=$(cat <<EOF
    {
      "slug": "$SLUG",
      "name": "$NAME",
      "category": "$CATEGORY",
      "vibe": $vibe_json,
      "colors": $colors_json,
      "typography": $fonts_json,
      "use_cases": $use_cases_json,
      "design_file": "designs/$SLUG/DESIGN.md",
      "keywords": $keywords_json
    }
EOF
)

# Use jq to add to array and update metadata
if command -v jq &> /dev/null; then
  # Use jq for reliable JSON manipulation
  TEMP_FILE=$(mktemp)
  
  # Add to brands array
  jq --argjson newEntry "$NEW_ENTRY" '.brands += [$newEntry]' "$INDEX_FILE" > "$TEMP_FILE"
  
  # Update metadata.total_brands
  jq '.metadata.total_brands = (.metadata.total_brands + 1)' "$TEMP_FILE" > "$INDEX_FILE"
  
  rm "$TEMP_FILE"
else
  # Fallback: use Python
  python3 << PYEOF
import json

# Read current index
with open("$INDEX_FILE", "r") as f:
    data = json.load(f)

# Parse new entry
new_entry = json.loads('''$NEW_ENTRY''')

# Add to brands
data["brands"].append(new_entry)

# Update count
data["metadata"]["total_brands"] += 1

# Write back
with open("$INDEX_FILE", "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print("Updated design-index.json with jq/Python")
PYEOF
fi

echo "✅ Added '$NAME' (slug: $SLUG) to design-index.json"
echo "📊 Total brands: $(grep -o '"total_brands": [0-9]*' "$INDEX_FILE" | grep -o '[0-9]*')"

# Verify the entry was added
if grep -q "\"slug\": \"$SLUG\"" "$INDEX_FILE"; then
  echo "✅ Verification passed: slug '$SLUG' found in index"
else
  echo "❌ WARNING: Slug not found after update!"
  echo "Restoring backup..."
  cp "$BACKUP_FILE" "$INDEX_FILE"
  echo "Restored from backup"
  exit 1
fi

echo ""
echo "Done! Entry added:"
echo "  Slug: $SLUG"
echo "  Name: $NAME"
echo "  Category: $CATEGORY"
echo "  Design file: designs/$SLUG/DESIGN.md"
