# Next.js + Tailwind CSS + shadcn/ui — Stack Template

This is the recommended stack for websites built by the website builder chain.

## Initialization Commands

### 1. Initialize Next.js project with shadcn/ui

```bash
# Create Next.js project
npx create-next-app@latest my-website --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm

# Move into directory
cd my-website

# Initialize shadcn/ui
npx shadcn@latest init --yes --template next --base-color neutral
```

### 2. Install additional packages

```bash
# Theming and dark mode
npm install next-themes

# Animations
npm install framer-motion

# Icons (already included with shadcn but ensure it's there)
npm install lucide-react

# Typography plugin for prose
npm install -D @tailwindcss/typography

# Optional: additional utilities
npm install clsx tailwind-merge class-variance-authority
```

## Recommended Folder Structure

```
my-website/
├── app/
│   ├── layout.tsx          # Root layout with ThemeProvider
│   ├── page.tsx            # Home page
│   ├── globals.css         # Tailwind + custom CSS variables
│   ├── about/
│   │   └── page.tsx
│   ├── services/
│   │   └── page.tsx
│   ├── contact/
│   │   └── page.tsx
│   └── blog/
│       └── page.tsx
├── components/
│   ├── ui/                 # shadcn/ui components (auto-generated)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   ├── badge.tsx
│   │   └── ...
│   ├── sections/           # Page sections
│   │   ├── Hero.tsx
│   │   ├── Features.tsx
│   │   ├── Testimonials.tsx
│   │   ├── CTA.tsx
│   │   └── Footer.tsx
│   └── layout/             # Layout components
│       ├── Navbar.tsx
│       ├── Footer.tsx
│       └── Container.tsx
├── lib/
│   └── utils.ts            # cn() helper (auto-generated)
├── public/
│   ├── images/
│   └── icons/
├── tailwind.config.ts
├── next.config.js
└── tsconfig.json
```

## Critical Configurations

### tailwind.config.ts

```typescript
import type { Config } from "tailwindcss";
import { withUt } from "tailwindcss/plugin";

const config = withUt({
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Add your design tokens here
        // Example:
        // primary: {
        //   DEFAULT: "hsl(var(--primary))",
        //   foreground: "hsl(var(--primary-foreground))",
        // },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        heading: ["var(--font-heading)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [
    require("@tailwindcss/typography"),
  ],
}) satisfies Config;

export default config;
```

### next.config.js

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // For static export (no server needed)
  output: 'export',
  images: {
    unoptimized: true,
  },
  // Or for SSR deployment on Vercel, use:
  // output: undefined (default),
};

module.exports = nextConfig;
```

### tsconfig.json (paths alias)

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

## Layout Snippet with ThemeProvider

```tsx
// app/providers.tsx
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
```

```tsx
// app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "My Website",
  description: "Website description",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.variable}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
```

## Global CSS with Design Tokens

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* Design tokens — customize these per project */
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;

    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;

    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;

    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;

    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;

    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;

    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;

    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;

    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;

    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;

    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;

    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;

    --primary: 217.2 91.2% 59.8%;
    --primary-foreground: 222.2 47.4% 11.2%;

    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;

    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;

    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;

    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;

    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 224.3 76.3% 48%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

## Useful shadcn/ui Components to Add

```bash
# Core UI components
npx shadcn@latest add button card input badge badge
npx shadcn@latest add navigation-menu dropdown-menu
npx shadcn@latest add form label textarea
npx shadcn@latest add dialog sheet
npx shadcn@latest add accordion
npx shadcn@latest add skeleton avatar

# Layout components
npx shadcn@latest add separator container
```

## Deployment

### Vercel (recommended)

```bash
npm install -g vercel
vercel
```

### Static Export

```bash
# Set output: 'export' in next.config.js
npm run build
# Output will be in ./out/
```

## Notes

- Always use `next/image` for optimized images
- Use CSS variables for all design tokens (not hardcoded hex values)
- Keep components in `components/ui/` for shadcn compatibility
- Put page sections in `components/sections/`
- Use semantic HTML (nav, main, section, article, footer)
