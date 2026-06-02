import { Upload, Sparkles, AlertCircle, ImageIcon, Film, MessageSquare } from "lucide-react";
import { useState, useCallback, useRef, useEffect } from "react";
import { TravelData, SAMPLE_DATA } from "@/types/travel";
import { extractTextFromPdf, parseTravelData } from "@/lib/pdfParser";

interface PdfUploadProps {
  onDataExtracted: (data: TravelData) => void;
}

const FEATURES = [
  { icon: ImageIcon,     label: "Lâmina",  sub: "Feed + Story PNG" },
  { icon: Film,          label: "Reels",   sub: "Script + roteiro" },
  { icon: MessageSquare, label: "Copy",    sub: "WhatsApp + e-mail" },
];

/* Brand colours */
const P = "#9333EA";          // vivid purple — CTAs, icons
const PL = "#C084FC";         // light purple — text on dark bg
const PM = "rgba(147,51,234,"; // prefix for rgba variants

const PdfUpload = ({ onDataExtracted }: PdfUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("bwt-session");
      if (saved) {
        const data = JSON.parse(saved) as TravelData;
        if (data.destino && data.destino !== "Destino" && data.hotel && data.hotel !== "Hotel") {
          onDataExtracted(data);
        } else {
          localStorage.removeItem("bwt-session");
        }
      }
    } catch {
      localStorage.removeItem("bwt-session");
    }
  }, []);

  const processFile = async (file: File) => {
    if (file.type !== "application/pdf") { setError("Por favor, selecione um arquivo PDF."); return; }
    setIsProcessing(true); setError(null); setFileName(file.name);
    try {
      const text = await extractTextFromPdf(file);
      if (!text || text.trim().length < 20) {
        setError("Não foi possível extrair texto do PDF. O arquivo pode ser uma imagem escaneada.");
        setIsProcessing(false); return;
      }
      const data = parseTravelData(text);
      localStorage.setItem("bwt-session", JSON.stringify(data));
      onDataExtracted(data);
    } catch (err) {
      console.error("PDF processing error:", err);
      const msg = err instanceof Error ? err.message : null;
      setError(msg ?? "Erro ao processar o PDF. Tente novamente ou use os dados de exemplo.");
    } finally { setIsProcessing(false); }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center px-6 overflow-y-auto"
      style={{ background: "linear-gradient(150deg, #0C0812 0%, #130A20 55%, #0C0812 100%)" }}
    >
      {/* Radial glow */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: `radial-gradient(ellipse 55% 35% at 50% 42%, ${PM}0.13) 0%, transparent 70%)`,
      }} />

      <div className="relative w-full max-w-md flex flex-col items-center gap-10">

        {/* ── Brand icon + wordmark ── */}
        <div className="flex flex-col items-center gap-5">
          <div className="flex items-center gap-4">
            {/* BWT icon — matches social media avatar style */}
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center font-display font-black text-2xl shadow-2xl select-none"
              style={{
                background: "linear-gradient(135deg, #7C3AED 0%, #6B21A8 100%)",
                color: "#fff",
                letterSpacing: "-0.02em",
                boxShadow: `0 8px 32px ${PM}0.45)`,
              }}
            >
              BWT
            </div>
            <div
              className="w-px h-8 rounded-full"
              style={{ background: "rgba(255,255,255,0.1)" }}
            />
            <span
              className="font-display text-2xl font-black uppercase tracking-widest"
              style={{ color: "#fff", letterSpacing: "0.12em" }}
            >
              Studio
            </span>
          </div>

          <div className="text-center space-y-1.5">
            <p className="text-base font-semibold leading-snug" style={{ color: "rgba(230,215,255,0.9)" }}>
              Transforme orçamentos Infotera em<br />materiais de marketing prontos
            </p>
            <p className="text-xs" style={{ color: "rgba(180,150,220,0.5)" }}>
              Lâminas · Reels · Copy — prontos em segundos
            </p>
          </div>
        </div>

        {/* ── Feature pills ── */}
        <div className="flex items-center gap-4">
          {FEATURES.map(({ icon: Icon, label, sub }, i) => (
            <div key={label} className="flex items-center gap-4">
              <div className="flex flex-col items-center gap-1.5 text-center">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${PM}0.12)`, border: `1px solid ${PM}0.22)` }}
                >
                  <Icon size={17} style={{ color: PL }} />
                </div>
                <p className="text-xs font-semibold" style={{ color: "rgba(220,200,255,0.85)" }}>{label}</p>
                <p style={{ fontSize: 10, color: "rgba(170,140,210,0.45)" }}>{sub}</p>
              </div>
              {i < FEATURES.length - 1 && (
                <div className="w-5 h-px shrink-0" style={{ background: `${PM}0.18)` }} />
              )}
            </div>
          ))}
        </div>

        {/* ── Upload zone ── */}
        <div className="w-full space-y-3">
          <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileSelect} />

          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            className="w-full rounded-2xl text-center transition-all duration-200"
            style={{
              padding: "36px 32px",
              border: isDragging ? `1.5px solid ${P}` : `1.5px dashed ${PM}0.35)`,
              background: isDragging ? `${PM}0.08)` : "rgba(255,255,255,0.025)",
              transform: isDragging ? "scale(1.015)" : "scale(1)",
              cursor: isProcessing ? "default" : "pointer",
              boxShadow: isDragging ? `0 0 0 4px ${PM}0.1)` : "none",
            }}
          >
            {isProcessing ? (
              <div className="flex flex-col items-center gap-4">
                <div
                  className="w-11 h-11 rounded-full border-[3px] animate-spin"
                  style={{ borderColor: `${PM}0.2)`, borderTopColor: P }}
                />
                <div>
                  <p className="font-semibold text-sm" style={{ color: "#fff" }}>
                    {fileName ? `Analisando ${fileName}…` : "Analisando orçamento…"}
                  </p>
                  <p className="text-xs mt-1" style={{ color: "rgba(180,150,220,0.55)" }}>
                    Extraindo os dados do orçamento Infotera
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: `${PM}0.1)`, border: `1px solid ${PM}0.2)` }}
                >
                  <Upload className="w-7 h-7" style={{ color: PL }} />
                </div>
                <div>
                  <p className="font-semibold text-sm" style={{ color: "rgba(230,215,255,0.95)" }}>
                    Arraste o PDF do orçamento
                  </p>
                  <p className="text-xs mt-1" style={{ color: "rgba(180,150,220,0.5)" }}>
                    ou clique para selecionar · PDF gerado pelo Infotera
                  </p>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div
              className="flex items-center gap-2 text-xs px-4 py-3 rounded-xl w-full"
              style={{ background: "rgba(220,53,69,0.1)", border: "1px solid rgba(220,53,69,0.22)", color: "#ff8090" }}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}
        </div>

        {/* ── Sample data ── */}
        <button
          onClick={() => {
            localStorage.setItem("bwt-session", JSON.stringify(SAMPLE_DATA));
            onDataExtracted(SAMPLE_DATA);
          }}
          className="flex items-center gap-1.5 text-xs transition-all"
          style={{ color: `${PM}0.45)` }}
          onMouseEnter={(e) => (e.currentTarget.style.color = `${PM}0.8)`)}
          onMouseLeave={(e) => (e.currentTarget.style.color = `${PM}0.45)`)}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Usar dados de exemplo (Punta Cana)
        </button>
      </div>

      <p className="absolute bottom-6 text-xs" style={{ color: "rgba(160,130,200,0.2)" }}>
        BWT Operadora · Curitiba/PR · bwtoperadora.com.br
      </p>
    </div>
  );
};

export default PdfUpload;
