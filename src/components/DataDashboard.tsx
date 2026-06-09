import {
  MapPin,
  Hotel,
  DollarSign,
  Moon,
  UtensilsCrossed,
  Pencil,
  Percent,
  Calendar,
  Plane,
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
} from "lucide-react";
import { TravelData } from "@/types/travel";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { COND_PADRAO } from "@/lib/laminaRenderer";
import { useState } from "react";

interface DataDashboardProps {
  data: TravelData;
  onChange: (data: TravelData) => void;
}

// Collapsible section component
const Section = ({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/20 transition-colors"
      >
        <span className="label-caps">{title}</span>
        <ChevronDown
          className="w-3.5 h-3.5 text-muted-foreground transition-transform duration-200"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
        />
      </button>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  );
};

// Single field row
const FieldRow = ({
  icon: Icon,
  label,
  value,
  onChange,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) => (
  <div className="flex items-center gap-2.5 pt-2">
    <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
    <div className="flex-1 min-w-0">
      <label className="label-caps block mb-0.5">{label}</label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-0 bg-transparent p-0 h-7 font-semibold text-sm text-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
      />
    </div>
  </div>
);

const DataDashboard = ({ data, onChange }: DataDashboardProps) => {
  const updateField = (key: keyof TravelData, value: string) => {
    const updated = { ...data, [key]: value };

    if (key === "precoTotal" || key === "parcelas" || key === "numAdultos") {
      const total = parseFloat(
        (key === "precoTotal" ? value : data.precoTotal).replace(/[^\d,]/g, "").replace(",", "."),
      );
      const nParcelas = parseInt(String(key === "parcelas" ? value : data.parcelas));
      const nAdultos = parseInt(String(key === "numAdultos" ? value : data.numAdultos)) || 2;
      if (!isNaN(total) && !isNaN(nParcelas) && nParcelas > 0 && nAdultos > 0) {
        const pp = total / nAdultos;
        const parcela = pp / nParcelas;
        const descPct = parseInt(data.desconto || "5") / 100;
        updated.precoPorPessoa = `R$ ${pp.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
        updated.precoAVista = `R$ ${(pp * (1 - descPct)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
        updated.precoParcela = `R$ ${parcela.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
        updated.numAdultos = nAdultos;
        if (key !== "parcelas") updated.parcelas = nParcelas;
      }
    }

    onChange(updated);
  };

  const updateInclui = (i: number, value: string) => {
    const newInclui = [...(data.inclui || [])];
    newInclui[i] = value;
    onChange({ ...data, inclui: newInclui });
  };

  const addInclui = () => onChange({ ...data, inclui: [...(data.inclui || []), ""] });

  const removeInclui = (i: number) => {
    const newInclui = [...(data.inclui || [])];
    newInclui.splice(i, 1);
    onChange({ ...data, inclui: newInclui });
  };

  // Campaigns — support multiple. `campanha` is kept in sync with the first
  // entry so anything still reading the legacy single field keeps working.
  const campaigns = data.campanhas ?? (data.campanha ? [data.campanha] : []);
  const setCampaigns = (next: string[]) =>
    onChange({ ...data, campanhas: next, campanha: next[0] ?? "" });
  const updateCampaign = (i: number, value: string) => {
    const next = [...campaigns];
    next[i] = value;
    setCampaigns(next);
  };
  const addCampaign = () => setCampaigns([...campaigns, ""]);
  const removeCampaign = (i: number) => {
    const next = [...campaigns];
    next.splice(i, 1);
    setCampaigns(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Pencil className="w-4 h-4" style={{ color: "#9333EA" }} />
        <h2 className="text-base font-display font-bold uppercase tracking-wide">Dados do Orçamento</h2>
      </div>

      {/* ── Destino & Hotel ── */}
      <Section title="Destino & Hotel">
        <FieldRow icon={MapPin} label="Destino" value={(data.destino as string) || ""} onChange={(v) => updateField("destino", v)} />
        <FieldRow icon={Hotel} label="Hotel" value={(data.hotel as string) || ""} onChange={(v) => updateField("hotel", v)} />
        <FieldRow icon={Hotel} label="Tipo de Quarto" value={(data.quartoTipo as string) || ""} onChange={(v) => updateField("quartoTipo", v)} />
      </Section>

      {/* ── Pacote ── */}
      <Section title="Pacote">
        <FieldRow icon={Moon} label="Duração" value={(data.duracao as string) || ""} onChange={(v) => updateField("duracao", v)} />
        <FieldRow icon={UtensilsCrossed} label="Regime" value={(data.regime as string) || ""} onChange={(v) => updateField("regime", v)} />
        <FieldRow icon={Plane} label="Tipo" value={(data.tipoProduto as string) || ""} onChange={(v) => updateField("tipoProduto", v)} />

        {/* Campanhas — múltiplas; nomes longos quebram em duas linhas na lâmina */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-1">
            <label className="label-caps flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
              {campaigns.length > 1 ? "Campanhas" : "Campanha"}
            </label>
            <Button
              onClick={addCampaign}
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs gap-1"
              style={{ color: "#9333EA" }}
            >
              <Plus className="w-3 h-3" /> Adicionar
            </Button>
          </div>
          {campaigns.length === 0 ? (
            <Input
              value=""
              placeholder="Nome da campanha..."
              onChange={(e) => setCampaigns([e.target.value])}
              className="h-7 text-sm bg-muted/50"
            />
          ) : (
            campaigns.map((c, i) => (
              <div key={i} className="flex items-center gap-2 group mb-1">
                <Input
                  value={c}
                  onChange={(e) => updateCampaign(i, e.target.value)}
                  className="h-7 text-sm flex-1 bg-muted/50"
                  placeholder="Nome da campanha..."
                />
                <Button
                  onClick={() => removeCampaign(i)}
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0 transition-opacity"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))
          )}
        </div>

        <FieldRow icon={Percent} label="Desconto %" value={(data.desconto as string) || ""} onChange={(v) => updateField("desconto", v)} />
      </Section>

      {/* ── Voo ── */}
      <Section title="Voo" defaultOpen={false}>
        <FieldRow icon={Plane} label="Cia. Aérea" value={(data.companhiaAerea as string) || ""} onChange={(v) => updateField("companhiaAerea", v)} />
        <FieldRow icon={Plane} label="Saída de" value={(data.origemVoo as string) || ""} onChange={(v) => updateField("origemVoo", v)} />
        <div className="flex items-center gap-2.5 pt-2">
          <Checkbox
            id="bloqueioAereo"
            checked={!!data.bloqueioAereo}
            onCheckedChange={(checked) => onChange({ ...data, bloqueioAereo: !!checked })}
          />
          <label htmlFor="bloqueioAereo" className="text-sm font-semibold cursor-pointer select-none">
            Bloqueio Aéreo
          </label>
        </div>
      </Section>

      {/* ── Precificação ── */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          border: "1px solid hsl(var(--border)/0.5)",
          borderLeft: "3px solid hsl(var(--bwt-gold))",
          background: "hsl(var(--card)/0.9)",
        }}
      >
        <div className="px-3 py-2.5">
          <span className="label-caps flex items-center gap-1.5">
            <DollarSign className="w-3 h-3" /> Precificação
          </span>
        </div>
        <div className="px-3 pb-3 space-y-3">

          {/* Inputs: total ocupa linha inteira, parcelas + pax lado a lado abaixo */}
          <div className="space-y-2">
            <div>
              <label className="label-caps block mb-1">Total ({data.numAdultos || 2} pax)</label>
              <Input
                value={String(data.precoTotal || "")}
                onChange={(e) => updateField("precoTotal", e.target.value)}
                className="h-9 text-sm font-bold"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label-caps block mb-1">Parcelas</label>
                <Input
                  value={String(data.parcelas || "")}
                  onChange={(e) => updateField("parcelas", e.target.value)}
                  className="h-8 text-sm font-semibold text-center"
                />
              </div>
              <div>
                <label className="label-caps block mb-1">Adultos</label>
                <Input
                  value={String(data.numAdultos || "")}
                  onChange={(e) => updateField("numAdultos", e.target.value)}
                  className="h-8 text-sm font-semibold text-center"
                />
              </div>
            </div>
          </div>

          {/* Calculated stats — lista vertical, sem quebra de texto */}
          <div
            className="rounded-lg divide-y [&>*+*]:border-t"
            style={{
              background: "rgba(147,51,234,0.05)",
              border: "0.5px solid rgba(147,51,234,0.12)",
            }}
          >
            {[
              { label: "Por pessoa", value: data.precoPorPessoa, highlight: true },
              { label: `Parcela (${data.parcelas}x)`, value: data.precoParcela, highlight: false },
              { label: `À vista (${data.desconto || 5}% off)`, value: data.precoAVista, highlight: false },
            ].map(({ label, value, highlight }) => (
              <div key={label} className="flex items-center justify-between px-3 py-2">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span
                  className="text-sm font-bold tabular-nums"
                  style={{ color: highlight ? "#9333EA" : "hsl(var(--foreground))" }}
                >
                  {value || "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Período ── */}
      <Section title="Período" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2 pt-1">
          {[
            { key: "dataInicio" as const, label: "Início" },
            { key: "dataFim" as const, label: "Fim" },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="label-caps block mb-1">{label}</label>
              <Input
                value={(data[key] as string) || ""}
                onChange={(e) => updateField(key, e.target.value)}
                className="h-8 text-sm font-semibold"
              />
            </div>
          ))}
        </div>
      </Section>

      {/* ── O que Inclui ── */}
      <Section title="O que inclui">
        <div className="flex justify-end">
          <Button
            onClick={addInclui}
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs gap-1 -mt-1"
            style={{ color: "#9333EA" }}
          >
            <Plus className="w-3 h-3" /> Adicionar
          </Button>
        </div>
        {(data.inclui || []).map((item, i) => (
          <div key={i} className="flex items-center gap-2 group">
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
            <span className="text-xs shrink-0" style={{ color: "#9333EA" }}>•</span>
            <Input
              value={item}
              onChange={(e) => updateInclui(i, e.target.value)}
              className="h-7 text-xs flex-1 bg-muted/50"
              placeholder="Item incluído..."
            />
            <Button
              onClick={() => removeInclui(i)}
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0 transition-opacity"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        ))}
      </Section>

      {/* ── Condições ── */}
      <Section title="Condições" defaultOpen={false}>
        <Textarea
          value={data.condicoes ?? COND_PADRAO}
          onChange={(e) => onChange({ ...data, condicoes: e.target.value })}
          className="min-h-[160px] text-xs leading-relaxed bg-muted/50"
        />
        <p className="text-[10px] text-muted-foreground">
          Esse texto aparece no rodapé da lâmina, junto ao aviso de imagens ilustrativas.
        </p>
      </Section>
    </div>
  );
};

export default DataDashboard;
