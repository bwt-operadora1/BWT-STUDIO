import type { DestinationSearchSpec } from "./destinationContext";

export interface FetchOpts extends Partial<DestinationSearchSpec> {
  /** Legacy single-keyword input (still supported). */
  keyword?: string;
}

function normalizeOpts(input: string | FetchOpts): {
  searchTerms: string[];
  validationTokens: string[];
  locale: string;
  seed: string;
} {
  if (typeof input === "string") {
    return { searchTerms: [input], validationTokens: [], locale: "pt-BR", seed: input };
  }
  const searchTerms = input.searchTerms?.length
    ? input.searchTerms
    : input.keyword
      ? [input.keyword]
      : [];
  return {
    searchTerms,
    validationTokens: input.validationTokens ?? [],
    locale: input.locale ?? "pt-BR",
    seed: searchTerms[0] ?? "destino",
  };
}

/** Fetches a single destination photo URL. */
export async function fetchDestinationImage(
  input: string | FetchOpts,
): Promise<string | null> {
  const urls = await fetchDestinationImages(input, 1);
  return urls[0] ?? null;
}

/**
 * Fetches multiple destination photo URLs (up to `count`) via the
 * `search-images` edge function. The edge function runs a cascade of queries
 * and validates each photo against `validationTokens` so we don't return
 * globally-popular but unrelated shots (e.g. Iceland for "natural pools").
 */
export async function fetchDestinationImages(
  input: string | FetchOpts,
  count: number = 3,
): Promise<string[]> {
  const { searchTerms, validationTokens, locale, seed } = normalizeOpts(input);

  if (searchTerms.length > 0) {
    try {
      const { getCloudClient } = await import("@/lib/cloudClient");
      const supabase = await getCloudClient();
      const { data, error } = await supabase.functions.invoke("search-images", {
        body: { searchTerms, validationTokens, locale, count },
      });
      if (!error && Array.isArray(data?.urls) && data.urls.length > 0) {
        return data.urls.slice(0, count);
      }
    } catch {
      // fall through to deterministic placeholders
    }
  }

  return Array.from({ length: count }, (_, i) =>
    `https://picsum.photos/seed/${encodeURIComponent(seed)}-${i + 1}/1080/720`,
  );
}
