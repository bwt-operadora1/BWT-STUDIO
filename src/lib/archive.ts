import { TravelData } from "@/types/travel";

export interface ArchiveEntry {
  id: string;
  savedAt: number;
  data: TravelData;
  outputs?: string[];
}

export const ARCHIVE_STORAGE_KEY = "bwt-archive";

const makeSignature = (data: TravelData) =>
  `${data.destino}|${data.hotel}|${data.dataInicio || ""}`;

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
  const list = loadArchiveEntries();
  const signature = makeSignature(data);
  const existingIdx = list.findIndex((e) => makeSignature(e.data) === signature);
  const previous = existingIdx >= 0 ? list[existingIdx] : undefined;
  const outputs = Array.from(
    new Set([...(previous?.outputs ?? []), output].filter(Boolean) as string[]),
  );
  const entry: ArchiveEntry = {
    id: previous?.id ?? crypto.randomUUID(),
    savedAt: Date.now(),
    data,
    outputs,
  };
  if (existingIdx >= 0) list[existingIdx] = entry;
  else list.unshift(entry);
  localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(list));
  void syncToCloud(entry);
  return list;
}

// Writes directly to content_archive using the typed Supabase client.
// Merges cloud outputs with local so concurrent users on the same
// orçamento don't overwrite each other's activity.
async function syncToCloud(entry: ArchiveEntry) {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
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
  const local = loadArchiveEntries();
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase
      .from("content_archive")
      .select("id, updated_at, data, outputs")
      .order("updated_at", { ascending: false });

    if (error || !Array.isArray(data)) return local;

    const cloudEntries: ArchiveEntry[] = data.map((row) => ({
      id: row.id,
      savedAt: new Date(row.updated_at).getTime(),
      data: row.data as unknown as TravelData,
      outputs: row.outputs ?? [],
    }));

    // Preserve local-only entries not yet synced to cloud
    const cloudIds = new Set(cloudEntries.map((e) => e.id));
    const localOnly = local.filter((e) => !cloudIds.has(e.id));
    const merged = [...cloudEntries, ...localOnly].sort((a, b) => b.savedAt - a.savedAt);
    localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return local;
  }
}

export async function deleteArchiveEntry(id: string) {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    await supabase.functions.invoke("archive-records", {
      body: { action: "delete", id },
    });
  } catch {
    // ignore
  }
}

export async function clearArchiveEntries() {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    await supabase.functions.invoke("archive-records", {
      body: { action: "clear" },
    });
  } catch {
    // ignore
  }
}
