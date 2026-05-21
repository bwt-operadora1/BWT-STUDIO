/**
 * laminaRenderer.ts
 * All canvas drawing logic for Feed (1080×1080) and Story (1080×1920) lâminas.
 * Consumed by both CanvasPreview (thumbnails) and LaminaEditor (full editor).
 */

import type { TravelData } from "@/types/travel";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ElemKey =
  | "badge"
  | "tag"
  | "destination"
  | "inclui"
  | "price"
  | "datePill"
  | "airline";

export interface ElemStyle {
  visible?: boolean;        // default true
  dx?: number;              // horizontal offset in canvas pixels
  dy?: number;              // vertical offset in canvas pixels
  fontSizeScale?: number;   // multiplier on base font sizes, default 1.0
  color?: string;           // main accent / text colour override
}

export type LaminaStyles = Partial<Record<ElemKey, ElemStyle>>;

export interface CustomText {
  id: string;
  xFrac: number;    // 0‒1 fraction of canvas W
  yFrac: number;    // 0‒1 fraction of canvas H
  text: string;
  fontSizeH: number;  // fraction of canvas H, e.g. 0.04
  color: string;
  bold: boolean;
}

export interface LaminaState {
  styles: LaminaStyles;
  customTexts: CustomText[];
  bgImageUrl?: string;  // data URL or remote URL for custom background
}

export const DEFAULT_LAMINA_STATE: LaminaState = { styles: {}, customTexts: [] };

export interface HitRegion {
  key: string;    // ElemKey or CustomText id
  label: string;
  x: number; y: number; w: number; h: number;
}

