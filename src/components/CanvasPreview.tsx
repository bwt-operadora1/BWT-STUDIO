import { Download, Image as ImageIcon, RefreshCw, Edit2, Upload } from "lucide-react";
import { useRef, useEffect, useState } from "react";
import { TravelData } from "@/types/travel";
import { Button } from "@/components/ui/button";
import { useDestinationImage } from "@/hooks/useDestinationImage";
import { drawFeed, drawStory, LaminaState, DEFAULT_LAMINA_STATE, IMAGE_DISCLAIMER } from "@/lib/laminaRenderer";
import { saveArchiveEntry } from "@/lib/archive";
import { loadImageNoTaint } from "@/lib/imageLoader";
import { compressImageToDataUrl } from "@/lib/imageCompress";
import { validateImageFile, ACCEPTED_IMAGE_ACCEPT_ATTR, ACCEPTED_IMAGE_LABEL } from "@/lib/imageValidation";
import { toast } from "@/hooks/use-toast";
import LaminaEditor from "./LaminaEditor";

interface CanvasPreviewProps {
  data: TravelData;
  onDataChange?: (data: TravelData) => void;
}

// Both formats render at full export resolution so preview = download
const FEED_W = 1080, FEED_H = 1080;
const FW = 320, FH = 320;

const STORY_W = 1080, STORY_H = 1920;
const SW = 320, SH = Math.round((320 * 1920) / 1080);
const STORY_SCALE = SW / STORY_W; // CSS transform scale factor

// Shimmer skeleton for canvas loading state
const CanvasSkeleton = ({ width, height }: { width: number; height: number }) => (
  <div
    style={{ width, height, borderRadius: 12, overflow: "hidden" }}
    className="relative"
  >
    <div
      className="absolute inset-0 animate-pulse"
      style={{ background: "linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--muted-foreground)/0.08) 50%, hsl(var(--muted)) 75%)", backgroundSize: "200% 100%" }}
    />
  </div>
);

