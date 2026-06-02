import { FileText, Copy, Check, MessageCircle, Instagram, Mail, Eye, EyeOff } from "lucide-react";
import { useState, useMemo } from "react";
import { TravelData } from "@/types/travel";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { saveArchiveEntry } from "@/lib/archive";

interface ScriptGeneratorProps {
  data: TravelData;
}

const ScriptGenerator = ({ data }: ScriptGeneratorProps) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [whatsappPreview, setWhatsappPreview] = useState(false);
  const { toast } = useToast();

  const SCRIPT_OUTPUT_LABELS: Record<string, string> = {
    instagram: "Caption Instagram",
    whatsapp: "Mensagem WhatsApp",
    email: "E-mail de Vendas",
  };

  const copyText = (text: string, id: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    const outputLabel = SCRIPT_OUTPUT_LABELS[id] ?? label;
    saveArchiveEntry(data, outputLabel);
    toast({ description: `${label} copiado!`, duration: 1800 });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const scenes = useMemo(() => {
    if (data.marketing?.reelsScript?.length) return data.marketing.reelsScript;
    return [
      { cena: 1, duracao: "0–3s",   tipo: "Hook",    texto: `Você já imaginou acordar com essa vista em ${data.destino}? 🌊☀️` },
      { cena: 2, duracao: "3–7s",   tipo: "Produto", texto: `${data.hotel} — ${data.duracao} de puro luxo com ${data.regime}` },
      { cena: 3, duracao: "7–11s",  tipo: "Oferta",  texto: `A partir de ${data.parcelas}x R$ ${data.precoParcela?.replace("R$ ", "")} por pessoa${data.desconto ? ` · ${data.desconto}% OFF` : ""}` },
      { cena: 4, duracao: "11–14s", tipo: "Inclui",  texto: (data.inclui ?? []).slice(0, 3).join(" · ") || "Aéreo + Hotel + Transfer — tudo incluso ✅" },
      { cena: 5, duracao: "14–15s", tipo: "CTA",     texto: `Chama a ${data.agencia || "agência"} agora e garante sua vaga! 👇` },
    ];
  }, [data]);

  const captionInstagram = useMemo(() => {
    if (data.marketing?.captionInstagram) return data.marketing.captionInstagram;
    return `✈️ ${data.destino} te espera! 🌴

🏨 ${data.hotel}
🌙 ${data.duracao} | ${data.regime}
${data.desconto ? `🔥 Até ${data.desconto}% OFF\n` : ""}💰 A partir de ${data.parcelas}x R$ ${data.precoParcela?.replace("R$ ", "")}
${data.precoAVista ? `💳 Ou ${data.precoAVista} à vista` : ""}
${data.dataInicio && data.dataFim ? `📅 ${data.dataInicio} a ${data.dataFim}` : ""}
${data.companhiaAerea ? `✈️ ${data.companhiaAerea}${data.origemVoo ? ` · saída de ${data.origemVoo}` : ""}` : ""}

✅ O que inclui:
${(data.inclui || []).map((i) => `  • ${i}`).join("\n")}

👉 Entre em contato com a ${data.agencia || "sua agência"} para solicitar seu orçamento!

#BWT #BWTOperadora #${data.destino.replace(/\s/g, "")} #Viagem #Turismo #ViagemDeSonho #PacoteDeTurismo #Promocao`;
  }, [data]);

  const captionWhatsApp = useMemo(() => {
    if (data.marketing?.captionWhatsApp) return data.marketing.captionWhatsApp;
    return `🌴 *${data.destino} — Oferta Especial*

🏨 *Hotel:* ${data.hotel}
🌙 *Duração:* ${data.duracao}
🍽️ *Regime:* ${data.regime}
${data.bagagem ? `🧳 *Bagagem:* ${data.bagagem}\n` : ""}${data.desconto ? `🔥 *Desconto:* Até ${data.desconto}% OFF\n` : ""}
💰 *A partir de:* ${data.parcelas}x R$ ${data.precoParcela?.replace("R$ ", "")} /pessoa
${data.precoAVista ? `💳 *À vista:* ${data.precoAVista} /pessoa` : ""}
${data.dataInicio && data.dataFim ? `📅 *Datas:* ${data.dataInicio} a ${data.dataFim}` : ""}
${data.companhiaAerea ? `✈️ *Cia. Aérea:* ${data.companhiaAerea}${data.origemVoo ? ` · saída de ${data.origemVoo}` : ""}` : ""}

✅ *Inclui:*
${(data.inclui || []).map((i) => `  • ${i}`).join("\n")}

_Valores por pessoa em apto duplo. Sujeito a disponibilidade._`;
  }, [data]);

  const emailScript = useMemo(() => {
    if (data.marketing?.emailScript) return data.marketing.emailScript;
    const agencia = data.agencia || "BWT Operadora";
    return `Assunto: ${data.destino} | ${data.duracao} a partir de ${data.parcelas}x R$ ${data.precoParcela?.replace("R$ ", "")} por pessoa

Olá!

Temos uma oferta especial para ${data.destino} que você não pode perder.

📍 DESTINO: ${data.destino}
🏨 HOTEL: ${data.hotel}
${data.quartoTipo ? `🛏️ QUARTO: ${data.quartoTipo}\n` : ""}🍽️ REGIME: ${data.regime}
🌙 DURAÇÃO: ${data.duracao}
${data.dataInicio && data.dataFim ? `📅 PERÍODO: ${data.dataInicio} a ${data.dataFim}\n` : ""}${data.companhiaAerea ? `✈️ VOO: ${data.companhiaAerea}${data.origemVoo ? ` · saída de ${data.origemVoo}` : ""}\n` : ""}${data.bagagem ? `🧳 BAGAGEM: ${data.bagagem}\n` : ""}
O QUE ESTÁ INCLUSO:
${(data.inclui || []).map((i) => `• ${i}`).join("\n")}

💰 INVESTIMENTO:
• ${data.parcelas}x R$ ${data.precoParcela?.replace("R$ ", "")} por pessoa (cartão)
${data.precoAVista ? `• R$ ${data.precoAVista?.replace("R$ ", "")} por pessoa à vista (${data.desconto || 5}% OFF no PIX)\n` : ""}
Entre em contato para garantir sua vaga!

Atenciosamente,
${agencia}`;
  }, [data]);

  const CopyButton = ({ text, id, label }: { text: string; id: string; label: string }) => (
    <Button onClick={() => copyText(text, id, label)} size="sm" variant="outline" className="gap-2 text-xs shrink-0">
      {copiedId === id
        ? <Check className="w-3 h-3" style={{ color: "#9333EA" }} />
        : <Copy className="w-3 h-3" />}
      {copiedId === id ? "Copiado!" : "Copiar"}
    </Button>
  );

  // Render WhatsApp *bold* markdown visually
  const renderWhatsApp = (text: string) => {
    return text.split(/(\*[^*]+\*)/g).map((part, i) => {
      if (part.startsWith("*") && part.endsWith("*")) {
        return <strong key={i}>{part.slice(1, -1)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  const TIPO_COLORS: Record<string, string> = {
    Hook: "#f59e0b",
    Produto: "#9333EA",
    Oferta: "#10b981",
    Inclui: "#8b5cf6",
    CTA: "#ef4444",
  };

  return (
    <div className="space-y-8">
      {/* ── Script Reels ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5" style={{ color: "#9333EA" }} />
          <h2 className="text-2xl font-display font-semibold">Script para Reels / TikTok</h2>
        </div>
        <div className="grid gap-2">
          {scenes.map((scene) => {
            const typeColor = TIPO_COLORS[scene.tipo] ?? "#9333EA";
            return (
              <div key={scene.cena} className="rounded-xl p-4 flex items-start gap-4 glass-card">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0"
                  style={{ background: "#0d1b2a", color: typeColor, border: `1px solid ${typeColor}40` }}
                >
                  {scene.cena}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: `${typeColor}18`, color: typeColor }}
                    >
                      {scene.tipo}
                    </span>
                    <span className="text-xs text-muted-foreground">{scene.duracao}</span>
                  </div>
                  <p className="text-sm text-foreground font-medium leading-snug">{scene.texto}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Caption Instagram ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Instagram className="w-5 h-5" style={{ color: "#9333EA" }} />
            <h3 className="text-lg font-display font-semibold">Legenda Instagram</h3>
            <span className="label-caps" style={{ color: "hsl(var(--muted-foreground))" }}>
              {captionInstagram.length} chars
            </span>
          </div>
          <CopyButton text={captionInstagram} id="instagram" label="Legenda Instagram" />
        </div>
        <div className="glass-card rounded-xl p-4">
          <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{captionInstagram}</p>
        </div>
      </div>

      {/* ── Mensagem WhatsApp ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5" style={{ color: "#9333EA" }} />
            <h3 className="text-lg font-display font-semibold">Mensagem WhatsApp</h3>
            <span className="label-caps">{captionWhatsApp.length} chars</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setWhatsappPreview((v) => !v)}
              style={{ color: "#9333EA" }}
            >
              {whatsappPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {whatsappPreview ? "Raw" : "Preview"}
            </Button>
            <CopyButton text={captionWhatsApp} id="whatsapp" label="Mensagem WhatsApp" />
          </div>
        </div>
        <div className="glass-card rounded-xl p-4">
          {whatsappPreview ? (
            <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">
              {captionWhatsApp.split("\n").map((line, i) => (
                <span key={i}>
                  {renderWhatsApp(line)}
                  {"\n"}
                </span>
              ))}
            </p>
          ) : (
            <p className="text-sm text-foreground whitespace-pre-line leading-relaxed font-mono">{captionWhatsApp}</p>
          )}
        </div>
      </div>

      {/* ── Script de Email ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5" style={{ color: "#9333EA" }} />
            <h3 className="text-lg font-display font-semibold">E-mail de Vendas</h3>
            <span className="label-caps">{emailScript.length} chars</span>
          </div>
          <CopyButton text={emailScript} id="email" label="E-mail de vendas" />
        </div>
        <div className="glass-card rounded-xl p-4">
          <p className="text-sm text-foreground whitespace-pre-line leading-relaxed font-mono">{emailScript}</p>
        </div>
      </div>
    </div>
  );
};

export default ScriptGenerator;
