import type { Express, Request, Response } from "express";

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function performWebSearch(query: string, numResults = 5) {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return [];
    }

    const html = await res.text();
    const results: Array<{ title: string; url: string; text: string; published_date: string | null }> = [];
    const blockRegex = /<div class="result results_links[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g;
    const blocks = html.match(blockRegex) || [];

    for (const block of blocks) {
      const aMatch = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      const snipMatch = block.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);

      if (aMatch) {
        const rawUrl = aMatch[1] || "";
        let decodedUrl = rawUrl;
        const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
        if (uddgMatch) {
          try {
            decodedUrl = decodeURIComponent(uddgMatch[1] || "");
          } catch {}
        }

        const title = decodeHtmlEntities(aMatch[2]?.replace(/<[^>]+>/g, "") || "");
        const snippet = snipMatch
          ? decodeHtmlEntities(snipMatch[1]?.replace(/<[^>]+>/g, "") || "")
          : title;

        if (title && decodedUrl.startsWith("http")) {
          results.push({
            title,
            url: decodedUrl,
            text: snippet,
            published_date: null,
          });
        }
      }

      if (results.length >= numResults) break;
    }

    return results;
  } catch (err) {
    console.warn("[Web Tools] Search error:", err);
    return [];
  }
}

export function registerWebToolsGateway(app: Express) {
  // 1. POST /tools/web-search - Real-time web search for Qronos CLI & Agent tools
  const handleWebSearch = async (req: Request, res: Response) => {
    try {
      const { query = "", num_results = 5 } = req.body || {};
      const cleanQuery = String(query).trim();

      if (!cleanQuery) {
        return res.status(200).json({ results: [], cost_usd: "0.00" });
      }

      const count = Math.min(Math.max(1, Number(num_results) || 5), 10);
      const results = await performWebSearch(cleanQuery, count);

      return res.status(200).json({
        results,
        cost_usd: "0.00",
      });
    } catch (err: any) {
      console.warn("[Web Tools] handleWebSearch error:", err);
      return res.status(200).json({ results: [], cost_usd: "0.00" });
    }
  };

  app.post("/tools/web-search", handleWebSearch);
  app.post("/api/tools/web-search", handleWebSearch);

  // 2. POST /tools/docs - Library & framework documentation lookup
  const handleDocsLookup = async (req: Request, res: Response) => {
    try {
      const { library = "", query = "", library_id } = req.body || {};
      const cleanLib = String(library).trim();
      const cleanQuery = String(query).trim();

      if (!cleanLib) {
        return res.status(400).json({ error: "Missing library parameter" });
      }

      const searchQuery = `${cleanLib} documentation ${cleanQuery}`.trim();
      const results = await performWebSearch(searchQuery, 3);

      const docsSnippet = results.length > 0
        ? results.map((r, i) => `[Source ${i + 1}: ${r.title}] (${r.url})\n${r.text}`).join("\n\n")
        : `No specific documentation found for ${cleanLib} (${cleanQuery}).`;

      return res.status(200).json({
        library_id: library_id || `lib_${cleanLib.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
        title: `${cleanLib} Documentation`,
        docs: docsSnippet,
        cost_usd: "0.00",
      });
    } catch (err: any) {
      console.warn("[Web Tools] handleDocsLookup error:", err);
      return res.status(200).json({
        library_id: `lib_${String(req.body?.library || "unknown").toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
        title: `${String(req.body?.library || "Library")} Documentation`,
        docs: "Documentation lookup temporarily unavailable.",
        cost_usd: "0.00",
      });
    }
  };

  app.post("/tools/docs", handleDocsLookup);
  app.post("/api/tools/docs", handleDocsLookup);
}