const CanvasPreview = ({ data, onDataChange }: CanvasPreviewProps) => {
  const storyRef = useRef<HTMLCanvasElement>(null);
  const feedRef = useRef<HTMLCanvasElement>(null);
  const imageUploadRef = useRef<HTMLInputElement>(null);

  const [exportingStory, setExportingStory] = useState(false);
  const [exportingFeed, setExportingFeed] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [feedState, setFeedState] = useState<LaminaState>(DEFAULT_LAMINA_STATE);
  const [storyState, setStoryState] = useState<LaminaState>(DEFAULT_LAMINA_STATE);
  const [feedBgEl, setFeedBgEl] = useState<HTMLImageElement | null>(null);
  const [storyBgEl, setStoryBgEl] = useState<HTMLImageElement | null>(null);

  const { imageEl, loading: imageLoading } = useDestinationImage(data.destino);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const err = validateImageFile(file);
    if (err) {
      toast({ title: "Formato inválido", description: err, variant: "destructive" });
      return;
    }
    try {
      const url = await compressImageToDataUrl(file);
      setFeedState((prev) => ({ ...prev, bgImageUrl: url }));
      setStoryState((prev) => ({ ...prev, bgImageUrl: url }));
      onDataChange?.({ ...data, imageUrl: url });
    } catch (err) {
      console.error("[CanvasPreview] image upload failed", err);
      toast({ title: "Falha no upload", description: "Não foi possível processar a imagem.", variant: "destructive" });
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadBg = async (url: string | undefined, setter: (img: HTMLImageElement | null) => void) => {
      if (!url) {
        setter(null);
        return;
      }
      const img = await loadImageNoTaint(url);
      if (!cancelled) setter(img);
    };
    loadBg(feedState.bgImageUrl || data.imageUrl, setFeedBgEl);
    loadBg(storyState.bgImageUrl || data.imageUrl, setStoryBgEl);
    return () => { cancelled = true; };
  }, [feedState.bgImageUrl, storyState.bgImageUrl, data.imageUrl]);

  useEffect(() => {
    if (!feedRef.current) return;
    const canvas = feedRef.current;
    Promise.all([
      document.fonts.ready,
      document.fonts.load("800 48px 'Barlow Condensed'"),
    ]).then(() => {
      if (canvas)
        drawFeed(canvas, data, FEED_W, FEED_H, feedBgEl ?? imageEl, { laminaState: feedState });
    });
  }, [data, imageEl, feedBgEl, feedState]);

  useEffect(() => {
    if (!storyRef.current) return;
    const canvas = storyRef.current;
    Promise.all([
      document.fonts.ready,
      document.fonts.load("800 48px 'Barlow Condensed'"),
    ]).then(() => {
      if (canvas)
        drawStory(canvas, data, STORY_W, STORY_H, storyBgEl ?? imageEl, { laminaState: storyState });
    });
  }, [data, imageEl, storyBgEl, storyState]);

  const exportCanvas = async (
    format: "feed" | "story",
    bgEl: HTMLImageElement | null,
    setExporting: (v: boolean) => void,
    laminaState: LaminaState,
  ) => {
    setExporting(true);
    try {
      // Draw on a fresh offscreen canvas — this is never tainted regardless of
      // what happened to the preview canvas during live rendering.
      const offscreen = document.createElement("canvas");
      const W = format === "feed" ? FEED_W : STORY_W;
      const H = format === "feed" ? FEED_H : STORY_H;
      offscreen.width = W;
      offscreen.height = H;
      await Promise.all([
        document.fonts.ready,
        document.fonts.load("800 48px 'Barlow Condensed'"),
      ]);
      if (format === "feed") {
        drawFeed(offscreen, data, W, H, bgEl ?? imageEl, { laminaState });
      } else {
        drawStory(offscreen, data, W, H, bgEl ?? imageEl, { laminaState });
      }
      saveArchiveEntry(data, format === "feed" ? "Feed PNG" : "Story PNG");
      offscreen.toBlob((blob) => {
        setExporting(false);
        if (!blob) {
          toast({ title: "Falha ao exportar", description: "Não foi possível gerar o PNG.", variant: "destructive" });
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `bwt-${data.destino.toLowerCase().replace(/\s+/g, "-")}-${format}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    } catch (err) {
      console.error("[CanvasPreview] export failed", err, { name: (err as any)?.name, message: (err as any)?.message });
      toast({
        title: "Erro ao exportar",
        description: `Falha: ${(err as any)?.message ?? "desconhecida"}. Tente outra imagem.`,
        variant: "destructive",
      });
      setExporting(false);
    }
  };

  const handleExportFeed = () => exportCanvas("feed", feedBgEl, setExportingFeed, feedState);
  const handleExportStory = () => exportCanvas("story", storyBgEl, setExportingStory, storyState);

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2">
          <ImageIcon className="w-5 h-5" style={{ color: "#9333EA" }} />
          <h2 className="text-2xl font-display font-semibold">Lâminas</h2>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
          <p className="text-xs text-muted-foreground text-center sm:text-left">
            {IMAGE_DISCLAIMER}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => imageUploadRef.current?.click()}
            className="gap-2 shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            Trocar imagem
          </Button>
          <input
            ref={imageUploadRef}
            type="file"
            accept={ACCEPTED_IMAGE_ACCEPT_ATTR}
            className="hidden"
            onChange={handleImageUpload}
          />
        </div>

        {/* Preview grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* ── Feed ── */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-full flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm">Feed</p>
                <p className="text-xs text-muted-foreground">1080 × 1080 px</p>
              </div>
            </div>

            {/* Canvas or shimmer */}
            <div style={{ borderRadius: 12, overflow: "hidden", boxShadow: "0 10px 40px rgba(0,0,0,0.3)" }}>
              {imageLoading ? (
                <CanvasSkeleton width={FW} height={FH} />
              ) : (
                <canvas ref={feedRef} width={FEED_W} height={FEED_H} style={{ display: "block", width: FW, height: FH }} />
              )}
            </div>

            {/* Photo status */}
            {!imageLoading && imageEl && (
              <span className="text-xs font-medium" style={{ color: "#10b981" }}>● Foto carregada</span>
            )}

            {/* Export button */}
            <Button
              onClick={handleExportFeed}
              disabled={exportingFeed || imageLoading}
              className="w-full gap-2 font-semibold"
              style={{ background: "#9333EA", color: "#0d1b2a" }}
            >
              {exportingFeed
                ? <><RefreshCw className="w-4 h-4 animate-spin" />Gerando...</>
                : <><Download className="w-4 h-4" />Exportar Feed PNG</>}
            </Button>
          </div>

          {/* ── Story ── */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-full flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm">Story</p>
                <p className="text-xs text-muted-foreground">1080 × 1920 px</p>
              </div>
            </div>

            {/* Canvas or shimmer */}
            <div style={{ width: SW, height: SH, borderRadius: 12, overflow: "hidden", boxShadow: "0 10px 40px rgba(0,0,0,0.3)", position: "relative" }}>
              {imageLoading ? (
                <CanvasSkeleton width={SW} height={SH} />
              ) : (
                <canvas
                  ref={storyRef}
                  width={STORY_W}
                  height={STORY_H}
                  style={{ display: "block", transformOrigin: "top left", transform: `scale(${STORY_SCALE})` }}
                />
              )}
            </div>

            {/* Photo status */}
            {!imageLoading && imageEl && (
              <span className="text-xs font-medium" style={{ color: "#10b981" }}>● Foto carregada</span>
            )}

            {/* Export button */}
            <Button
              onClick={handleExportStory}
              disabled={exportingStory || imageLoading}
              className="w-full gap-2 font-semibold"
              style={{ background: "#9333EA", color: "#0d1b2a" }}
            >
              {exportingStory
                ? <><RefreshCw className="w-4 h-4 animate-spin" />Gerando...</>
                : <><Download className="w-4 h-4" />Exportar Story PNG</>}
            </Button>
          </div>
        </div>

        {/* Open Editor — centered below both previews */}
        <div className="flex justify-center pt-2">
          <Button
            onClick={() => setEditorOpen(true)}
            variant="outline"
            className="gap-2 font-semibold"
            style={{ borderColor: "rgba(147,51,234,0.4)", color: "#9333EA" }}
          >
            <Edit2 className="w-4 h-4" />
            Abrir Editor Avançado
          </Button>
        </div>

      </div>

      {editorOpen && (
        <LaminaEditor
          data={data}
          initialFeedState={feedState}
          initialStoryState={storyState}
          onClose={() => setEditorOpen(false)}
          onSave={(fs, ss) => { setFeedState(fs); setStoryState(ss); }}
          onDataChange={onDataChange}
        />
      )}
    </>
  );
};

export default CanvasPreview;
