/**
 * Jina Reader Extension
 * 
 * Reads web pages and PDFs using the free Jina Reader API.
 * Limits: 20 req/min free, 500 req/min with API key.
 * 
 * Usage:
 *   jina_read({ url: "https://example.com" })
 *   jina_read({ url: "https://example.com/doc.pdf" })
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import https from "https";
import http from "http";

const JINA_READER_BASE = "https://r.jina.ai";

const JINA_READ_PARAMS = Type.Object({
  url: Type.String({ description: "URL to read (web page or PDF)" }),
  summarize: Type.Optional(Type.Boolean({ description: "Return only summary (faster)" })),
});

function fetchWithNode(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    
    const req = client.get(url, { headers: { Accept: "text/plain" } }, (res) => {
      // Handle redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = res.headers.location;
        if (redirectUrl) {
          req.destroy();
          fetchWithNode(redirectUrl).then(resolve).catch(reject);
          return;
        }
      }
      
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    });
    
    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error("Request timeout (30s)"));
    });
  });
}

export default function jinaReaderExtension(pi: ExtensionAPI) {
  // Register the jina_read tool
  pi.registerTool({
    name: "jina_read",
    label: "Jina Reader",
    description:
      "Read any web page or PDF content using Jina Reader API. " +
      "Extracts clean text from URLs including HTML pages, documentation, and PDF files. " +
      "Use this when you need to read full content from a URL (not just search snippets).",
    promptSnippet: "Use jina_read to fetch full content from web pages or PDFs",
    promptGuidelines: [
      "Use jina_read for documentation pages, PDFs, GitHub READMEs, etc.",
      "Use jina_read instead of trying to parse search results.",
    ],
    parameters: JINA_READ_PARAMS,
    async execute(_toolCallId, params) {
      const targetUrl = params.url;
      
      // Build Jina Reader URL
      const jinaUrl = `${JINA_READER_BASE}/${encodeURIComponent(targetUrl)}`;
      
      try {
        const startTime = Date.now();
        const content = await fetchWithNode(jinaUrl);
        const elapsed = Date.now() - startTime;
        
        // Check for empty response
        if (!content || content.trim().length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `⚠️ Empty response from Jina Reader for: ${targetUrl}\n\nThe page may be inaccessible or require authentication.`,
              },
            ],
            details: { url: targetUrl, elapsed, empty: true },
          };
        }
        
        // Truncate if too long (keep first 50k chars + last 10k)
        const truncatedContent =
          content.length > 60000
            ? content.slice(0, 50000) +
              `\n\n[... ${content.length - 60000} characters truncated ...]\n\n` +
              content.slice(-10000)
            : content;
        
        return {
          content: [
            {
              type: "text",
              text: `📖 **Content from:** ${targetUrl}\n` +
                `📊 Size: ${content.length} chars | Time: ${elapsed}ms\n\n` +
                `---\n\n${truncatedContent}`,
            },
          ],
          details: {
            url: targetUrl,
            originalLength: content.length,
            truncated: content.length > 60000,
            elapsed,
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to read ${targetUrl}\n\nError: ${errorMessage}\n\n` +
                `Tip: Check if the URL is accessible and publicly available.`,
            },
          ],
          details: { url: targetUrl, error: errorMessage },
        };
      }
    },
  });
  
  console.log("[jina-reader] Extension loaded: jina_read tool available");
}
