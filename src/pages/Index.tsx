import { useState, useCallback, useRef, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import PdfUpload from "@/components/PdfUpload";
import CanvasPreview from "@/components/CanvasPreview";
import VideoGenerator from "@/components/VideoGenerator";
import ScriptGenerator from "@/components/ScriptGenerator";
import DataDashboard from "@/components/DataDashboard";
import { TravelData } from "@/types/travel";
import { saveArchiveEntry } from "@/lib/archive";
import { Image, Video, FileText, Upload, Save, CheckCircle2, RefreshCw, Plane } from "lucide-react";

const Index = () => {
  const [travelData, setTravelData] = useState<TravelData | null>(null);
  const [activeTab, setActiveTab] = useState("lamina");
  const [isDirty, setIsDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [contentKey, setContentKey] = useState(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDataChange = useCallback((data: TravelData) => {
    setTravelData(data);
    setIsDirty(true);
    setSaveState("idle");
  }, []);

  const handleDataExtracted = useCallback((data: TravelData) => {
    const withSession: TravelData = {
      ...data,
      archiveSessionId: crypto.randomUUID(),
    };
    setTravelData(withSession);
    try {
      saveArchiveEntry(withSession, "Orçamento gerado");
    } catch {
      // ignore storage errors
    }
  }, []);

  const handleSave = useCallback(() => {
    if (!travelData) return;
    setSaveState("saving");
    try {
      try {
        localStorage.setItem("bwt-session", JSON.stringify(travelData));
      } catch (err) {
        // QuotaExceededError: TravelData may include large base64 image data URLs
        // from user uploads. Drop the heavy fields and retry so the save still works.
        console.warn("[Index] localStorage quota exceeded, saving without embedded images", err);
        try {
          const lite = {
            ...travelData,
            imageUrl: travelData.imageUrl?.startsWith("data:") ? undefined : travelData.imageUrl,
            videoSceneImageUrls: travelData.videoSceneImageUrls?.map((u) =>
              u?.startsWith("data:") ? undefined : u
            ),
          };
          localStorage.setItem("bwt-session", JSON.stringify(lite));
        } catch {
          // give up on local persistence — cloud archive still receives the entry
        }
      }
      try {
        saveArchiveEntry(travelData, "Salvo");
      } catch {
        // ignore archive errors
      }
      setContentKey((k) => k + 1);
      setIsDirty(false);
    } finally {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        setSaveState("saved");
        saveTimerRef.current = setTimeout(() => setSaveState("idle"), 2500);
      }, 400);
    }
  }, [travelData]);

  const handleNewUpload = () => {
    localStorage.removeItem("bwt-session");
    setTravelData(null);
    setIsDirty(false);
    setSaveState("idle");
  };

  useEffect(() => {
    if (!travelData) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty) handleSave();
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === "1") setActiveTab("lamina");
        if (e.key === "2") setActiveTab("video");
        if (e.key === "3") setActiveTab("script");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [travelData, isDirty, handleSave]);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  // ── Upload screen — full viewport, no header ──────────────────────────────
  if (!travelData) {
    return <PdfUpload onDataExtracted={handleDataExtracted} />;
  }

  // ── App shell — header + sidebar + tabs ───────────────────────────────────
  const showSaveBar = isDirty || saveState !== "idle";

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* ── Header ── */}
      <header
        className="sticky top-0 z-20 border-b border-border/50 shrink-0"
        style={{ backdropFilter: "blur(12px)", background: "hsl(var(--background)/0.92)" }}
      >
        <div className="px-5 py-3 flex items-center gap-4">

          {/* Brand */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center font-display font-black select-none shrink-0"
              style={{
                fontSize: 10,
                background: "linear-gradient(135deg, #7C3AED 0%, #6B21A8 100%)",
                color: "#fff",
                boxShadow: "0 2px 8px rgba(107,33,168,0.45)",
              }}
            >
              BWT
            </div>
            <span
              className="font-display font-black uppercase leading-none"
              style={{ fontSize: 15, letterSpacing: "0.12em", color: "hsl(var(--foreground))" }}
            >
              Studio
            </span>
          </div>

          {/* Destination pill */}
          <div className="flex-1 flex justify-center">
            <div
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
              style={{
                background: "rgba(147,51,234,0.08)",
                border: "1px solid rgba(147,51,234,0.2)",
                color: "#9333EA",
              }}
            >
              <Plane className="w-3 h-3" />
              {travelData.destino}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
                  <Upload className="w-3 h-3" />
                  Novo Upload
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Iniciar novo upload?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Todos os dados do orçamento atual serão perdidos. Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleNewUpload}
                    style={{ background: "#9333EA", color: "#fff" }}
                  >
                    Sim, novo upload
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </header>

      {/* ── Main layout ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Sidebar ── */}
        <aside
          className="hidden lg:flex flex-col border-r border-border/50 shrink-0 overflow-y-auto"
          style={{ width: 320 }}
        >
          <div className="p-4">
            <DataDashboard data={travelData} onChange={handleDataChange} />
          </div>
        </aside>

        {/* ── Content ── */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-6 py-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3 bg-muted/60 rounded-xl p-1 h-auto mb-6">
                <TabsTrigger
                  value="lamina"
                  className="flex items-center gap-1.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm py-2"
                >
                  <Image className="w-3.5 h-3.5" />
                  <span className="text-sm font-medium">Lâmina</span>
                </TabsTrigger>
                <TabsTrigger
                  value="video"
                  className="flex items-center gap-1.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm py-2"
                >
                  <Video className="w-3.5 h-3.5" />
                  <span className="text-sm font-medium">Vídeo</span>
                </TabsTrigger>
                <TabsTrigger
                  value="script"
                  className="flex items-center gap-1.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm py-2"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="text-sm font-medium">Script</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="lamina">
                <CanvasPreview key={`lamina-${contentKey}`} data={travelData} onDataChange={handleDataChange} />
              </TabsContent>
              <TabsContent value="video">
                <VideoGenerator key={`video-${contentKey}`} data={travelData} onDataChange={handleDataChange} />
              </TabsContent>
              <TabsContent value="script">
                <ScriptGenerator key={`script-${contentKey}`} data={travelData} />
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>

      {/* ── Floating save pill ── */}
      <div
        className="fixed bottom-4 right-4 z-30 transition-all duration-300 ease-in-out"
        style={{
          opacity: showSaveBar ? 1 : 0,
          transform: showSaveBar ? "translateY(0) scale(1)" : "translateY(6px) scale(0.96)",
          pointerEvents: showSaveBar ? "auto" : "none",
        }}
      >
        {saveState === "saved" ? (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold shadow-lg"
            style={{ background: "rgba(16,185,129,0.95)", color: "#fff", backdropFilter: "blur(8px)" }}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Salvo!
          </div>
        ) : (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg"
            style={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              backdropFilter: "blur(8px)",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse" style={{ background: "#f59e0b" }} />
            <p className="text-xs text-muted-foreground whitespace-nowrap">Alterações não salvas</p>
            <Button
              onClick={handleSave}
              disabled={saveState === "saving"}
              size="sm"
              className="h-6 px-2 gap-1 text-xs font-semibold shrink-0"
              style={{ background: "#9333EA", color: "#fff" }}
            >
              {saveState === "saving" ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <><Save className="w-3 h-3" />Salvar</>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
