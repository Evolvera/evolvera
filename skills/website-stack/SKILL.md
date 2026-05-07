---
name: website-stack
description: "Standard technical stack for website projects — Next.js App Router, Tailwind CSS v3, Framer Motion, shadcn/ui. Provides file structure, npm packages, setup order, code conventions, and critical configuration rules. Activated by planner/builder in website context."
---

# Website Stack

A comprehensive technical stack guide for website implementation projects. This skill is the **single source of truth** for all website-specific technical conventions.

## When to Activate

Load this skill when you are in a website or landing-page implementation context. Typically invoked by the planner after receiving DESIGN_PLAN.md + CONTENT_PLAN.md, or by the builder when scaffolding a new web project.

## Stack Overview

- **Framework**: Next.js 14+ (App Router)
- **Styling**: Tailwind CSS v3 + PostCSS + Autoprefixer
- **UI Components**: shadcn/ui (Radix UI primitives + Tailwind)
- **Animation**: Framer Motion
- **Icons**: Lucide React
- **Fonts**: next/font/google
- **Images**: next/image

## Critical Tailwind v3 Rules

**Tailwind CSS v3 is MANDATORY.** v4 is NOT supported.

- v4 eliminated `tailwind.config.ts` and causes silent failures — utility classes are not generated
- ALL custom tokens go in `tailwind.config.ts` → `theme.extend` (colors, fontFamily, backgroundImage, boxShadow, animation, keyframes)
- CSS entry: `@tailwind base; @tailwind components; @tailwind utilities;`
- **BANNED**: `@import "tailwindcss"`, `@theme {}`, `@config`, `@tailwindcss/postcss`
- PostCSS: plugins `tailwindcss: {}` + `autoprefixer: {}`

## File Structure Template

```
app/
  layout.tsx          # Root layout with fonts, metadata, providers
  globals.css         # Tailwind directives + CSS variables
  page.tsx            # Home page
  [other pages]/
components/
  ui/                 # shadcn/ui components (installed via CLI)
  sections/           # Page sections (Hero, Features, etc.)
  layout/             # Navbar, Footer, Container
  shared/             # Reusable non-shadcn components
lib/
  utils.ts            # cn() utility from shadcn
  animations.ts       # Reusable Framer Motion variants
public/
  images/             # Static images
  fonts/              # Self-hosted fonts (if needed)
tailwind.config.ts    # Theme extensions
postcss.config.js     # Tailwind + Autoprefixer
next.config.js        # Static export config if needed
```

## Setup Order (Phase 0)

1. Initialize Next.js project: `npx create-next-app@latest <name> --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*"`
2. Initialize shadcn/ui: `npx shadcn-ui@latest init` (select default style, base color from design)
3. Install Tailwind v3 explicitly if create-next-app installed v4:
   ```
   npm install tailwindcss@^3 postcss autoprefixer
   npx tailwindcss init -p
   ```
4. Install animation library: `npm install framer-motion`
5. Install icons: `npm install lucide-react`
6. Install utility: `npm install clsx tailwind-merge` (shadcn already installs)

## shadcn/ui Base Components

Install as needed via CLI. Common set:
- button, card, input, textarea, badge, separator
- accordion, dialog, sheet, dropdown-menu, tabs
- skeleton, toast (for loading and feedback)

## Code Conventions

- **"use client"** ONLY on components using Framer Motion, browser APIs, or React hooks that require client boundary.
- Server Components by default for static sections (better performance).
- Use `next/image` for ALL images. Provide width, height, and alt text.
- Use `next/font/google` for fonts. NEVER use `<link>` to Google Fonts in `<head>`.
- Use `cn()` from `lib/utils.ts` for conditional class merging.
- No magic numbers for spacing — use Tailwind scale (4, 8, 12, 16, 24, 32, 48, 64...).
- No hardcoded hex colors outside `tailwind.config.ts` → `theme.extend`.

## SEO & Performance Defaults

- next/head metadata in root layout (title template, description, OG defaults).
- next/image with priority on LCP images.
- Font display: swap with adequate fallback sizing.
- Static export: `output: 'export'` in `next.config.js` if no SSR needed.

## Accessibility Defaults

- WCAG AA contrast minimum.
- Focus-visible rings on all interactive elements.
- aria-label on icon-only buttons.
- prefers-reduced-motion: disable Framer Motion animations.
- Touch targets ≥ 44px.
