import { X, Download, Plus, Trash2, Eye, EyeOff, Upload, RotateCcw } from "lucide-react";
import { useRef, useEffect, useState, useCallback } from "react";
import { TravelData } from "@/types/travel";
import { Button } from "@/components/ui/button";
import {
  drawFeed, drawStory,
  LaminaState, LaminaStyles, ElemKey, CustomText, HitRegion, DrawOpts,
  DEFAULT_LAMINA_STATE, scaleLaminaState,
} from "@/lib/laminaRenderer";
import { saveArchiveEntry } from "@/lib/archive";
import { useDestinationImage } from "@/hooks/useDestinationImage";
import { loadImageNoTaint } from "@/lib/imageLoader";
import { compressImageToDataUrl } from "@/lib/imageCompress";
import { validateImageFile, ACCEPTED_IMAGE_ACCEPT_ATTR } from "@/lib/imageValidation";
import { toast } from "@/hooks/use-toast";

// ─── Element metadata ─────────────────────────────────────────────────────────

const ELEM_META: { key: ElemKey; label: string }[] = [
  { key: "badge",       label: "Badge de Desconto" },
  { key: "tag",         label: "Tag de Produto" },
  { key: "destination", label: "Destino / Hotel" },
  { key: "inclui",      label: "O que Inclui" },
  { key: "price",       label: "Preço" },
  { key: "datePill",    label: "Datas" },
  { key: "airline",     label: "Cia. Aérea" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type Format = "feed" | "story";

interface DragState {
  key: string;
  isCustom: boolean;
  startX: number; startY: number;
  origDx: number; origDy: number;
}

interface Props {
  data: TravelData;
  initialFeedState: LaminaState;
  initialStoryState: LaminaState;
  onClose: () => void;
  onSave: (feedState: LaminaState, storyState: LaminaState) => void;
  onDataChange?: (data: TravelData) => void;
}

// ─── Small reusable input ─────────────────────────────────────────────────────

function LabeledInput({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="space-y-0.5">
      <label className="text-xs text-muted-foreground">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-xs rounded-lg px-2 py-1.5"
        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0", outline: "none" }}
      />
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LaminaEditor({ data, initialFeedState, initialStoryState, onClose, onSave, onDataChange }: Props) {
  const [format, setFormat] = useState<Format>("feed");
  const [feedState, setFeedState] = useState<LaminaState>(initialFeedState);
  const [storyState, setStoryState] = useState<LaminaState>(initialStoryState);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [bgLoading, setBgLoading] = useState(false);
  const [localData, setLocalData] = useState<TravelData>(data);

  const updateData = (patch: Partial<TravelData>) =>
    setLocalData(prev => ({ ...prev, ...patch }));

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitsRef = useRef<HitRegion[]>([]);
  const dragRef = useRef<DragState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Destination image (can be overridden by custom bg)
  const { imageEl: defaultImageEl } = useDestinationImage(data.destino);
  const [customBgEl, setCustomBgEl] = useState<HTMLImageElement | null>(null);

  const curState = format === "feed" ? feedState : storyState;
  const setCurState = format === "feed" ? setFeedState : setStoryState;

  // Canvas display dimensions
  const CANVAS_W = format === "feed" ? 540 : 432;
  const CANVAS_H = format === "feed" ? 540 : Math.round((432 * 1920) / 1080);

  const bgImage = customBgEl ?? defaultImageEl;

  // ─── Draw ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const opts: DrawOpts = { laminaState: curState, hoveredKey, selectedKey };
    const hits = format === "feed"
      ? drawFeed(canvas, localData, CANVAS_W, CANVAS_H, bgImage, opts)
      : drawStory(canvas, localData, CANVAS_W, CANVAS_H, bgImage, opts);
    hitsRef.current = hits;
  }, [curState, hoveredKey, selectedKey, format, data, bgImage, CANVAS_W, CANVAS_H]);

  // ─── Mouse interaction ────────────────────────────────────────────────────

  const getHit = useCallback((e: MouseEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * sx;
    const cy = (e.clientY - rect.top) * sy;
    return hitsRef.current.find(r => cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) ?? null;
  }, []);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    const hit = getHit(e);
    if (!hit) { setSelectedKey(null); return; }
    setSelectedKey(hit.key);
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * sx;
    const cy = (e.clientY - rect.top) * sy;
    const isCustom = !ELEM_META.some(m => m.key === hit.key);
    if (isCustom) {
      const ct = curState.customTexts.find(t => t.id === hit.key);
      if (ct) dragRef.current = { key: hit.key, isCustom: true, startX: cx, startY: cy, origDx: ct.xFrac * CANVAS_W, origDy: ct.yFrac * CANVAS_H };
    } else {
      const k = hit.key as ElemKey;
      const s = curState.styles[k];
      dragRef.current = { key: hit.key, isCustom: false, startX: cx, startY: cy, origDx: s?.dx ?? 0, origDy: s?.dy ?? 0 };
    }
    canvas.style.cursor = "grabbing";
  }, [getHit, curState, CANVAS_W, CANVAS_H]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * sx;
    const cy = (e.clientY - rect.top) * sy;

    if (dragRef.current) {
      const { key, isCustom, startX, startY, origDx, origDy } = dragRef.current;
      const ndx = origDx + (cx - startX);
      const ndy = origDy + (cy - startY);
      if (isCustom) {
        setCurState(prev => ({
          ...prev,
          customTexts: prev.customTexts.map(t =>
            t.id === key ? { ...t, xFrac: ndx / CANVAS_W, yFrac: ndy / CANVAS_H } : t
          ),
        }));
      } else {
        setCurState(prev => ({
          ...prev,
          styles: { ...prev.styles, [key as ElemKey]: { ...prev.styles[key as ElemKey], dx: ndx, dy: ndy } },
        }));
      }
    } else {
      const hit = getHit(e);
      setHoveredKey(hit?.key ?? null);
      canvas.style.cursor = hit ? "grab" : "default";
    }
  }, [getHit, setCurState, CANVAS_W, CANVAS_H]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
    if (canvasRef.current) canvasRef.current.style.cursor = "default";
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp]);

  // ─── Style helpers ────────────────────────────────────────────────────────

  const updateStyle = (key: ElemKey, patch: Partial<LaminaStyles[ElemKey]>) => {
    setCurState(prev => ({
      ...prev,
      styles: { ...prev.styles, [key]: { ...prev.styles[key], ...patch } },
    }));
  };

  const getStyleVal = <K extends keyof NonNullable<LaminaStyles[ElemKey]>>(
    key: ElemKey, prop: K, def: NonNullable<LaminaStyles[ElemKey]>[K],
  ): NonNullable<LaminaStyles[ElemKey]>[K] => (curState.styles[key]?.[prop] ?? def) as NonNullable<LaminaStyles[ElemKey]>[K];

  const isVisible = (key: ElemKey) => curState.styles[key]?.visible !== false;

  // ─── Custom text helpers ──────────────────────────────────────────────────

  const addCustomText = () => {
    const id = `ct-${Date.now()}`;
    const ct: CustomText = { id, xFrac: 0.1, yFrac: 0.5, text: "Texto livre", fontSizeH: 0.04, color: "#ffffff", bold: false };
    setCurState(prev => ({ ...prev, customTexts: [...prev.customTexts, ct] }));
    setSelectedKey(id);
  };

  const updateCustomText = (id: string, patch: Partial<CustomText>) => {
    setCurState(prev => ({
      ...prev,
      customTexts: prev.customTexts.map(t => t.id === id ? { ...t, ...patch } : t),
    }));
  };

  const deleteCustomText = (id: string) => {
    setCurState(prev => ({ ...prev, customTexts: prev.customTexts.filter(t => t.id !== id) }));
    if (selectedKey === id) setSelectedKey(null);
  };

  // ─── Background image upload ──────────────────────────────────────────────

  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const err = validateImageFile(file);
    if (err) {
      toast({ title: "Formato inválido", description: err, variant: "destructive" });
      return;
    }
    setBgLoading(true);
    try {
      const url = await compressImageToDataUrl(file);
      const img = await loadImageNoTaint(url);
      if (img) setCustomBgEl(img);
      setCurState(prev => ({ ...prev, bgImageUrl: url }));
      updateData({ imageUrl: url });
    } catch (err) {
      console.error("[LaminaEditor] bg upload failed", err);
      toast({ title: "Falha no upload", description: "Não foi possível processar a imagem.", variant: "destructive" });
    } finally {
      setBgLoading(false);
    }
  };

  const clearCustomBg = () => {
    setCustomBgEl(null);
    setCurState(prev => ({ ...prev, bgImageUrl: undefined }));
    updateData({ imageUrl: undefined });
  };

  // ─── Export ───────────────────────────────────────────────────────────────

  const handleExport = async () => {
    setExporting(true);
    try {
      const exportCanvas = document.createElement("canvas");
      const exportW = 1080;
      const exportH = format === "feed" ? 1080 : 1920;
      const scaleFactor = exportW / CANVAS_W;
      const scaledState = scaleLaminaState(curState, CANVAS_W, exportW);
      const fn = format === "feed" ? drawFeed : drawStory;
      fn(exportCanvas, localData, exportW, exportH, bgImage, { laminaState: scaledState });
      saveArchiveEntry(localData, format === "feed" ? "Feed PNG" : "Story PNG");
      exportCanvas.toBlob((blob) => {
        setExporting(false);
        if (!blob) {
          toast({ title: "Falha ao exportar", description: "Não foi possível gerar o PNG. Tente trocar a imagem de fundo.", variant: "destructive" });
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `bwt-${localData.destino.toLowerCase().replace(/\s+/g, "-")}-${format}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    } catch (err) {
      console.error("[LaminaEditor] export failed", err, { name: (err as any)?.name, message: (err as any)?.message });
      toast({ title: "Erro ao exportar", description: `Falha: ${(err as any)?.message ?? "desconhecida"}.`, variant: "destructive" });
      setExporting(false);
    }
  };

  // ─── Selected element controls ────────────────────────────────────────────

  const selectedElemMeta = ELEM_META.find(m => m.key === selectedKey);
  const selectedCustomText = curState.customTexts.find(t => t.id === selectedKey);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "#0a0f1a" }}
    >
      {/* ── Top bar ── */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0 gap-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "#0d1420" }}
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-white text-sm">Editor de Lâmina</span>
          <span className="text-xs text-muted-foreground hidden sm:block">· {data.destino}</span>
        </div>

        {/* Format tabs */}
        <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: "rgba(255,255,255,0.06)" }}>
          {(["feed", "story"] as Format[]).map(f => (
            <button
              key={f}
              onClick={() => { setFormat(f); setSelectedKey(null); }}
              className="px-3 py-1 rounded-md text-xs font-medium transition-colors"
              style={{
                background: format === f ? "#00b4c8" : "transparent",
                color: format === f ? "#003d45" : "#a0aec0",
              }}
            >
              {f === "feed" ? "Feed (1:1)" : "Story (4:5)"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm" variant="outline"
            onClick={() => { setFeedState(DEFAULT_LAMINA_STATE); setStoryState(DEFAULT_LAMINA_STATE); setSelectedKey(null); }}
            className="gap-1 text-xs hidden sm:flex"
          >
            <RotateCcw className="w-3 h-3" /> Resetar
          </Button>
          <Button
            size="sm"
            onClick={handleExport}
            disabled={exporting}
            style={{ background: "#00b4c8", color: "#003d45" }}
            className="gap-1 text-xs font-semibold"
          >
            <Download className="w-3 h-3" />
            {exporting ? "Gerando..." : "Exportar PNG"}
          </Button>
          <Button
            size="sm" variant="ghost"
            onClick={() => { onSave(feedState, storyState); onDataChange?.(localData); onClose(); }}
            style={{ color: "#a0aec0" }}
            className="gap-1 text-xs"
          >
            Salvar e Fechar
          </Button>
          <Button size="icon" variant="ghost" onClick={onClose} className="h-7 w-7 text-muted-foreground">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel ── */}
        <div
          className="w-56 shrink-0 flex flex-col overflow-y-auto"
          style={{ borderRight: "1px solid rgba(255,255,255,0.08)", background: "#0d1420" }}
        >
          {/* Element list */}
          <div className="p-3 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Elementos</p>
            {ELEM_META.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSelectedKey(selectedKey === key ? null : key)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors"
                style={{
                  background: selectedKey === key ? "rgba(0,180,200,0.15)" : "transparent",
                  color: isVisible(key) ? "#e2e8f0" : "#4a5568",
                  border: selectedKey === key ? "1px solid rgba(0,180,200,0.4)" : "1px solid transparent",
                }}
              >
                <span>{label}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); updateStyle(key, { visible: !isVisible(key) }); }}
                  className="p-0.5 rounded hover:bg-white/10"
                >
                  {isVisible(key)
                    ? <Eye className="w-3 h-3 text-muted-foreground" />
                    : <EyeOff className="w-3 h-3 text-muted-foreground" />}
                </button>
              </button>
            ))}

            {/* Custom texts list */}
            {curState.customTexts.length > 0 && (
              <>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-3 mb-1">Textos Livres</p>
                {curState.customTexts.map(ct => (
                  <button
                    key={ct.id}
                    onClick={() => setSelectedKey(selectedKey === ct.id ? null : ct.id)}
                    className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors"
                    style={{
                      background: selectedKey === ct.id ? "rgba(0,180,200,0.15)" : "transparent",
                      color: "#e2e8f0",
                      border: selectedKey === ct.id ? "1px solid rgba(0,180,200,0.4)" : "1px solid transparent",
                    }}
                  >
                    <span className="truncate max-w-[100px]">{ct.text || "Texto"}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteCustomText(ct.id); }}
                      className="p-0.5 rounded hover:bg-red-500/20 text-red-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </button>
                ))}
              </>
            )}
          </div>

          {/* Add text + bg buttons */}
          <div className="p-3 space-y-2 mt-auto border-t border-white/5">
            <Button
              size="sm" variant="outline"
              onClick={addCustomText}
              className="w-full gap-1 text-xs justify-start"
            >
              <Plus className="w-3 h-3" /> Adicionar Texto
            </Button>
            <Button
              size="sm" variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={bgLoading}
              className="w-full gap-1 text-xs justify-start"
            >
              <Upload className="w-3 h-3" />
              {bgLoading ? "Carregando..." : "Alterar Foto"}
            </Button>
            {customBgEl && (
              <Button
                size="sm" variant="ghost"
                onClick={clearCustomBg}
                className="w-full gap-1 text-xs text-muted-foreground justify-start"
              >
                <RotateCcw className="w-3 h-3" /> Restaurar Foto
              </Button>
            )}
            <input ref={fileInputRef} type="file" accept={ACCEPTED_IMAGE_ACCEPT_ATTR} className="hidden" onChange={handleBgUpload} />
          </div>
        </div>

        {/* ── Canvas area ── */}
        <div className="flex-1 flex items-center justify-center overflow-auto p-6">
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            style={{ display: "block", borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}
          />
        </div>

        {/* ── Right panel: controls for selected element ── */}
        <div
          className="w-56 shrink-0 overflow-y-auto"
          style={{ borderLeft: "1px solid rgba(255,255,255,0.08)", background: "#0d1420" }}
        >
          {selectedElemMeta && (
            <div className="p-3 space-y-4">
              <p className="text-xs font-semibold text-white">{selectedElemMeta.label}</p>

              {/* Visibility */}
              <label className="flex items-center justify-between text-xs text-muted-foreground cursor-pointer">
                <span>Visível</span>
                <input
                  type="checkbox"
                  checked={isVisible(selectedElemMeta.key)}
                  onChange={e => updateStyle(selectedElemMeta.key, { visible: e.target.checked })}
                  className="accent-cyan-400"
                />
              </label>

              {/* Font size scale */}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground flex justify-between">
                  <span>Tamanho</span>
                  <span style={{ color: "#00b4c8" }}>
                    {(getStyleVal(selectedElemMeta.key, "fontSizeScale", 1.0) as number).toFixed(2)}×
                  </span>
                </label>
                <input
                  type="range" min={0.4} max={2.0} step={0.05}
                  value={getStyleVal(selectedElemMeta.key, "fontSizeScale", 1.0) as number}
                  onChange={e => updateStyle(selectedElemMeta.key, { fontSizeScale: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>

              {/* Color */}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Cor principal</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={(getStyleVal(selectedElemMeta.key, "color", "#00b4c8") as string) || "#00b4c8"}
                    onChange={e => updateStyle(selectedElemMeta.key, { color: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                  />
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => updateStyle(selectedElemMeta.key, { color: undefined })}
                    className="text-xs text-muted-foreground h-6 px-2"
                  >
                    Padrão
                  </Button>
                </div>
              </div>

              {/* Reset position */}
              <Button
                size="sm" variant="outline"
                onClick={() => updateStyle(selectedElemMeta.key, { dx: 0, dy: 0 })}
                className="w-full gap-1 text-xs"
              >
                <RotateCcw className="w-3 h-3" /> Resetar Posição
              </Button>

              {/* ── Text content per element ── */}
              <div className="space-y-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Conteúdo</p>

                {selectedElemMeta.key === "badge" && (
                  <LabeledInput label="Desconto (%)" value={localData.desconto ?? ""} onChange={v => updateData({ desconto: v })} placeholder="5" />
                )}

                {selectedElemMeta.key === "tag" && (<>
                  <LabeledInput label="Tipo de Produto" value={localData.tipoProduto ?? ""} onChange={v => updateData({ tipoProduto: v })} placeholder="Aéreo + Hotel" />
                  <LabeledInput label="Origem do Voo" value={localData.origemVoo ?? ""} onChange={v => updateData({ origemVoo: v || undefined } as Partial<TravelData>)} placeholder="Curitiba (CWB)" />
                </>)}

                {selectedElemMeta.key === "destination" && (<>
                  <LabeledInput label="Destino" value={localData.destino} onChange={v => updateData({ destino: v })} />
                  <LabeledInput label="Hotel" value={localData.hotel} onChange={v => updateData({ hotel: v })} />
                  <LabeledInput label="Duração" value={localData.duracao} onChange={v => updateData({ duracao: v })} placeholder="6 Noites" />
                  <LabeledInput label="Regime" value={localData.regime} onChange={v => updateData({ regime: v })} placeholder="All Inclusive" />
                </>)}

                {selectedElemMeta.key === "inclui" && (
                  <div className="space-y-1">
                    {(localData.inclui ?? []).map((item, i) => (
                      <div key={i} className="flex gap-1">
                        <input
                          type="text"
                          value={item}
                          onChange={e => {
                            const next = [...(localData.inclui ?? [])];
                            next[i] = e.target.value;
                            updateData({ inclui: next });
                          }}
                          className="flex-1 text-xs rounded-lg px-2 py-1.5"
                          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0", outline: "none" }}
                        />
                        <button
                          onClick={() => updateData({ inclui: (localData.inclui ?? []).filter((_, j) => j !== i) })}
                          className="px-1.5 rounded text-red-400 hover:bg-red-500/20 text-xs"
                        >✕</button>
                      </div>
                    ))}
                    <button
                      onClick={() => updateData({ inclui: [...(localData.inclui ?? []), ""] })}
                      className="w-full text-xs py-1 rounded-lg text-cyan-400 hover:bg-white/5"
                      style={{ border: "1px dashed rgba(0,180,200,0.3)" }}
                    >+ Adicionar item</button>
                  </div>
                )}

                {selectedElemMeta.key === "price" && (<>
                  <LabeledInput label="Por pessoa" value={localData.precoPorPessoa} onChange={v => updateData({ precoPorPessoa: v })} placeholder="R$ 9.308,49" />
                  <LabeledInput label="Nº parcelas" value={String(localData.parcelas)} onChange={v => updateData({ parcelas: parseInt(v) || localData.parcelas })} placeholder="10" />
                  <LabeledInput label="Valor parcela" value={localData.precoParcela} onChange={v => updateData({ precoParcela: v })} placeholder="R$ 930,85" />
                  <LabeledInput label="À vista" value={localData.precoAVista} onChange={v => updateData({ precoAVista: v })} placeholder="R$ 8.843,06" />
                </>)}

                {selectedElemMeta.key === "datePill" && (<>
                  <LabeledInput label="Data início" value={localData.dataInicio ?? ""} onChange={v => updateData({ dataInicio: v || undefined } as Partial<TravelData>)} placeholder="01/08/2026" />
                  <LabeledInput label="Data fim" value={localData.dataFim ?? ""} onChange={v => updateData({ dataFim: v || undefined } as Partial<TravelData>)} placeholder="07/08/2026" />
                </>)}

                {selectedElemMeta.key === "airline" && (<>
                  <LabeledInput label="Cia. Aérea" value={localData.companhiaAerea ?? ""} onChange={v => updateData({ companhiaAerea: v || undefined } as Partial<TravelData>)} placeholder="LATAM" />
                  <LabeledInput label="Bagagem" value={localData.bagagem ?? ""} onChange={v => updateData({ bagagem: v || undefined } as Partial<TravelData>)} placeholder="1 mala despachada" />
                </>)}
              </div>
            </div>
          )}

          {selectedCustomText && (
            <div className="p-3 space-y-4">
              <p className="text-xs font-semibold text-white">Texto Livre</p>

              {/* Text content */}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Conteúdo</label>
                <textarea
                  value={selectedCustomText.text}
                  onChange={e => updateCustomText(selectedCustomText.id, { text: e.target.value })}
                  rows={3}
                  className="w-full text-xs rounded-lg p-2 resize-none"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0" }}
                />
              </div>

              {/* Font size */}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground flex justify-between">
                  <span>Tamanho</span>
                  <span style={{ color: "#00b4c8" }}>{Math.round(selectedCustomText.fontSizeH * 100)}%</span>
                </label>
                <input
                  type="range" min={0.02} max={0.15} step={0.005}
                  value={selectedCustomText.fontSizeH}
                  onChange={e => updateCustomText(selectedCustomText.id, { fontSizeH: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>

              {/* Color */}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Cor</label>
                <input
                  type="color"
                  value={selectedCustomText.color}
                  onChange={e => updateCustomText(selectedCustomText.id, { color: e.target.value })}
                  className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                />
              </div>

              {/* Bold */}
              <label className="flex items-center justify-between text-xs text-muted-foreground cursor-pointer">
                <span>Negrito</span>
                <input
                  type="checkbox"
                  checked={selectedCustomText.bold}
                  onChange={e => updateCustomText(selectedCustomText.id, { bold: e.target.checked })}
                  className="accent-cyan-400"
                />
              </label>

              {/* Delete */}
              <Button
                size="sm" variant="ghost"
                onClick={() => deleteCustomText(selectedCustomText.id)}
                className="w-full gap-1 text-xs text-red-400 hover:text-red-300"
              >
                <Trash2 className="w-3 h-3" /> Excluir
              </Button>
            </div>
          )}

          {!selectedKey && (
            <div className="p-3 text-xs text-muted-foreground">
              Clique em um elemento na lâmina ou na lista para editar.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
