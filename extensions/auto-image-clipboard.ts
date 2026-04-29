import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync, existsSync } from "node:fs";

export default function (pi: ExtensionAPI) {
  const clipboardPathRegex = /\/var\/folders\/[^\s]*pi-clipboard-[a-f0-9-]+\.(png|jpg|jpeg|gif|webp)/gi;

  pi.on("input", async (event, ctx) => {
    // Verifica se já tem imagens anexadas (Pi pode já ter convertido)
    if (event.images && event.images.length > 0) {
      ctx.ui.notify(`📎 ${event.images.length} image(s) attached`, "info");
      
      // Limpa o texto se tiver path do clipboard
      let cleanedText = event.text.replace(clipboardPathRegex, "").replace(/\s+/g, " ").trim();
      if (!cleanedText) cleanedText = "Describe this image:";
      
      return { action: "transform", text: cleanedText };
    }

    // Se não tem imagens, procura no texto
    const text = event.text;
    const matches = text.match(clipboardPathRegex);
    
    if (matches && matches.length > 0) {
      ctx.ui.notify(`📎 Processing ${matches.length} clipboard image(s)...`, "info");
      
      const images = [];
      let cleanedText = text;

      for (const path of matches) {
        if (existsSync(path)) {
          const data = readFileSync(path);
          const ext = path.split(".").pop()?.toLowerCase() || "png";
          const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
                           ext === "gif" ? "image/gif" :
                           ext === "webp" ? "image/webp" : "image/png";

          images.push({ type: "image", data: data.toString("base64"), mimeType });
          cleanedText = cleanedText.replace(path, "").trim();
        }
      }

      cleanedText = cleanedText.replace(/\s+/g, " ").trim();
      if (!cleanedText) cleanedText = "Describe this image:";

      return { action: "transform", text: cleanedText, images };
    }

    return { action: "continue" };
  });
}