export interface DrawOpts {
  laminaState?: LaminaState;
  hoveredKey?: string | null;
  selectedKey?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const COND_PADRAO =
  "Valores por pessoa em Reais. Sujeito a disponibilidade e alterações sem prévio aviso. Parcelamento em até 10x, respeitando parcela mínima de R$ 150,00. Nos reservamos o direito a correções de possíveis erros de digitação. Consulte regras gerais em www.bwtoperadora.com.br";

export const IMAGE_DISCLAIMER =
  "Imagens meramente ilustrativas e podem não representar o produto ou destino vendido.";

const PALETTES: Record<string, [string, string, string, string]> = {
  cancun:              ["#87ceeb", "#00bcd4", "#f4d03f", "#1a6e30"],
  "cancún":            ["#87ceeb", "#00bcd4", "#f4d03f", "#1a6e30"],
  "punta cana":        ["#87d3eb", "#20b2aa", "#f5deb3", "#1a7a40"],
  aruba:               ["#a8d8ea", "#00ced1", "#deb887", "#8b6914"],
  jamaica:             ["#7ec8e3", "#008080", "#f0e68c", "#1a6e20"],
  bahamas:             ["#b0e0e6", "#40e0d0", "#ffe4b5", "#2a8a50"],
  cuba:                ["#87ceeb", "#008b8b", "#d2b48c", "#8b6914"],
  paris:               ["#b0c4de", "#4169e1", "#e8e8e8", "#2a3a6e"],
  europa:              ["#b0c4de", "#4169e1", "#e8e8e8", "#2a3a6e"],
  miami:               ["#87ceeb", "#00ced1", "#fffacd", "#20a050"],
  orlando:             ["#87ceeb", "#1e90ff", "#ffd700", "#1a6e30"],
  dubai:               ["#d4c5a0", "#4682b4", "#deb887", "#8b7914"],
  maldivas:            ["#a8d8ea", "#00d4aa", "#f0e8d8", "#0a8a6a"],
  fortaleza:           ["#7ec9e8", "#1a9ab0", "#f5e6b0", "#1a7a40"],
  jericoacoara:        ["#7ec9e8", "#1a9ab0", "#e8d898", "#2a7a30"],
  natal:               ["#87d4ec", "#1a9ab0", "#f5e0a0", "#1a7a40"],
  "porto seguro":      ["#87d4ec", "#1a9ab0", "#f5e0a0", "#1a7a40"],
  salvador:            ["#87ceeb", "#1a6e8a", "#d4a870", "#1a6e30"],
  recife:              ["#87ceeb", "#1a8a9a", "#d4b890", "#1a6e30"],
  "maceió":            ["#87d4ea", "#20a0b8", "#f0e4b0", "#1a7a30"],
  "porto de galinhas": ["#87d4ea", "#20a0b8", "#f0e4b0", "#1a7a30"],
  "foz do iguaçu":     ["#87a8b0", "#2a7a4a", "#c8d8a0", "#1a6a30"],
  "foz do iguacu":     ["#87a8b0", "#2a7a4a", "#c8d8a0", "#1a6a30"],
  "florianópolis":     ["#87ceeb", "#2080b0", "#f0e8d0", "#1a7a40"],
  florianopolis:       ["#87ceeb", "#2080b0", "#f0e8d0", "#1a7a40"],
  "rio de janeiro":    ["#87ceeb", "#1a7ab0", "#d4c890", "#1a7a30"],
  rio:                 ["#87ceeb", "#1a7ab0", "#d4c890", "#1a7a30"],
  gramado:             ["#a0b4c0", "#3a6a8a", "#c8d0b0", "#2a6a3a"],
  "fernando de noronha": ["#87d4f0", "#1a9ab0", "#f0e0a0", "#1a7a40"],
  bonito:              ["#87a8c0", "#2a8a6a", "#c8d8b0", "#1a7a30"],
  default:             ["#87ceeb", "#00bcd4", "#f4d03f", "#1a6e30"],
};

export function getPalette(destino: string): [string, string, string, string] {
  const d = destino.toLowerCase();
  for (const [k, v] of Object.entries(PALETTES)) {
    if (d.includes(k)) return v;
  }
  return PALETTES.default;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function sanitize(text: string): string {
  return text
    .replace(/[^\u0000-\u024F\u1E00-\u1EFF\u2018-\u201F\u2026\u00B0\u2022\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawPalm(ctx: CanvasRenderingContext2D, px: number, py: number, size: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.05;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(px, py + size);
  ctx.quadraticCurveTo(px + size * 0.1, py + size * 0.5, px + size * 0.05, py);
  ctx.stroke();
  const fronds = [[-0.5], [0], [0.45]];
  fronds.forEach(([angle]) => {
    ctx.save();
    ctx.translate(px + size * 0.05, py);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.32, size * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  ctx.restore();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number): number {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  for (const w of words) {
    const test = line + (line ? " " : "") + w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, cy);
      cy += lineH;
      line = w;
    } else line = test;
  }
  if (line) { ctx.fillText(line, x, cy); cy += lineH; }
  return cy;
}

export function drawBgImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  if (!img.naturalWidth || !img.naturalHeight) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = img.naturalWidth * scale;
  const sh = img.naturalHeight * scale;
  ctx.drawImage(img, x + (w - sw) / 2, y + (h - sh) / 2, sw, sh);
  ctx.restore();
}

function drawDiscountBadge(
  ctx: CanvasRenderingContext2D,
  W: number, H: number, desconto: string, _accentColor: string,
  dx = 0, dy = 0, scale = 1.0,
): { x: number; y: number; w: number; h: number } {
  const bW = Math.round(W * 0.24 * scale);
  const row1H = Math.round(H * 0.032 * scale);
  const row2H = Math.round(H * 0.072 * scale);
  const totalH = row1H + row2H;
  const bX = W - bW + dx;
  const bY = dy;

  // Single purple gradient block
  const grd = ctx.createLinearGradient(bX, bY, bX, bY + totalH);
  grd.addColorStop(0, "#3b0764");
  grd.addColorStop(1, "#6B21A8");
  ctx.fillStyle = grd;
  ctx.fillRect(bX, bY, bW, totalH);

  // All text white
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = `700 ${Math.round(H * 0.016 * scale)}px sans-serif`;
  ctx.fillText("COM ATÉ", bX + bW / 2, bY + row1H * 0.76);
  ctx.font = `900 ${Math.round(H * 0.048 * scale)}px sans-serif`;
  ctx.fillText(`${desconto}%`, bX + bW / 2, bY + row1H + row2H * 0.58);
  ctx.font = `800 ${Math.round(H * 0.025 * scale)}px sans-serif`;
  ctx.fillText("OFF", bX + bW / 2, bY + row1H + row2H * 0.92);

  return { x: bX, y: bY, w: bW, h: totalH };
}

function drawProductTag(
  ctx: CanvasRenderingContext2D,
  W: number, H: number, imgH: number, tipoProduto: string, accentColor: string,
  dx = 0, dy = 0,
  origemVoo?: string,
  scale = 1.0,
): { x: number; y: number; w: number; h: number } {
  const tagH = Math.round(H * 0.036 * scale);
  const tagY = imgH - tagH - Math.round(H * 0.018) + dy;
  const tagX = Math.round(W * 0.037) + dx;

  // "Saída de [cidade] — Aeroporto" above the tag
  if (origemVoo) {
    const originFs = Math.round(H * 0.016 * scale);
    ctx.font = `600 ${originFs}px sans-serif`;
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.90)";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 6;
    ctx.fillText(`Saída de ${origemVoo}`, tagX, tagY - Math.round(H * 0.012));
    ctx.shadowBlur = 0;
  }

  const tagTxt = tipoProduto
    .replace(/Aéreo|Aereo/gi, "\u2708\uFE0F Aéreo")
    .replace(/Hotel/gi, "\uD83C\uDFE8 Hotel")
    .replace(/Transfer|Traslado/gi, "\uD83D\uDE8C Transfer")
    .replace(/Cruzeiro/gi, "\uD83D\uDEF3 Cruzeiro")
    .replace(/Pacote/gi, "\uD83C\uDF1F Pacote");
  ctx.font = `600 ${Math.round(H * 0.019 * scale)}px sans-serif`;
  const tagW = Math.min(ctx.measureText(tagTxt).width + Math.round(W * 0.04 * scale), W * 0.65);
  ctx.fillStyle = "rgba(10,21,40,0.88)";
  rrect(ctx, tagX, tagY, tagW, tagH, tagH / 2); ctx.fill();
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 1.5;
  rrect(ctx, tagX, tagY, tagW, tagH, tagH / 2); ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.fillText(tagTxt, tagX + Math.round(W * 0.018 * scale), tagY + tagH * 0.68);
  return { x: tagX, y: tagY, w: tagW, h: tagH };
}

function drawHighlight(
  ctx: CanvasRenderingContext2D,
  r: { x: number; y: number; w: number; h: number },
  label: string,
  W: number,
  selected: boolean,
) {
  const pad = 4;
  ctx.save();
  ctx.strokeStyle = selected ? "#ffffff" : "#00d4e8";
  ctx.lineWidth = selected ? 2.5 : 2;
  if (!selected) ctx.setLineDash([6, 4]);
  ctx.strokeRect(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2);
  ctx.setLineDash([]);
  if (selected) {
    // Corner handles
    const hs = 6;
    ctx.fillStyle = "#ffffff";
    [[r.x - pad, r.y - pad], [r.x + r.w + pad - hs, r.y - pad],
     [r.x - pad, r.y + r.h + pad - hs], [r.x + r.w + pad - hs, r.y + r.h + pad - hs]].forEach(([hx, hy]) => {
      ctx.fillRect(hx, hy, hs, hs);
    });
  }
  // Label pill
  const fs = Math.max(9, Math.round(W * 0.024));
  ctx.font = `700 ${fs}px sans-serif`;
  const tw = ctx.measureText(label).width + 10;
  const tx = Math.min(r.x - pad, W - tw - 4);
  ctx.fillStyle = selected ? "#ffffff" : "#00d4e8";
  ctx.fillRect(tx, r.y - pad - fs - 6, tw, fs + 6);
  ctx.fillStyle = selected ? "#0d1b2a" : "#003d45";
  ctx.textAlign = "left";
  ctx.fillText(label, tx + 5, r.y - pad - 2);
  ctx.restore();
}

// ─── Shared drawing helper ────────────────────────────────────────────────────

function getStyle(state: LaminaState | undefined, key: ElemKey): Required<ElemStyle> {
  const s = state?.styles[key];
  return {
    visible: s?.visible ?? true,
    dx: s?.dx ?? 0,
    dy: s?.dy ?? 0,
    fontSizeScale: s?.fontSizeScale ?? 1.0,
    color: s?.color ?? "",
  };
}

function highlightIfNeeded(
  ctx: CanvasRenderingContext2D,
  r: { x: number; y: number; w: number; h: number },
  key: string,
  label: string,
  W: number,
  opts: DrawOpts,
) {
  if (opts.selectedKey === key) {
    drawHighlight(ctx, r, label, W, true);
  } else if (opts.hoveredKey === key) {
    drawHighlight(ctx, r, label, W, false);
  }
}

// ─── drawStory (1080 × 1920) ──────────────────────────────────────────────────

export function drawStory(
  canvas: HTMLCanvasElement,
  data: TravelData,
  W: number,
  H: number,
  bgImage: HTMLImageElement | null,
  opts: DrawOpts = {},
): HitRegion[] {
  const ctx = canvas.getContext("2d")!;
  canvas.width = W;
  canvas.height = H;

  const hits: HitRegion[] = [];
  const st = opts.laminaState;

  const [sky, water, sand, palm] = getPalette(data.destino);
  const imgH = Math.round(H * 0.50);

  ctx.fillStyle = "#0a1528";
  ctx.fillRect(0, 0, W, H);

  if (bgImage) {
    drawBgImage(ctx, bgImage, 0, 0, W, imgH);
  } else {
    const skyGrd = ctx.createLinearGradient(0, 0, 0, imgH * 0.58);
    skyGrd.addColorStop(0, sky); skyGrd.addColorStop(1, "#d4f1f9");
    ctx.fillStyle = skyGrd; ctx.fillRect(0, 0, W, imgH * 0.58);
    ctx.fillStyle = "rgba(255,253,200,0.92)";
    ctx.beginPath(); ctx.arc(W * 0.73, imgH * 0.16, W * 0.057, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    [[0.08, 0.2, 68, 26], [0.26, 0.13, 90, 32], [0.47, 0.18, 72, 26]].forEach(([x, y, rx, ry]) => {
      ctx.beginPath();
      ctx.ellipse(W * x, imgH * y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    const waterY = imgH * 0.58, waterH = imgH * 0.24;
    const wGrd = ctx.createLinearGradient(0, waterY, 0, waterY + waterH);
    wGrd.addColorStop(0, water); wGrd.addColorStop(1, "#0a5a6e");
    ctx.fillStyle = wGrd; ctx.fillRect(0, waterY, W, waterH);
    ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0, waterY);
    for (let x = 0; x <= W; x += 8) ctx.lineTo(x, waterY + 5 * Math.sin((x / 70) * Math.PI));
    ctx.stroke();
    ctx.fillStyle = sand; ctx.fillRect(0, waterY + waterH, W, imgH - (waterY + waterH));
    drawPalm(ctx, W * 0.13, imgH * 0.19, imgH * 0.33, palm);
    drawPalm(ctx, W * 0.71, imgH * 0.2, imgH * 0.24, palm);
  }

  const ovGrd = ctx.createLinearGradient(0, imgH * 0.5, 0, imgH);
  ovGrd.addColorStop(0, "rgba(10,21,40,0)"); ovGrd.addColorStop(1, "rgba(10,21,40,0.78)");
  ctx.fillStyle = ovGrd; ctx.fillRect(0, 0, W, imgH);

  // Bloqueio Aéreo badge — top-left
  if (data.bloqueioAereo) {
    const baTxt = `BLOQUEIO AÉREO — ${data.destino.toUpperCase()}`;
    const baFs = Math.round(H * 0.018);
    ctx.font = `800 ${baFs}px sans-serif`;
    const baTxtW = ctx.measureText(baTxt).width;
    const baPad = Math.round(W * 0.02);
    const baH = Math.round(H * 0.038);
    const baW = baTxtW + baPad * 2;
    const baX = Math.round(W * 0.037);
    const baY = Math.round(H * 0.018);
    ctx.fillStyle = "#6B21A8";
    rrect(ctx, baX, baY, baW, baH, 4); ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.fillText(baTxt, baX + baPad, baY + baH * 0.68);
  }

  // Badge
  { const es = getStyle(st, "badge");
    if (es.visible && data.desconto) {
      const color = es.color || "#a78bfa";
      const b = drawDiscountBadge(ctx, W, H, data.desconto, color, es.dx, es.dy, es.fontSizeScale);
      hits.push({ key: "badge", label: "Desconto", ...b });
      highlightIfNeeded(ctx, b, "badge", "Desconto", W, opts);
    }
    // Campanha pill — below discount badge
    if (data.campanha) {
      const bW = Math.round(W * 0.24);
      const bX = W - bW;
      const badgeBottomY = Math.round(H * 0.032) + Math.round(H * 0.072);
      const pillH = Math.round(H * 0.026);
      const pillY = badgeBottomY + Math.round(H * 0.006);
      ctx.fillStyle = "rgba(59,7,100,0.85)";
      ctx.fillRect(bX, pillY, bW, pillH);
      ctx.fillStyle = "#e9d5ff";
      ctx.font = `600 ${Math.round(H * 0.013)}px sans-serif`;
      ctx.textAlign = "center";
      const campTxt = data.campanha.length > 20 ? data.campanha.substring(0, 20) + "\u2026" : data.campanha;
      ctx.fillText(campTxt.toUpperCase(), bX + bW / 2, pillY + pillH * 0.72);
    }
  }

  // Tag
  { const es = getStyle(st, "tag");
    if (es.visible) {
      const color = es.color || "rgba(107,33,168,0.75)";
      const b = drawProductTag(ctx, W, H, imgH, data.tipoProduto || "Aéreo + Hotel", color, es.dx, es.dy, data.origemVoo, es.fontSizeScale);
      hits.push({ key: "tag", label: "Tipo", ...b });
      highlightIfNeeded(ctx, b, "tag", "Tipo", W, opts);
    }
  }

  const bodyX = Math.round(W * 0.037);
  const bodyY = imgH + Math.round(H * 0.022);
  const px2 = W - Math.round(W * 0.037);

  // Destination
  { const es = getStyle(st, "destination");
    if (es.visible) {
      const sc = es.fontSizeScale;
      const bx = bodyX + es.dx, by = bodyY + es.dy;
      const color = es.color || "#ffffff";
      ctx.fillStyle = color;
      let fs = Math.round(H * 0.072 * sc);
      ctx.font = `800 ${fs}px 'Barlow Condensed', sans-serif`;
      while (ctx.measureText(data.destino.toUpperCase()).width > W * 0.60 && fs > 22) {
        fs -= 2; ctx.font = `800 ${fs}px 'Barlow Condensed', sans-serif`;
      }
      ctx.textAlign = "left";
      ctx.fillText(data.destino.toUpperCase(), bx, by + fs);
      const subY = by + fs + Math.round(fs * 0.34);
      ctx.fillStyle = "#94a3b8";
      ctx.font = `${Math.round(H * 0.016 * sc)}px sans-serif`;
      const hotelClean = sanitize(data.hotel);
      const hotelShort = hotelClean.length > 44 ? hotelClean.substring(0, 44) + "\u2026" : hotelClean;
      ctx.fillText(`${hotelShort}  \u00B7  ${data.duracao}`, bx, subY);
      const boundsH = fs + Math.round(fs * 0.34) + Math.round(H * 0.020);
      hits.push({ key: "destination", label: "Destino", x: bx, y: by, w: W * 0.55, h: boundsH });
      highlightIfNeeded(ctx, { x: bx, y: by, w: W * 0.55, h: boundsH }, "destination", "Destino", W, opts);
      const sepY = subY + Math.round(H * 0.020);
      ctx.strokeStyle = "rgba(167,139,250,0.28)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx, sepY); ctx.lineTo(px2, sepY); ctx.stroke();
      // Inclui header
      const { dx: idx2, dy: idy2 } = getStyle(st, "inclui");
      const ilx = bodyX + idx2, ily = sepY + Math.round(H * 0.022) + idy2;
      if (getStyle(st, "inclui").visible) {
        ctx.fillStyle = "#94a3b8"; ctx.font = `700 ${Math.round(H * 0.016)}px sans-serif`;
        ctx.textAlign = "left"; ctx.fillText("INCLUI", ilx, ily);
      }
    }
  }

  // Inclui list
  { const es = getStyle(st, "inclui");
    if (es.visible) {
      const sc = es.fontSizeScale;
      let fs = Math.round(H * 0.072 * getStyle(st, "destination").fontSizeScale);
      ctx.save();
      ctx.font = `800 ${fs}px 'Barlow Condensed', sans-serif`;
      while (ctx.measureText(data.destino.toUpperCase()).width > W * 0.60 && fs > 22) fs -= 2;
      ctx.restore();
      const subY2 = bodyY + fs + Math.round(fs * 0.34);
      const sepY2 = subY2 + Math.round(H * 0.020);
      const ilx = bodyX + es.dx, ily = sepY2 + Math.round(H * 0.022) + es.dy;
      const color = es.color || "#a78bfa";
      let iy2 = ily + Math.round(H * 0.028);
      const itemFs = Math.round(H * 0.016 * sc);
      const lineH2 = Math.round(itemFs * 1.35);
      const itemGap = Math.round(itemFs * 0.45);
      const txtX2 = ilx + Math.round(W * 0.022);
      const maxTxtW = W * 0.46 - Math.round(W * 0.022);
      (data.inclui || []).forEach((item) => {
        ctx.fillStyle = color; ctx.font = `600 ${itemFs}px sans-serif`;
        ctx.fillText("\u2022", ilx, iy2);
        ctx.fillStyle = "#e2e8f0";
        ctx.font = `600 ${itemFs}px sans-serif`;
        iy2 = wrapText(ctx, sanitize(item), txtX2, iy2, maxTxtW, lineH2);
        iy2 += itemGap;
      });
      if (data.bagagem && /sem mala despachada/i.test(data.bagagem)) {
        ctx.fillStyle = "#ffaa00"; ctx.font = `600 ${Math.round(H * 0.015 * sc)}px sans-serif`;
        ctx.fillText("\u26A0 Só bagagem de mão", ilx, iy2 + Math.round(H * 0.006));
        iy2 += Math.round(H * 0.022);
      }
      const bounds = { x: ilx, y: ily - Math.round(H * 0.016), w: W * 0.50, h: iy2 - ily + Math.round(H * 0.016) };
      hits.push({ key: "inclui", label: "Inclui", ...bounds });
      highlightIfNeeded(ctx, bounds, "inclui", "Inclui", W, opts);
    }
  }

  // Price
  { const es = getStyle(st, "price");
    if (es.visible) {
      const sc = es.fontSizeScale;
      // A PARTIR DE + 10x above separator; R$ baseline touches separator
      let py2 = bodyY + Math.round(H * 0.020) + es.dy - 5;
      const prx = px2 + es.dx;
      const accent = es.color || "#a78bfa";
      ctx.textAlign = "right";
      ctx.fillStyle = "#94a3b8"; ctx.font = `${Math.round(H * 0.012 * sc)}px sans-serif`;
      ctx.fillText("A PARTIR DE", prx, py2); py2 += Math.round(H * 0.036 * sc);
      ctx.fillStyle = accent; ctx.font = `900 ${Math.round(H * 0.034 * sc)}px sans-serif`;
      ctx.fillText(`${data.parcelas}x`, prx, py2); py2 += Math.round(H * 0.048 * sc);
      ctx.fillStyle = "#fff"; ctx.font = `900 ${Math.round(H * 0.042 * sc)}px sans-serif`;
      ctx.fillText(`R$ ${data.precoParcela.replace("R$ ", "")}`, prx, py2); py2 += Math.round(H * 0.026 * sc);
      if (data.precoAVista) {
        ctx.fillStyle = "#e2e8f0"; ctx.font = `600 ${Math.round(H * 0.013 * sc)}px sans-serif`;
        ctx.fillText(`Ou ${data.precoAVista}`, prx, py2); py2 += Math.round(H * 0.018 * sc);
      }
      ctx.fillStyle = "#94a3b8"; ctx.font = `${Math.round(H * 0.011 * sc)}px sans-serif`;
      ctx.fillText("por pessoa em apto duplo", prx, py2);
      const priceStartY = bodyY + Math.round(H * 0.018) + es.dy - 5;
      const priceH = py2 - priceStartY + Math.round(H * 0.018);
      const bounds = { x: prx - W * 0.45, y: priceStartY, w: W * 0.45, h: priceH };
      hits.push({ key: "price", label: "Preço", ...bounds });
      highlightIfNeeded(ctx, bounds, "price", "Preço", W, opts);
    }
  }

  // Date pill + airline
  const bottomY = H - Math.round(H * 0.128);
  { const es = getStyle(st, "airline");
    if (es.visible && data.companhiaAerea) {
      const color = es.color || "#ffffff";
      const ax = px2 + es.dx, ay = bottomY + Math.round(H * 0.022) + es.dy;
      ctx.textAlign = "right"; ctx.fillStyle = color;
      ctx.font = `800 ${Math.round(H * 0.024 * es.fontSizeScale)}px sans-serif`;
      ctx.fillText(data.companhiaAerea.toUpperCase(), ax, ay);
      const aw = ctx.measureText(data.companhiaAerea.toUpperCase()).width;
      const bounds = { x: ax - aw, y: ay - Math.round(H * 0.022), w: aw + 4, h: Math.round(H * 0.028) };
      hits.push({ key: "airline", label: "Cia Aérea", ...bounds });
      highlightIfNeeded(ctx, bounds, "airline", "Cia Aérea", W, opts);
    }
  }
  { const es = getStyle(st, "datePill");
    if (es.visible && data.dataInicio && data.dataFim) {
      const color = es.color || "#6B21A8";
      const pillH = Math.round(H * 0.034);
      const dataTxt = `${data.dataInicio}  a  ${data.dataFim}`;
      ctx.font = `700 ${Math.round(H * 0.016 * es.fontSizeScale)}px sans-serif`;
      ctx.textAlign = "left";
      const pillW = ctx.measureText(dataTxt).width + Math.round(W * 0.05);
      const dpx = bodyX + es.dx, dpy = bottomY + es.dy;
      ctx.fillStyle = color;
      rrect(ctx, dpx, dpy, pillW, pillH, pillH / 2); ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillText(dataTxt, dpx + Math.round(W * 0.025), dpy + pillH * 0.68);
      hits.push({ key: "datePill", label: "Datas", x: dpx, y: dpy, w: pillW, h: pillH });
      highlightIfNeeded(ctx, { x: dpx, y: dpy, w: pillW, h: pillH }, "datePill", "Datas", W, opts);
    }
  }

  // Footer
  const footerY = H - Math.round(H * 0.066);
  ctx.strokeStyle = "rgba(167,139,250,0.2)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, footerY); ctx.lineTo(W, footerY); ctx.stroke();
  ctx.fillStyle = "#ddd6fe"; ctx.font = `700 ${Math.round(H * 0.016)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("UM PRODUTO BWT OPERADORA", W / 2, footerY + Math.round(H * 0.024));
  const condY = footerY + Math.round(H * 0.036);
  ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.font = `${Math.round(H * 0.008)}px sans-serif`;
  ctx.textAlign = "left";
  wrapText(ctx, `${(data.condicoes && data.condicoes.trim()) || COND_PADRAO} ${IMAGE_DISCLAIMER}`, Math.round(W * 0.018), condY + Math.round(H * 0.006), W - Math.round(W * 0.036), Math.round(H * 0.0098));
  // Custom texts
  for (const ct of (st?.customTexts ?? [])) {
    ctx.save();
    ctx.font = `${ct.bold ? "700" : "400"} ${Math.round(H * ct.fontSizeH)}px sans-serif`;
    ctx.fillStyle = ct.color;
    ctx.textAlign = "left";
    ctx.fillText(ct.text, ct.xFrac * W, ct.yFrac * H);
    const tw = ctx.measureText(ct.text).width;
    const th = H * ct.fontSizeH;
    hits.push({ key: ct.id, label: ct.text || "Texto", x: ct.xFrac * W, y: ct.yFrac * H - th, w: tw, h: th * 1.3 });
    highlightIfNeeded(ctx, { x: ct.xFrac * W, y: ct.yFrac * H - th, w: tw, h: th * 1.3 }, ct.id, ct.text || "Texto", W, opts);
    ctx.restore();
  }

  return hits;
}

// ─── drawFeed (1080 × 1080) ───────────────────────────────────────────────────

export function drawFeed(
  canvas: HTMLCanvasElement,
  data: TravelData,
  W: number,
  H: number,
  bgImage: HTMLImageElement | null,
  opts: DrawOpts = {},
): HitRegion[] {
  const ctx = canvas.getContext("2d")!;
  canvas.width = W;
  canvas.height = H;

  const hits: HitRegion[] = [];
  const st = opts.laminaState;

  const [sky, water, sand, palm] = getPalette(data.destino);
  const imgH = Math.round(H * 0.55);

  ctx.fillStyle = "#0a1528";
  ctx.fillRect(0, 0, W, H);

  if (bgImage) {
    drawBgImage(ctx, bgImage, 0, 0, W, imgH);
  } else {
    const skyGrd = ctx.createLinearGradient(0, 0, 0, imgH * 0.6);
    skyGrd.addColorStop(0, sky); skyGrd.addColorStop(1, "#d4f1f9");
    ctx.fillStyle = skyGrd; ctx.fillRect(0, 0, W, imgH * 0.6);
    ctx.fillStyle = "rgba(255,253,200,0.92)";
    ctx.beginPath(); ctx.arc(W * 0.76, imgH * 0.18, W * 0.055, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    [[0.1, 0.22, 75, 28], [0.32, 0.14, 95, 34], [0.54, 0.19, 70, 25]].forEach(([x, y, rx, ry]) => {
      ctx.beginPath();
      ctx.ellipse(W * x, imgH * y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    const waterY = imgH * 0.6, waterH = imgH * 0.24;
    const wGrd = ctx.createLinearGradient(0, waterY, 0, waterY + waterH);
    wGrd.addColorStop(0, water); wGrd.addColorStop(1, "#0a5a6e");
    ctx.fillStyle = wGrd; ctx.fillRect(0, waterY, W, waterH);
    ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, waterY);
    for (let x = 0; x <= W; x += 8) ctx.lineTo(x, waterY + 5 * Math.sin((x / 70) * Math.PI));
    ctx.stroke();
    ctx.fillStyle = sand; ctx.fillRect(0, waterY + waterH, W, imgH - (waterY + waterH));
    drawPalm(ctx, W * 0.1, imgH * 0.2, imgH * 0.35, palm);
    drawPalm(ctx, W * 0.72, imgH * 0.22, imgH * 0.26, palm);
  }

  const ovGrd = ctx.createLinearGradient(0, imgH * 0.45, 0, imgH);
  ovGrd.addColorStop(0, "rgba(10,21,40,0)"); ovGrd.addColorStop(1, "rgba(10,21,40,0.82)");
  ctx.fillStyle = ovGrd; ctx.fillRect(0, 0, W, imgH);

  // Bloqueio Aéreo badge — top-left
  if (data.bloqueioAereo) {
    const baTxt = `BLOQUEIO AÉREO — ${data.destino.toUpperCase()}`;
    const baFs = Math.round(H * 0.018);
    ctx.font = `800 ${baFs}px sans-serif`;
    const baTxtW = ctx.measureText(baTxt).width;
    const baPad = Math.round(W * 0.02);
    const baH = Math.round(H * 0.038);
    const baW = baTxtW + baPad * 2;
    const baX = Math.round(W * 0.037);
    const baY = Math.round(H * 0.018);
    ctx.fillStyle = "#6B21A8";
    rrect(ctx, baX, baY, baW, baH, 4); ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.fillText(baTxt, baX + baPad, baY + baH * 0.68);
  }

  // Badge
  { const es = getStyle(st, "badge");
    if (es.visible && data.desconto) {
      const color = es.color || "#a78bfa";
      const b = drawDiscountBadge(ctx, W, H, data.desconto, color, es.dx, es.dy, es.fontSizeScale);
      hits.push({ key: "badge", label: "Desconto", ...b });
      highlightIfNeeded(ctx, b, "badge", "Desconto", W, opts);
    }
    // Campanha pill — below discount badge
    if (data.campanha) {
      const bW = Math.round(W * 0.24);
      const bX = W - bW;
      const badgeBottomY = Math.round(H * 0.032) + Math.round(H * 0.072);
      const pillH = Math.round(H * 0.026);
      const pillY = badgeBottomY + Math.round(H * 0.006);
      ctx.fillStyle = "rgba(59,7,100,0.85)";
      ctx.fillRect(bX, pillY, bW, pillH);
      ctx.fillStyle = "#e9d5ff";
      ctx.font = `600 ${Math.round(H * 0.013)}px sans-serif`;
      ctx.textAlign = "center";
      const campTxt = data.campanha.length > 20 ? data.campanha.substring(0, 20) + "\u2026" : data.campanha;
      ctx.fillText(campTxt.toUpperCase(), bX + bW / 2, pillY + pillH * 0.72);
    }
  }

  // Tag
  { const es = getStyle(st, "tag");
    if (es.visible) {
      const color = es.color || "rgba(107,33,168,0.75)";
      const b = drawProductTag(ctx, W, H, imgH, data.tipoProduto || "Aéreo + Hotel", color, es.dx, es.dy, data.origemVoo, es.fontSizeScale);
      hits.push({ key: "tag", label: "Tipo", ...b });
      highlightIfNeeded(ctx, b, "tag", "Tipo", W, opts);
    }
  }

  const bodyX = Math.round(W * 0.037);
  const bodyY = imgH + Math.round(H * 0.02);
  const px2 = W - Math.round(W * 0.037);

  // Destination
  { const es = getStyle(st, "destination");
    if (es.visible) {
      const sc = es.fontSizeScale;
      const bx = bodyX + es.dx, by = bodyY + es.dy;
      const color = es.color || "#ffffff";
      ctx.fillStyle = color;
      // Proactively reduce font for longer destination names
      const nameLen = data.destino.length;
      const baseFrac = nameLen > 15 ? 0.052 : nameLen > 12 ? 0.062 : nameLen > 9 ? 0.071 : nameLen > 6 ? 0.085 : 0.095;
      let fs = Math.round(H * baseFrac * sc);
      ctx.font = `800 ${fs}px 'Barlow Condensed', sans-serif`;
      while (ctx.measureText(data.destino.toUpperCase()).width > W * 0.58 && fs > 22) {
        fs -= 2; ctx.font = `800 ${fs}px 'Barlow Condensed', sans-serif`;
      }
      ctx.textAlign = "left";
      ctx.fillText(data.destino.toUpperCase(), bx, by + fs);
      const subY = by + fs + Math.round(H * 0.016);
      ctx.fillStyle = "#94a3b8"; ctx.font = `${Math.round(H * 0.014 * sc)}px sans-serif`;
      const hotelClean = sanitize(data.hotel);
      const hotelShort = hotelClean.length > 32 ? hotelClean.substring(0, 32) + "\u2026" : hotelClean;
      ctx.fillText(`${hotelShort}  \u00B7  ${data.duracao}  \u00B7  ${data.regime}`, bx, subY);
      const totalH = fs + Math.round(H * 0.016) + Math.round(H * 0.018);
      hits.push({ key: "destination", label: "Destino", x: bx, y: by, w: W * 0.60, h: totalH });
      highlightIfNeeded(ctx, { x: bx, y: by, w: W * 0.60, h: totalH }, "destination", "Destino", W, opts);
      const sepY = subY + Math.round(H * 0.014);
      ctx.strokeStyle = "rgba(167,139,250,0.28)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx, sepY); ctx.lineTo(px2, sepY); ctx.stroke();
    }
  }

  // Inclui
  { const es = getStyle(st, "inclui");
    if (es.visible) {
      const sc = es.fontSizeScale;
      const destEs = getStyle(st, "destination");
      const nameLen2 = data.destino.length;
      const baseFrac2 = nameLen2 > 15 ? 0.052 : nameLen2 > 12 ? 0.062 : nameLen2 > 9 ? 0.071 : nameLen2 > 6 ? 0.085 : 0.095;
      let fs2 = Math.round(H * baseFrac2 * destEs.fontSizeScale);
      ctx.save();
      ctx.font = `800 ${fs2}px 'Barlow Condensed', sans-serif`;
      while (ctx.measureText(data.destino.toUpperCase()).width > W * 0.58 && fs2 > 22) fs2 -= 2;
      ctx.restore();
      const subY2 = bodyY + fs2 + Math.round(H * 0.016);
      const sepY2 = subY2 + Math.round(H * 0.014);
      const ilx = bodyX + es.dx, ily = sepY2 + Math.round(H * 0.024) + es.dy;
      const color = es.color || "#a78bfa";
      ctx.fillStyle = "#94a3b8"; ctx.font = `700 ${Math.round(H * 0.016 * sc)}px sans-serif`;
      ctx.textAlign = "left"; ctx.fillText("INCLUI", ilx, ily);
      let iy = ily + Math.round(H * 0.026);
      const lineH2 = Math.round(H * 0.024);
      const itemFs2 = Math.round(H * 0.019 * sc);
      const txtX3 = ilx + Math.round(W * 0.022);
      const maxTxtW2 = W * 0.52 - Math.round(W * 0.022);
      (data.inclui || []).forEach((item) => {
        ctx.fillStyle = color; ctx.font = `600 ${itemFs2}px sans-serif`;
        ctx.fillText("\u2022", ilx, iy);
        ctx.fillStyle = "#e2e8f0";
        ctx.font = `600 ${itemFs2}px sans-serif`;
        iy = wrapText(ctx, sanitize(item), txtX3, iy, maxTxtW2, lineH2);
      });
      if (data.bagagem && /sem mala despachada/i.test(data.bagagem)) {
        ctx.fillStyle = "#ffaa00"; ctx.font = `600 ${Math.round(H * 0.015 * sc)}px sans-serif`;
        ctx.fillText("\u26A0 Só bagagem de mão", ilx, iy + Math.round(H * 0.006));
        iy += Math.round(H * 0.022);
      }
      const bounds = { x: ilx, y: ily - Math.round(H * 0.016), w: W * 0.52, h: iy - ily + Math.round(H * 0.024) };
      hits.push({ key: "inclui", label: "Inclui", ...bounds });
      highlightIfNeeded(ctx, bounds, "inclui", "Inclui", W, opts);
    }
  }

  // Price — right-aligned column, vertically centered to match destination block
  { const es = getStyle(st, "price");
    if (es.visible) {
      const sc = es.fontSizeScale;
      // Compute separator Y dynamically so R$ baseline always sits on the line
      const prDestEs = getStyle(st, "destination");
      const prNameLen = data.destino.length;
      const prBaseFrac = prNameLen > 15 ? 0.052 : prNameLen > 12 ? 0.062 : prNameLen > 9 ? 0.071 : prNameLen > 6 ? 0.085 : 0.095;
      let prFs = Math.round(H * prBaseFrac * prDestEs.fontSizeScale);
      ctx.save();
      ctx.font = `800 ${prFs}px 'Barlow Condensed', sans-serif`;
      while (ctx.measureText(data.destino.toUpperCase()).width > W * 0.58 && prFs > 22) prFs -= 2;
      ctx.restore();
      const prSepY = bodyY + prFs + Math.round(H * 0.030); // subY(H*0.016) + sepGap(H*0.014)
      // Total advance from py2 to R$ baseline = H*0.036(A PARTIR DE) + H*0.046(10x) = H*0.082
      let py2 = Math.max(bodyY + Math.round(H * 0.004), prSepY - Math.round(H * 0.082 * sc)) + es.dy - 5;
      const prx = px2 + es.dx;
      const priceStartY = py2;
      const accent = es.color || "#a78bfa";
      ctx.textAlign = "right";
      // "A PARTIR DE" label — tight spacing to keep block high
      ctx.fillStyle = "#94a3b8"; ctx.font = `600 ${Math.round(H * 0.013 * sc)}px sans-serif`;
      ctx.fillText("A PARTIR DE", prx, py2); py2 += Math.round(H * 0.036 * sc);
      // Parcelas Nx
      ctx.fillStyle = accent; ctx.font = `900 ${Math.round(H * 0.038 * sc)}px sans-serif`;
      ctx.fillText(`${data.parcelas}x`, prx, py2); py2 += Math.round(H * 0.046 * sc);
      // Main price
      ctx.fillStyle = "#fff"; ctx.font = `900 ${Math.round(H * 0.048 * sc)}px sans-serif`;
      ctx.fillText(`R$ ${data.precoParcela.replace("R$ ", "")}`, prx, py2); py2 += Math.round(H * 0.026 * sc);
      if (data.precoAVista) {
        ctx.fillStyle = "#e2e8f0"; ctx.font = `600 ${Math.round(H * 0.014 * sc)}px sans-serif`;
        ctx.fillText(`Ou ${data.precoAVista}`, prx, py2); py2 += Math.round(H * 0.018 * sc);
      }
      ctx.fillStyle = "#94a3b8"; ctx.font = `${Math.round(H * 0.013 * sc)}px sans-serif`;
      ctx.fillText("por pessoa em apto duplo", prx, py2);
      py2 += Math.round(H * 0.014);
      const bounds = { x: prx - W * 0.44, y: priceStartY - Math.round(H * 0.014), w: W * 0.44, h: py2 - priceStartY + Math.round(H * 0.014) };
      hits.push({ key: "price", label: "Preço", ...bounds });
      highlightIfNeeded(ctx, bounds, "price", "Preço", W, opts);
    }
  }

  // Date pill + airline
  const bottomY = H - Math.round(H * 0.105);
  { const es = getStyle(st, "datePill");
    if (es.visible && data.dataInicio && data.dataFim) {
      const color = es.color || "#6B21A8";
      const pillH = Math.round(H * 0.034);
      const dataTxt = `${data.dataInicio}  a  ${data.dataFim}`;
      ctx.font = `700 ${Math.round(H * 0.016 * es.fontSizeScale)}px sans-serif`;
      ctx.textAlign = "left";
      const pillW = ctx.measureText(dataTxt).width + Math.round(W * 0.055);
      const dpx = bodyX + es.dx, dpy = bottomY + es.dy;
      ctx.fillStyle = color;
      rrect(ctx, dpx, dpy, pillW, pillH, pillH / 2); ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillText(dataTxt, dpx + Math.round(W * 0.027), dpy + pillH * 0.68);
      hits.push({ key: "datePill", label: "Datas", x: dpx, y: dpy, w: pillW, h: pillH });
      highlightIfNeeded(ctx, { x: dpx, y: dpy, w: pillW, h: pillH }, "datePill", "Datas", W, opts);
    }
  }
  { const es = getStyle(st, "airline");
    if (es.visible && data.companhiaAerea) {
      const color = es.color || "#ffffff";
      const ax = px2 + es.dx, ay = bottomY + Math.round(H * 0.026) + es.dy;
      ctx.textAlign = "right"; ctx.fillStyle = color;
      ctx.font = `800 ${Math.round(H * 0.028 * es.fontSizeScale)}px sans-serif`;
      ctx.fillText(data.companhiaAerea.toUpperCase(), ax, ay);
      const aw = ctx.measureText(data.companhiaAerea.toUpperCase()).width;
      const bounds = { x: ax - aw, y: ay - Math.round(H * 0.028), w: aw + 4, h: Math.round(H * 0.034) };
      hits.push({ key: "airline", label: "Cia Aérea", ...bounds });
      highlightIfNeeded(ctx, bounds, "airline", "Cia Aérea", W, opts);
    }
  }

  // Footer
  const footerY = H - Math.round(H * 0.062);
  ctx.strokeStyle = "rgba(167,139,250,0.2)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, footerY); ctx.lineTo(W, footerY); ctx.stroke();
  ctx.fillStyle = "#ddd6fe"; ctx.font = `700 ${Math.round(H * 0.016)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("UM PRODUTO BWT OPERADORA", W / 2, footerY + Math.round(H * 0.024));
  const condY = footerY + Math.round(H * 0.031);
  ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.font = `${Math.round(H * 0.0095)}px sans-serif`;
  ctx.textAlign = "left";
  wrapText(ctx, `${(data.condicoes && data.condicoes.trim()) || COND_PADRAO} ${IMAGE_DISCLAIMER}`, Math.round(W * 0.018), condY + Math.round(H * 0.007), W - Math.round(W * 0.036), Math.round(H * 0.013));
  // Custom texts
  for (const ct of (st?.customTexts ?? [])) {
    ctx.save();
    ctx.font = `${ct.bold ? "700" : "400"} ${Math.round(H * ct.fontSizeH)}px sans-serif`;
    ctx.fillStyle = ct.color;
    ctx.textAlign = "left";
    ctx.fillText(ct.text, ct.xFrac * W, ct.yFrac * H);
    const tw = ctx.measureText(ct.text).width;
    const th = H * ct.fontSizeH;
    hits.push({ key: ct.id, label: ct.text || "Texto", x: ct.xFrac * W, y: ct.yFrac * H - th, w: tw, h: th * 1.3 });
    highlightIfNeeded(ctx, { x: ct.xFrac * W, y: ct.yFrac * H - th, w: tw, h: th * 1.3 }, ct.id, ct.text || "Texto", W, opts);
    ctx.restore();
  }

  return hits;
}

// ─── Scale utilities ──────────────────────────────────────────────────────────

/** Scale position offsets from one canvas size to another */
export function scaleLaminaState(state: LaminaState, fromW: number, toW: number): LaminaState {
  const factor = toW / fromW;
  const styles: LaminaStyles = {};
  for (const [k, v] of Object.entries(state.styles)) {
    styles[k as ElemKey] = { ...v, dx: (v.dx ?? 0) * factor, dy: (v.dy ?? 0) * factor };
  }
  return { ...state, styles };
}
