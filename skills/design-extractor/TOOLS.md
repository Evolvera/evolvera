# Tool Definitions — design-extractor

## extract_design_system

Main extraction function. Extracts design tokens from a URL and generates DESIGN.md.

```json
{
  "name": "extract_design_system",
  "description": "Extract design system from a website URL and save to design-catalog",
  "parameters": {
    "type": "object",
    "properties": {
      "url": {
        "type": "string",
        "description": "Website URL to extract from",
        "example": "https://stripe.com"
      },
      "slug": {
        "type": "string",
        "description": "Brand slug (kebab-case, unique)",
        "example": "stripe"
      },
      "category": {
        "type": "string",
        "description": "Category from valid list",
        "enum": ["fintech", "saas", "ecommerce", "social", "productivity", "developer-tools", "creative", "automotive", "enterprise", "media", "consumer", "industry", "healthcare", "education"],
        "example": "fintech"
      },
      "vibe": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Vibe keywords",
        "example": ["modern", "luxury", "premium"]
      },
      "name": {
        "type": "string",
        "description": "Brand display name",
        "example": "Stripe"
      }
    },
    "required": ["url", "slug", "category", "vibe", "name"]
  }
}
```

**Returns:**
```json
{
  "success": true,
  "design_file": "designs/stripe/DESIGN.md",
  "colors_extracted": 25,
  "fonts_found": ["sohne-var", "SourceCodePro"],
  "sections_generated": 9
}
```

---

## validate_extraction

Validates inputs before extraction begins.

```json
{
  "name": "validate_extraction",
  "description": "Validate slug uniqueness and input parameters",
  "parameters": {
    "type": "object",
    "properties": {
      "slug": {
        "type": "string",
        "description": "Brand slug to validate"
      },
      "category": {
        "type": "string",
        "description": "Category to validate"
      }
    },
    "required": ["slug", "category"]
  }
}
```

**Returns:**
```json
{
  "valid": true,
  "errors": []
}
```

---

## update_design_index

Adds new brand entry to design-index.json.

```json
{
  "name": "update_design_index",
  "description": "Add new brand entry to design-index.json",
  "parameters": {
    "type": "object",
    "properties": {
      "slug": { "type": "string" },
      "name": { "type": "string" },
      "category": { "type": "string" },
      "vibe": { "type": "array", "items": { "type": "string" } },
      "colors": { "type": "array", "items": { "type": "string" } },
      "typography": { "type": "array", "items": { "type": "string" } },
      "use_cases": { "type": "array", "items": { "type": "string" } },
      "keywords": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["slug", "name", "category"]
  }
}
```

---

## read_extraction_guide

Loads the EXTRACTION_GUIDE.md for reference.

```json
{
  "name": "read_extraction_guide",
  "description": "Read EXTRACTION_GUIDE.md to understand token mapping structure",
  "parameters": {
    "type": "object",
    "properties": {}
  }
}
```
