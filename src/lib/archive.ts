import { TravelData } from "@/types/travel";

export interface ArchiveEntry {
  id: string;
  savedAt: number;
  data: TravelData;
  outputs?: string[];
}

export const ARCHIVE_STORAGE_KEY = "bwt-archive";

const isEmbeddedAsset = (value: unknown) =>
  typeof value === "string" && /^(data:|blob:)/i.test(value);

const compactTravelDataForArchive = (data: TravelData): TravelData => {
  const compact: TravelData = { ...data };

  if (isEmbeddedAsset(compact.imageUrl)) delete compact.imageUrl;

  if (Array.isArray(compact.videoSceneImageUrls)) {
    const remoteUrls = compact.videoSceneImageUrls.filter((url) => !isEmbeddedAsset(url));
    if (remoteUrls.length > 0) compact.videoSceneImageUrls = remoteUrls;
    else delete compact.videoSceneImageUrls;
  }

  // Prices are never stored in the (publicly-readable) archive — the archive is
  // a usage log of which orçamentos were processed, not a price database.
  compact.precoTotal = "";
  compact.precoPorPessoa = "";
  compact.precoParcela = "";
  compact.precoAVista = "";

  return compact;
};

const compactEntry = (entry: ArchiveEntry): ArchiveEntry => ({
  ...entry,
  data: compactTravelDataForArchive(entry.data),
});

function persistArchiveEntries(entries: ArchiveEntry[]) {
  const compacted = entries.map(compactEntry).slice(0, 200);
  try {
    localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(compacted));
  } catch (err) {
    console.warn("[archive] local cache quota exceeded; keeping cloud archive only", err);
  }
  return compacted;
}

const makeSignature = (data: TravelData) =>
  data.archiveSessionId
    ? `sid:${data.archiveSessionId}`
    : `${data.destino}|${data.hotel}|${data.dataInicio || ""}`;

export function loadArchiveEntries(): ArchiveEntry[] {
  try {
    const raw = localStorage.getItem(ARCHIVE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveArchiveEntry(data: TravelData, output?: string): ArchiveEntry[] {
  const list = loadArchiveEntries().map(compactEntry);
  const archiveData = compactTravelDataForArchive(data);
  const signature = makeSignature(archiveData);
  const existingIdx = list.findIndex((e) => makeSignature(e.data) === signature);
  const previous = existingIdx >= 0 ? list[existingIdx] : undefined;
  const outputs = Array.from(
    new Set([...(previous?.outputs ?? []), output].filter(Boolean) as string[]),
  );
  const entry: ArchiveEntry = {
    id: previous?.id ?? crypto.randomUUID(),
    savedAt: Date.now(),
    data: archiveData,
    outputs,
  };
  if (existingIdx >= 0) list[existingIdx] = entry;
  else list.unshift(entry);
  void syncToCloud(entry);
  return persistArchiveEntries(list);
}

// Delegates to the archive-records edge function so the read+merge+upsert
// happens atomically server-side, avoiding races when multiple outputs are
// saved in quick succession.
async function syncToCloud(entry: ArchiveEntry) {
  try {
    const { getCloudClient } = await import("@/lib/cloudClient");
    const supabase = await getCloudClient();
    const lastOutput = entry.outputs?.[entry.outputs.length - 1];
    const { error } = await supabase.functions.invoke("archive-records", {
      body: {
        action: "upsert",
        entry: { ...entry, data: entry.data },
        output: lastOutput,
      },
    });
    if (error) console.warn("[archive] syncToCloud failed:", error);
  } catch (e) {
    console.warn("[archive] syncToCloud exception:", e);
  }
}

export async function loadArchiveEntriesFromCloud(): Promise<ArchiveEntry[]> {
  try {
    const { getCloudClient } = await import("@/lib/cloudClient");
    const supabase = await getCloudClient();
    const { data, error } = await supabase
      .from("content_archive")
      .select("id, updated_at, data, outputs")
      .order("updated_at", { ascending: false });

    if (error || !Array.isArray(data)) return loadArchiveEntries();

    const cloudEntries: ArchiveEntry[] = data.map((row) => ({
      id: row.id,
      savedAt: new Date(row.updated_at).getTime(),
      data: row.data as unknown as TravelData,
      outputs: row.outputs ?? [],
    }));

    // The cloud is the single source of truth for the archive — browser-local
    // entries are NOT merged in. Merging local caused per-machine count drift
    // (each browser kept its own local copies, so one PC showed 32 and another
    // 23). We just sort the cloud rows and refresh the localStorage cache, which
    // now serves only as an offline fallback when the cloud read fails.
    const sorted = cloudEntries.sort((a, b) => b.savedAt - a.savedAt);
    return persistArchiveEntries(sorted);
  } catch {
    return loadArchiveEntries();
  }
}

export async function deleteArchiveEntry(id: string) {
  try {
    const { getCloudClient } = await import("@/lib/cloudClient");
    const supabase = await getCloudClient();
    await supabase.functions.invoke("archive-records", {
      body: { action: "delete", id },
    });
  } catch {
    // ignore
  }
}

export async function clearArchiveEntries() {
  try {
    const { getCloudClient } = await import("@/lib/cloudClient");
    const supabase = await getCloudClient();
    await supabase.functions.invoke("archive-records", {
      body: { action: "clear" },
    });
  } catch {
    // ignore
  }
}
