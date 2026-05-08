# Validator — design-extractor

## Pre-Extraction Validation (Inputs)

Before starting extraction, validate:

### 1. Slug Validation
```
- Must be unique in design-index.json
- Must be kebab-case: a-z, 0-9, hyphens only
- Must not start/end with hyphen
- Length: 2-50 characters
```

**Check command:**
```bash
grep -q "\"slug\": \"$SLUG\"" design-index.json && echo "EXISTS" || echo "OK"
```

### 2. URL Validation
```
- Must be valid URL format (https://...)
- Must be accessible (jina_read should succeed)
- Should be the main brand website (not a subdomain unless intentional)
```

### 3. Category Validation
```
Category must be one of:
- fintech
- saas
- ecommerce
- social
- productivity
- developer-tools
- creative
- automotive
- enterprise
- media
- consumer
- industry
- healthcare
- education
```

### 4. Vibe Validation
```
- Must be array of strings
- Recommended: 3-5 keywords
- Should match brand personality
```

---

## Post-Extraction Validation (DESIGN.md)

After generating DESIGN.md, verify:

### Section Checklist
- [ ] Section 1: Visual Theme & Atmosphere — present and filled
- [ ] Section 2: Color Palette & Roles — all color categories present
- [ ] Section 3: Typography Rules — font family + hierarchy table
- [ ] Section 4: Component Stylings — buttons, cards, badges, inputs, nav
- [ ] Section 5: Layout Principles — spacing, grid, breakpoints
- [ ] Section 6: Depth & Elevation — shadow levels documented
- [ ] Section 7: Do's and Don'ts — positive and negative patterns
- [ ] Section 8: Responsive Behavior — breakpoints table
- [ ] Section 9: Agent Prompt Guide — quick reference + examples

### Content Validation

#### Colors
- [ ] All colors in valid hex format (#RGB or #RRGGBB)
- [ ] All colors in valid rgba format (rgba(R,G,B,A))
- [ ] Primary brand color identified
- [ ] CTA color identified
- [ ] Text colors (heading, body, muted) identified
- [ ] Border colors identified
- [ ] Shadow colors identified (if applicable)

#### Typography
- [ ] Primary font identified (Google Fonts or custom)
- [ ] Fallback fonts listed
- [ ] Hierarchy table complete (Display → Caption roles)
- [ ] Font weights documented
- [ ] Line heights documented
- [ ] Letter-spacing documented (if distinctive)

#### Components
- [ ] Primary button documented (all states: default, hover, active)
- [ ] Secondary/ghost button documented (if exists)
- [ ] Card styling documented (background, border, shadow, radius)
- [ ] Badge/tag styling documented
- [ ] Input styling documented (default, focus states)
- [ ] Navigation documented (desktop + mobile)
- [ ] Footer documented

#### Layout
- [ ] Spacing scale documented
- [ ] Border-radius scale documented
- [ ] Max content width identified
- [ ] Breakpoints identified

#### Other
- [ ] Key Characteristics list in Section 1
- [ ] Do's and Don'ts filled (not just template placeholders)
- [ ] Agent Prompt Guide filled with working examples

---

## File Validation

### Slug Directory
- [ ] Directory created: `designs/[slug]/`
- [ ] DESIGN.md exists: `designs/[slug]/DESIGN.md`
- [ ] File size > 5KB (reasonable content)

### design-index.json
- [ ] Entry added to brands array
- [ ] Entry has all required fields:
  - slug
  - name
  - category
  - vibe (array)
  - colors (array)
  - typography (array)
  - use_cases (array)
  - design_file
  - keywords (array)
- [ ] total_brands incremented in metadata

---

## Error Handling

| Error | Action |
|-------|--------|
| Slug already exists | Abort, ask for different slug |
| Invalid category | List valid categories |
| URL inaccessible | Abort extraction, report error |
| jina_read fails | Try fallback pages, report partial |
| Missing required section | Fill with placeholder + note |
| Invalid hex color | Correct to valid format |
| Missing font info | Mark as "to be verified" |

---

## Validation Script

```bash
#!/bin/bash
# validate-extraction.sh

SLUG="$1"
INDEX_FILE="$2/design-index.json"

# Check slug uniqueness
if grep -q "\"slug\": \"$SLUG\"" "$INDEX_FILE"; then
  echo "ERROR: Slug '$SLUG' already exists in design-index.json"
  exit 1
fi

# Check kebab-case
if ! [[ "$SLUG" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "ERROR: Slug must be kebab-case (a-z, 0-9, hyphens only)"
  exit 1
fi

# Check design file exists
if [ ! -f "$2/designs/$SLUG/DESIGN.md" ]; then
  echo "ERROR: DESIGN.md not found at designs/$SLUG/DESIGN.md"
  exit 1
fi

echo "✅ Validation passed for slug: $SLUG"
exit 0
```

---

## Usage

```bash
# Validate before extraction
./scripts/validate-extraction.sh "my-brand" "~/.pi/agent/skills/design-catalog"

# Or inline check
SLUG="my-brand"
grep -q "\"slug\": \"$SLUG\"" design-index.json && echo "TAKEN" || echo "OK"
```
