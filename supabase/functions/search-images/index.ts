import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const stripAccents = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Expand each term to also try its accent-stripped variant. */
function expandQueries(terms: string[]): string[] {
  const out: string[] = [];
  for (const t of terms) {
    const clean = (t ?? "").trim().replace(/\s+/g, " ");
    if (!clean) continue;
    if (!out.includes(clean)) out.push(clean);
    const noAcc = stripAccents(clean);
    if (noAcc !== clean && !out.includes(noAcc)) out.push(noAcc);
  }
  return out;
}

interface PexelsPhoto {
  url: string;
  alt: string;
  src: { large2x?: string; large?: string };
}

/**
 * Validate a photo against destination tokens. A photo is accepted if at least
 * one validation token (accent-stripped, lowercase) appears in its `alt` text
 * or Pexels page URL slug — matched as a WHOLE WORD/PHRASE, not a substring.
 *
 * Substring matching was the source of cross-destination false positives:
 * "rio" matched "inteRIOr", "male" (Malé) matched "feMALE", "natal" matched
 * "preNATAL", etc. We normalise both sides to space-separated alphanumeric
 * words and require the token to sit on word boundaries. As a bonus this also
 * lets multi-word phrase tokens ("praia do frances") match hyphenated URL
 * slugs ("praia-do-frances"), which a raw substring check would have missed.
 */
function normalizeHaystack(s: string): string {
  return ` ${stripAccents(s.toLowerCase()).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

function isPhotoRelevant(photo: PexelsPhoto, tokens: string[]): boolean {
  if (tokens.length === 0) return true; // no filter requested
  const haystack = normalizeHaystack(`${photo.alt ?? ""} ${photo.url ?? ""}`);
  return tokens.some((t) => {
    const tok = stripAccents((t ?? "").toLowerCase()).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
    return tok.length > 0 && haystack.includes(` ${tok} `);
  });
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const count: number = Math.min(Math.max(Number(body.count) || 3, 1), 10);
    const locale: string =
      typeof body.locale === "string" && body.locale ? body.locale : "pt-BR";
    const validationTokens: string[] = Array.isArray(body.validationTokens)
      ? body.validationTokens
          .filter((t: unknown): t is string => typeof t === "string")
          .map((t: string) => stripAccents(t.toLowerCase().trim()))
          .filter(Boolean)
      : [];

    // Accept either new `searchTerms[]` or legacy `keyword` (single string).
    const rawTerms: string[] = Array.isArray(body.searchTerms)
      ? body.searchTerms.filter((t: unknown): t is string => typeof t === "string")
      : typeof body.keyword === "string"
        ? [body.keyword]
        : [];

    if (rawTerms.length === 0) {
      return new Response(JSON.stringify({ error: "searchTerms or keyword is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pexelsKey = Deno.env.get("PEXELS_API_KEY");
    if (!pexelsKey) {
      return new Response(JSON.stringify({ error: "PEXELS_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cascade: try each term in order, collecting validated photos. Stop as
    // soon as we have enough relevant results.
    const queries = expandQueries(rawTerms);
    const validated: PexelsPhoto[] = [];
    const seenIds = new Set<string>();
    let triedTerms: string[] = [];
    let firstTermPhotos: PexelsPhoto[] = [];

    for (const query of queries) {
      triedTerms.push(query);
      const url =
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}` +
        `&per_page=80&orientation=landscape&size=large&locale=${encodeURIComponent(locale)}`;
      const resp = await fetch(url, { headers: { Authorization: pexelsKey } });
      if (!resp.ok) {
        console.error("Pexels API error:", resp.status, await resp.text());
        continue;
      }
      const json = await resp.json();
      const photos: PexelsPhoto[] = json.photos ?? [];
      // Remember the FIRST (most specific) query's raw results for fallback.
      if (triedTerms.length === 1) firstTermPhotos = photos;

      for (const p of photos) {
        const id = String((p as any).id ?? p.url);
        if (seenIds.has(id)) continue;
        if (!isPhotoRelevant(p, validationTokens)) continue;
        seenIds.add(id);
        validated.push(p);
      }
      if (validated.length >= count * 4) break; // enough to shuffle from
    }

    // If validation produced nothing, fall back to the MOST SPECIFIC query's
    // raw results (the curated keyword), never the generic last term. A
    // thematic shot of the right place beats a random globally-popular photo.
    let pool = validated;
    let strict = true;
    if (pool.length === 0) {
      pool = firstTermPhotos;
      strict = false;
    }

    if (pool.length === 0) {
      return new Response(
        JSON.stringify({ error: "No Pexels images found", triedTerms }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const shuffled = shuffle(pool).slice(0, count);
    const urls = shuffled.map((p) => p.src.large2x || p.src.large).filter(Boolean);

    return new Response(JSON.stringify({ urls, strict, triedTerms }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("search-images error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
