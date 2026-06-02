import * as pdfjsLib from "pdfjs-dist";
import type { TravelData } from "@/types/travel";

// Use the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

export async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    let lastY: number | null = null;
    let pageText = "";
    for (const item of content.items as any[]) {
      if (item.str === undefined) continue;
      const y = Math.round(item.transform?.[5] || 0);
      if (lastY !== null && Math.abs(y - lastY) > 3) {
        pageText += "\n";
      } else if (lastY !== null) {
        pageText += " ";
      }
      pageText += item.str;
      lastY = y;
    }
    fullText += pageText + "\n\n";
  }

  return fullText;
}

export function validateBwtDocument(text: string): void {
  if (!/BWT\s+OPERADORA/i.test(text)) {
    throw new Error(
      "Este PDF não é um orçamento da BWT Operadora. Apenas orçamentos emitidos pela BWT Operadora são aceitos."
    );
  }
}

export function parseTravelData(text: string): TravelData {
  validateBwtDocument(text);

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const clean = lines.join(" ");
  const lineText = lines.join("\n");

  console.log("[PDF Parser] Text preview:", clean.substring(0, 800));

  // ── Número de adultos ──
  const adultosMatch = clean.match(/(\d+)\s*Adultos?\b/i);
  const numAdultos = adultosMatch ? parseInt(adultosMatch[1]) : 2;

  // ── Destino — derive from hotel address/name first, then airport arrival ──
  const destino = extractDestino(clean, lines);

  // ── Hotel ──
  const hotel = extractHotel(clean, lines);

  // ── Tipo de quarto ──
  const quartoTipo = extractQuartoTipo(clean, lines);

  // ── Regime ──
  const regime = extractRegime(clean);

  // ── Preço Total (Total com taxas) ──
  const precoTotal = extractPrecoTotal(clean);
  const totalNum = parseMoneyToNumber(precoTotal);

  // ── Preço por pessoa ──
  const precoPorPessoa = totalNum > 0
    ? formatMoney(totalNum / numAdultos)
    : precoTotal;

  // ── Parcelas — look only at credit card line, default 10 ──
  const cartaoMatch = clean.match(/cart[ãa]o[^.]*?(\d{1,2})\s*[xX]/i) ||
    clean.match(/(\d{1,2})\s*[xX]\s+iguais/i);
  const parcelas = cartaoMatch ? parseInt(cartaoMatch[1]) : 10;
  const precoParcela = totalNum > 0
    ? formatMoney(totalNum / numAdultos / parcelas)
    : "Consultar";

  // ── Desconto PIX ──
  const descontoMatch = clean.match(/(\d{1,2})\s*%\s*(?:de\s+)?desconto/i);
  const desconto = descontoMatch ? descontoMatch[1] : "5";
  const descontoNum = parseInt(desconto) / 100;
  const precoAVista = totalNum > 0
    ? formatMoney((totalNum / numAdultos) * (1 - descontoNum))
    : precoPorPessoa;

  // ── Duração ──
  const duracaoMatch = clean.match(/(\d+)\s*Noites?/i);
  const duracao = duracaoMatch ? `${duracaoMatch[1]} Noites` : "5 Noites";

  // ── Datas ──
  const { dataInicio, dataFim } = extractDatas(clean, lines);

  // ── Companhia Aérea ──
  const companhiaAerea = extractCompanhiaAerea(clean);

  // ── Campanha ──
  const campanhaMatch = clean.match(/Operação\s+([\w\s\-]+?)(?:\s*[-–]|\s+Nº|\s+\d|$)/i);
  const campanha = campanhaMatch
    ? `Operação ${campanhaMatch[1].trim()}`
    : extractField(clean, [/(?:campanha|promoção)[:\s]+([^\n,;]+)/i]);

  // ── Roteiro ──
  const roteiro = extractRoteiro(lines);

  // ── Agência ──
  const agencia = extractAgencia(clean, lines);

  // ── Bagagem ──
  const bagagem = extractBagagem(clean);

  // ── Origem do voo ──
  const origemVoo = extractOrigemVoo(clean);

  // ── Inclui ──
  const inclui = extractInclui(lines, hotel, companhiaAerea || "", duracao, bagagem);

  // ── Tipo de produto ──
  const hasAereo = /a[ée]reo/i.test(clean);
  const hasHotel = /hosp|hotel/i.test(clean);
  const hasTransfer = /transfer|traslado/i.test(clean);
  const tipoProduto = hasAereo && hasHotel && hasTransfer
    ? "Aéreo + Hotel + Transfer"
    : hasAereo && hasHotel
      ? "Aéreo + Hotel"
      : clean.match(/cruzeiro/i)
        ? "Cruzeiro"
        : "Pacote";

  return {
    destino,
    hotel,
    quartoTipo: quartoTipo || undefined,
    precoTotal: totalNum > 0 ? formatMoney(totalNum) : "R$ 0,00",
    precoPorPessoa,
    precoParcela,
    parcelas,
    precoAVista,
    numAdultos,
    duracao,
    regime,
    roteiro,
    desconto,
    dataInicio,
    dataFim,
    companhiaAerea: companhiaAerea || undefined,
    bagagem: bagagem || undefined,
    origemVoo: origemVoo || undefined,
    agencia: agencia || undefined,
    inclui: inclui.length > 0 ? inclui : ["Consultar itens inclusos"],
    tipoProduto,
    campanha: campanha || undefined,
  };
}

// ─── Extraction helpers ───

function extractDestino(clean: string, lines: string[]): string {
  // Pattern 1: "Operação Caribe - Cancún" or "Operação Caribe – Punta Cana"
  const opMatch = clean.match(/Operação\s+[\w\s]+[-–]\s*([A-ZÀ-Úa-zà-ú][\w\s]*?)(?:\s+Nº|\s*$)/i);
  if (opMatch) return normalizeDestino(opMatch[1].trim());

  // Pattern 2: Airport arrival codes — most reliable, derived from last arrival in Ida section
  // Run BEFORE knownDests so origin cities (GRU=São Paulo, PVH=Porto Velho) are never picked
  const airportDest = extractDestinationFromAirport(clean);
  if (airportDest) return airportDest;

  // Pattern 3: Known destination names found in hotel address/name context only
  // Restrict search to the hotel block (after "Hospedagem") to avoid matching origin cities
  const hotelBlock = (() => {
    const idx = clean.search(/hospedagem/i);
    return idx >= 0 ? clean.slice(idx, idx + 600) : "";
  })();
  const knownDests = [
    // Brazil
    "Fortaleza", "Jericoacoara", "Fernando de Noronha",
    "Porto Seguro", "Porto Alegre",
    "Foz do Iguaçu", "Foz do Iguacu",
    "Rio de Janeiro", "São Paulo",
    "Florianópolis", "Florianopolis", "Balneário Camboriú",
    "Salvador", "Recife", "Natal", "Maceió", "Maceio",
    "Porto de Galinhas", "Morro de São Paulo",
    "Gramado", "Canela", "Bonito", "Pantanal",
    "Manaus", "Belém", "Brasília", "Curitiba",
    "São Luís", "Teresina", "Aracaju", "Macapá",
    "Paraty", "Angra dos Reis", "Búzios", "Cabo Frio",
    "Ilhéus", "Vitória", "Ubatuba",
    // Caribbean & Mexico
    "Punta Cana", "Santo Domingo",
    "Riviera Maya", "Playa del Carmen", "Costa Mujeres", "Tulum",
    "Cancún", "Cancun", "Los Cabos", "Puerto Vallarta", "Mazatlán",
    "Cidade do México",
    "Havana", "Varadero",
    "Montego Bay", "Jamaica",
    "Nassau", "Bahamas",
    "Turks e Caicos",
    "San Juan", "Puerto Rico",
    "Aruba", "Curaçao", "Curacao",
    "Sint Maarten", "St. Maarten",
    "Barbados", "Guadalupe", "Martinica", "Santa Lúcia",
    // South America
    "Buenos Aires", "Bariloche", "Mendoza", "Córdoba",
    "Puerto Iguazú", "Ushuaia", "Salta",
    "Montevidéu", "Montevideo", "Punta del Este",
    "Assunção", "Assuncao",
    "Santiago", "Punta Arenas", "Ilha de Páscoa",
    "Bogotá", "Bogota", "Cartagena", "Medellín", "San Andrés",
    "Lima", "Cusco", "Machu Picchu",
    "Quito", "Galápagos", "Galapagos",
    "Cidade do Panamá", "San José", "Costa Rica",
    "Isla Margarita",
    // USA / Canada
    "Miami", "Fort Lauderdale",
    "Orlando", "Nova York", "New York",
    "Los Angeles", "Las Vegas",
    "San Francisco", "Chicago", "Atlanta",
    "Boston", "Washington D.C.", "Seattle", "Denver",
    "Honolulu", "Havaí", "Hawaii",
    "Toronto", "Vancouver", "Montreal",
    // Europe
    "Lisboa", "Porto", "Algarve", "Madeira", "Açores",
    "Madrid", "Barcelona", "Ibiza", "Sevilha",
    "Palma de Mallorca", "Tenerife", "Gran Canária", "Lanzarote",
    "Málaga", "Costa del Sol",
    "Paris", "Nice", "Lyon",
    "Roma", "Milão", "Veneza", "Florença", "Nápoles",
    "Catânia", "Sicília",
    "Londres", "Edimburgo",
    "Frankfurt", "Munique", "Berlim",
    "Amsterdã", "Amsterdam",
    "Zurique", "Genebra",
    "Viena", "Bruxelas",
    "Atenas", "Santorini", "Mykonos", "Rodes", "Heraklion",
    "Dubrovnik", "Croácia",
    "Praga", "Budapeste", "Varsóvia", "Cracóvia",
    "Istambul", "Antalya", "Bodrum",
    "Moscou", "São Petersburgo",
    "Estocolmo", "Oslo", "Copenhague", "Helsinque",
    "Reykjavik",
    // Middle East / Africa
    "Dubai", "Abu Dhabi", "Doha",
    "Tel Aviv",
    "Cairo", "Hurghada", "Sharm el-Sheikh",
    "Marrakech", "Casablanca",
    "Joanesburgo", "Cidade do Cabo",
    "Nairóbi", "Zanzibar",
    "Seychelles", "Maurício", "Reunião",
    // Asia
    "Tóquio", "Toquio", "Osaka", "Kyoto",
    "Seul", "Seoul",
    "Xangai", "Pequim", "Hong Kong",
    "Singapura", "Kuala Lumpur",
    "Bangkok", "Phuket", "Chiang Mai", "Koh Samui",
    "Bali", "Jacarta",
    "Hanói", "Ho Chi Minh", "Da Nang",
    "Siem Reap", "Angkor Wat",
    "Manila",
    "Mumbai", "Nova Déli", "Goa",
    "Maldivas",
    // Oceania
    "Sydney", "Melbourne", "Brisbane", "Cairns",
    "Auckland", "Christchurch",
    "Taiti", "Polinésia Francesa",
  ];
  for (const dest of knownDests) {
    if (hotelBlock.includes(dest)) return normalizeDestino(dest);
  }

  // Pattern 4: "destino: X"
  const destMatch = clean.match(/destino[:\s]+([A-ZÀ-Ú][\w\s]+?)(?=[,;.\n])/i);
  if (destMatch) return normalizeDestino(destMatch[1].trim());

  return "Destino";
}

function extractHotel(clean: string, lines: string[]): string {
  // Pattern 1: Infotera format — hotel name is the first substantive line after
  // the "Hospedagem" section header. "Hospedagem" and "Total" may be on separate
  // lines due to left/right PDF layout, so we find any "Hospedagem" section header
  // (not a reference to room-only or baggage) and scan subsequent lines.
  const HOTEL_SKIP = /^(total|check|noites|hóspedes|adultos|serviços|aéreo|incluso|datas|valores|powered|telefone|rua |av\. |bairro|\d+x\s*|\(|\d{2}\s)/i;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/hospedagem/i.test(line) && !/serviços|aéreo|sem\s+mala|quarto|check/i.test(line)) {
      // Confirm this is the hotel section (not the "Incluso" checklist) by
      // requiring "Total" to appear in the next 2 lines (Infotera always shows
      // "Hospedagem  Total ( N Adultos )" — possibly split across lines)
      const nearby = lines.slice(i, i + 3).join(" ");
      if (!/total/i.test(nearby)) continue;
      // Also accept the very next line being "Total ( N Adultos )" — skip it
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const candidate = lines[j];
        if (candidate.length < 4) continue;
        if (/total\s*\(/i.test(candidate)) continue;      // "Total ( 2 Adultos )"
        if (HOTEL_SKIP.test(candidate)) continue;
        if (/@|financeiro|telefone/i.test(candidate)) break; // hit agency info block
        return cleanHotelName(candidate);
      }
    }
  }

  // Pattern 2: Known hotel brands
  const brandMatch = clean.match(
    /((?:Grand\s+)?(?:Palladium|Impressive|Iberostar|Barceló|RIU|Hard Rock|Secrets|Dreams|Breathless|Royalton|Sandals|Hyatt|Hilton|Marriott|Sheraton|Meliá|Occidental|Bahia Principe)[\w\s]+?)(?:\s*[-–,;.]|\s+(?:Check|Suite|Tudo|All|Quarto|\d))/i
  );
  if (brandMatch) return cleanHotelName(brandMatch[1]);

  // Pattern 3: Standalone "Hotel XYZ" line (hotel name starts with "Hotel")
  for (const line of lines) {
    if (/^Hotel\s+\w/i.test(line) && line.length > 8 && !/Total|Telefone|^Hotel\s*$/.test(line)) {
      return cleanHotelName(line);
    }
  }

  // Pattern 4: "hotel: X" or inline mention
  const hotelMatch = clean.match(/hotel[:\s]+([A-ZÀ-Ú][\w\s,]+?)(?:\s*[-–,;.]|\s+(?:Check|Suite|Tudo|All|\d{2}\/\d{2}))/i);
  if (hotelMatch) return cleanHotelName(hotelMatch[1]);

  // Pattern 5: Resort/Palace/Suites etc. in name
  const resortMatch = clean.match(/((?:[\w\s]+\s)?(?:Resort|Palace|Suites|Lodge|Beach|Bay|Club|Grand|Plaza|Royal)[\w\s]*?)(?:\s*[-–,;.]|\s+(?:Check|Suite|Tudo|All|\d))/i);
  if (resortMatch) return cleanHotelName(resortMatch[1]);

  return "Hotel";
}

function extractQuartoTipo(clean: string, lines: string[]): string | null {
  // Pattern: "Suite Júnior ao Lado da Piscina 2 Adultos" — line with room type before adults count
  for (const line of lines) {
    const roomMatch = line.match(/((?:Suite|Suíte|Quarto|Room|Studio|Villa|Bungalow|Cabana|Loft)[\w\sÀ-ú]+?)(?:\s*\d+\s*Adultos?|\s*$)/i);
    if (roomMatch && roomMatch[1].trim().length > 5) {
      return roomMatch[1].trim();
    }
  }

  // Pattern: "Standard", "Superior", "Deluxe" etc.
  const catMatch = clean.match(/((?:Standard|Superior|Deluxe|Premium|Master|Luxo|Select|Junior|Sênior)[\w\sÀ-ú]*?)(?:\s*\d|\s*[-,;.])/i);
  if (catMatch) return catMatch[1].trim();

  return null;
}

function extractRegime(clean: string): string {
  if (/tudo\s*inclu[ií]do|all\s*inclusive|all\s*in/i.test(clean)) return "All Inclusive";
  if (/meia\s*pens[ãa]o/i.test(clean)) return "Meia Pensão";
  if (/pens[ãa]o\s*completa/i.test(clean)) return "Pensão Completa";
  if (/caf[ée]\s*da\s*manh[ãa]|bed\s*&?\s*breakfast/i.test(clean)) return "Café da Manhã";
  if (/room\s*only|s[óo]\s*hosp/i.test(clean)) return "Room Only";
  return "Consultar";
}

function extractPrecoTotal(clean: string): string {
  // Pattern 1: "Total com taxas R$ X.XXX,XX" — Infotera standard
  const totalTaxasMatch = clean.match(/Total\s+com\s+taxas\s*[:\s]*R?\$?\s*([\d.]+,\d{2})/i);
  if (totalTaxasMatch) return `R$ ${totalTaxasMatch[1]}`;

  // Pattern 2: "Total: R$ X.XXX,XX"
  const totalMatch = clean.match(/(?:total|valor\s+total|preço\s+total|investimento)[:\s]*R?\$?\s*([\d.]+,\d{2})/i);
  if (totalMatch) return `R$ ${totalMatch[1]}`;

  // Pattern 3: Last/largest R$ value
  const allPrices = [...clean.matchAll(/R\$\s*([\d.]+,\d{2})/g)];
  if (allPrices.length > 0) {
    let max = 0;
    let maxStr = "";
    for (const m of allPrices) {
      const val = parseMoneyToNumber(`R$ ${m[1]}`);
      if (val > max) { max = val; maxStr = m[1]; }
    }
    if (maxStr) return `R$ ${maxStr}`;
  }

  return "R$ 0,00";
}

function extractDatas(clean: string, lines: string[]): { dataInicio?: string; dataFim?: string } {
  // Pattern 1: "01 ago 2026" ... "07 ago 2026" from header table
  const months: Record<string, string> = {
    jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
    jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
  };

  const datePattern = /(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\s*(\d{4})?/gi;
  const dates: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = datePattern.exec(clean)) !== null) {
    const day = m[1].padStart(2, "0");
    const month = months[m[2].toLowerCase()] || "01";
    const year = m[3] || new Date().getFullYear().toString();
    dates.push(`${day}/${month}/${year}`);
  }

  if (dates.length >= 2) {
    return { dataInicio: dates[0], dataFim: dates[1] };
  }

  // Pattern 2: dd/mm/yyyy
  const dateSlash = clean.match(/(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*(?:a|até|à|[-–])\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/);
  if (dateSlash) {
    return { dataInicio: dateSlash[1], dataFim: dateSlash[2] };
  }

  return {};
}

function extractRoteiro(lines: string[]): string[] {
  const roteiro: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const diaMatch = lines[i].match(/^Dia\s+(\d+)\s*[:\-–]/i);
    if (diaMatch) {
      // Grab the next line as description, or the text after the colon
      const afterColon = lines[i].replace(/^Dia\s+\d+\s*[:\-–]\s*/i, "").trim();
      if (afterColon.length > 10) {
        // Shorten to first sentence
        const short = afterColon.split(/[.;]/)[0].trim();
        roteiro.push(short || afterColon.substring(0, 80));
      } else if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const short = nextLine.split(/[.;]/)[0].trim();
        roteiro.push(short || nextLine.substring(0, 80));
      }
    }
  }

  if (roteiro.length === 0) {
    return ["Consultar roteiro detalhado"];
  }

  return roteiro.slice(0, 8);
}

function extractAgencia(clean: string, lines: string[]): string | undefined {
  // Pattern 1: "Powered by infotera [AGÊNCIA] - Orcamento:" — most reliable
  const poweredBy = clean.match(/Powered\s+by\s+infotera\s+([\w\sÀ-ú&.,'-]+?)\s*[-–]\s*Orcamento/i);
  if (poweredBy) return poweredBy[1].trim();

  // Pattern 2: Agency name in header — look for travel-agency-looking lines in first 25 lines
  for (let i = 0; i < Math.min(25, lines.length); i++) {
    const line = lines[i].trim();
    if (
      line.length > 4 && line.length < 70 &&
      /viagens?|turismo|travel|tours?|agência|agencia|receptivo/i.test(line) &&
      !/@|Telefone|BWT|infotera|Orcamento/i.test(line)
    ) {
      return line;
    }
  }
  return undefined;
}

function extractBagagem(clean: string): string | undefined {
  const re = /(\d+)x\s*Mala\s*despachada/gi;
  const counts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) counts.push(parseInt(m[1], 10));
  if (counts.length === 0) return undefined;
  if (counts.every(n => n === 0)) return "Sem mala despachada — apenas bagagem de mão";
  const max = Math.max(...counts);
  return max > 0 ? `${max} mala(s) despachada(s) por pessoa` : undefined;
}

function extractOrigemVoo(clean: string): string | undefined {
  // Find the first time-code pattern in the "Ida" section: "HH:MM CODE"
  const idaSection = clean.match(/\bIda\b([\s\S]{0,4000}?)(?:\bVolta\b|$)/i);
  if (idaSection) {
    const timeCode = idaSection[1].match(/\d{1,2}:\d{2}\s+([A-Z]{3})\b/);
    if (timeCode) {
      const code = timeCode[1];
      const city = airportCodeToCity(code);
      if (city) return `${city} (${code})`;
    }
  }
  return undefined;
}

// Known carriers, ordered most-specific/multi-word first so e.g. "Royal Air
// Maroc" is matched before bare tokens like "TAP". Matching is word-boundary
// based (see extractCompanhiaAerea) so substrings inside other words — the bug
// where "TAP" matched inside unrelated text — can no longer produce a hit.
const KNOWN_AIRLINES: string[] = [
  // Multi-word / specific names first
  "Royal Air Maroc", "Royal Jordanian",
  "TAP Air Portugal",
  "American Airlines", "Copa Airlines", "United Airlines", "Delta Air Lines",
  "Aerolíneas Argentinas", "Aerolineas Argentinas",
  "Air France", "Air Canada", "Air Europa", "Air China",
  "British Airways", "Turkish Airlines", "Qatar Airways", "Ethiopian Airlines",
  "Singapore Airlines", "Japan Airlines", "Korean Air", "Cathay Pacific",
  "Sky Airline", "South African Airways", "Cabo Verde Airlines",
  "Boliviana de Aviación", "Boliviana de Aviacion",
  "Aeroméxico", "Aeromexico",
  // Single distinctive tokens last
  "LATAM", "Avianca", "Emirates", "Etihad", "Iberia", "Lufthansa", "KLM",
  "Swiss", "Vueling", "JetBlue", "JetSmart", "Arajet", "Wingo", "Conviasa",
  "Paranair", "Amaszonas", "Qantas", "Azul", "GOL", "TAP", "Copa",
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanAirlineName(raw: string): string {
  return raw
    .replace(/[^ -ɏḀ-ỿ]/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+(?:em|classe|econ\w*|executiva|voo|de\s+ida|ida|volta)$/i, "")
    .replace(/[,;.]+$/, "")
    .trim();
}

function extractCompanhiaAerea(clean: string): string | undefined {
  // Pattern 1: known carrier names, word-boundary matched (specific names first).
  // This is the most precise path and is tried first so recognised airlines are
  // never confused with an incidental token elsewhere in the document.
  for (const airline of KNOWN_AIRLINES) {
    const re = new RegExp(`\\b${escapeRegExp(airline)}\\b`, "i");
    if (re.test(clean)) return airline;
  }

  // Pattern 2: explicit operator phrase — catches carriers not in the list.
  // Capture up to 3 letter-words to avoid running into flight numbers / details.
  const operado = clean.match(
    /(?:Voo\s+)?Operado\s+por\s+([A-Za-zÀ-ú][A-Za-zÀ-ú&.\-]*(?:\s+[A-Za-zÀ-ú][A-Za-zÀ-ú&.\-]*){0,2})/i,
  );
  if (operado) {
    const name = cleanAirlineName(operado[1]);
    if (name.length >= 3) return name;
  }

  // Pattern 3: labelled field "Cia Aérea: X" / "Companhia Aérea: X"
  const labelled = clean.match(
    /(?:Cia\.?\s*A[ée]rea|Companhia\s+A[ée]rea)\s*[:\-]\s*([A-Za-zÀ-ú][A-Za-zÀ-ú&.\-]*(?:\s+[A-Za-zÀ-ú][A-Za-zÀ-ú&.\-]*){0,2})/i,
  );
  if (labelled) {
    const name = cleanAirlineName(labelled[1]);
    if (name.length >= 3) return name;
  }

  return undefined;
}

function extractInclui(lines: string[], hotel: string, cia: string, duracao: string, bagagem?: string): string[] {
  const inclui: string[] = [];

  if (cia) {
    const bagNote = bagagem && /sem mala despachada/i.test(bagagem) ? " (sem mala despachada)" : "";
    inclui.push(`Aéreo com ${cia} em Classe Econômica${bagNote}`);
  }

  if (lines.some((l) => /transfer|traslado/i.test(l))) {
    inclui.push("Transfer de chegada e saída");
  }

  const seguroLine = lines.find((l) => /seguro/i.test(l) && l.length > 10 && l.length < 120);
  if (seguroLine) inclui.push("Seguro Viagem");

  if (hotel !== "Hotel") inclui.push(`${duracao} de hospedagem no ${hotel}`);

  if (lines.some((l) => /tudo\s*inclu[ií]do|all\s*inclusive/i.test(l))) {
    inclui.push("All Inclusive (Tudo Incluído)");
  } else if (lines.some((l) => /caf[ée]\s*da\s*manh[ãa]/i.test(l))) {
    inclui.push("Café da manhã");
  }

  return inclui;
}

// ─── Shared airport code → city name map ───────────────────────────────────
const AIRPORT_MAP: Record<string, string> = {
  // ── Brazil ──────────────────────────────────────────────────────────────
  GRU: "São Paulo", CGH: "São Paulo", VCP: "Campinas",
  GIG: "Rio de Janeiro", SDU: "Rio de Janeiro",
  BSB: "Brasília",
  CWB: "Curitiba",
  POA: "Porto Alegre",
  FLN: "Florianópolis",
  SSA: "Salvador",
  FOR: "Fortaleza",
  REC: "Recife",
  NAT: "Natal",
  MCZ: "Maceió",
  JPA: "João Pessoa",
  BEL: "Belém",
  MAO: "Manaus",
  IGU: "Foz do Iguaçu",
  PVH: "Porto Velho",
  BVB: "Boa Vista",
  STM: "Santarém",
  PMW: "Palmas",
  SLZ: "São Luís",
  THE: "Teresina",
  AJU: "Aracaju",
  MCP: "Macapá",
  CGR: "Campo Grande",
  CGB: "Cuiabá",
  XMS: "Bonito",
  BYO: "Bonito",
  MGF: "Maringá",
  LDB: "Londrina",
  JOI: "Joinville",
  NVT: "Navegantes",
  BPS: "Porto Seguro",
  IOS: "Ilhéus",
  VDC: "Vitória da Conquista",
  VIX: "Vitória",
  UDI: "Uberlândia",
  GYN: "Goiânia",
  RBR: "Rio Branco",
  PNZ: "Petrolina",
  JJD: "Jericoacoara",
  // ── South America ────────────────────────────────────────────────────────
  EZE: "Buenos Aires", AEP: "Buenos Aires",
  BRC: "Bariloche",
  MDZ: "Mendoza",
  COR: "Córdoba",
  IGR: "Puerto Iguazú",
  USH: "Ushuaia",
  SLA: "Salta",
  JUJ: "Jujuy",
  ROS: "Rosário",
  NQN: "Neuquén",
  PMQ: "Puerto Madryn",
  MVD: "Montevidéu",
  PDP: "Punta del Este",
  SCL: "Santiago",
  PMC: "Puerto Montt",
  IQQ: "Iquique",
  ANF: "Antofagasta",
  CPO: "Copiapó",
  PUQ: "Punta Arenas",
  IPC: "Ilha de Páscoa",
  ASU: "Assunção",
  BOG: "Bogotá",
  CTG: "Cartagena",
  MDE: "Medellín",
  CLO: "Cali",
  ADZ: "San Andrés",
  SMR: "Santa Marta",
  LIM: "Lima",
  CUZ: "Cusco",
  IQT: "Iquitos",
  AQP: "Arequipa",
  UIO: "Quito",
  GYE: "Guayaquil",
  GPS: "Galápagos",
  CCS: "Caracas",
  PMV: "Isla Margarita",
  LPB: "La Paz",
  VVI: "Santa Cruz de la Sierra",
  PTY: "Cidade do Panamá",
  SJO: "San José",
  TGU: "Tegucigalpa",
  SAL: "San Salvador",
  GUA: "Cidade da Guatemala",
  MGA: "Manágua",
  // ── Caribbean ────────────────────────────────────────────────────────────
  PUJ: "Punta Cana",
  SDQ: "Santo Domingo",
  CUN: "Cancún",
  SJD: "Los Cabos",
  PVR: "Puerto Vallarta",
  MZT: "Mazatlán",
  MEX: "Cidade do México",
  OAX: "Oaxaca",
  MID: "Mérida",
  HAV: "Havana",
  VRA: "Varadero",
  MBJ: "Montego Bay",
  KIN: "Kingston",
  NAS: "Nassau",
  PLS: "Turks e Caicos",
  SJU: "San Juan",
  AUA: "Aruba",
  CUR: "Curaçao",
  SXM: "Sint Maarten",
  BGI: "Barbados",
  PTP: "Guadalupe",
  FDF: "Martinica",
  UVF: "Santa Lúcia",
  GND: "Granada",
  ANU: "Antígua",
  // ── North America ────────────────────────────────────────────────────────
  MIA: "Miami",
  FLL: "Fort Lauderdale",
  MCO: "Orlando",
  JFK: "Nova York",
  EWR: "Nova York",
  LGA: "Nova York",
  LAX: "Los Angeles",
  LAS: "Las Vegas",
  SFO: "San Francisco",
  ORD: "Chicago",
  ATL: "Atlanta",
  BOS: "Boston",
  IAD: "Washington D.C.",
  DCA: "Washington D.C.",
  SEA: "Seattle",
  DEN: "Denver",
  PHX: "Phoenix",
  HNL: "Honolulu",
  YYZ: "Toronto",
  YVR: "Vancouver",
  YUL: "Montreal",
  // ── Europe ───────────────────────────────────────────────────────────────
  LIS: "Lisboa",
  OPO: "Porto",
  FAO: "Algarve",
  FNC: "Madeira",
  PDL: "Açores",
  MAD: "Madrid",
  BCN: "Barcelona",
  AGP: "Málaga",
  SVQ: "Sevilha",
  IBZ: "Ibiza",
  PMI: "Palma de Mallorca",
  TFS: "Tenerife",
  TFN: "Tenerife",
  LPA: "Gran Canária",
  ACE: "Lanzarote",
  CDG: "Paris",
  ORY: "Paris",
  NCE: "Nice",
  LYS: "Lyon",
  MRS: "Marselha",
  FCO: "Roma",
  MXP: "Milão",
  LIN: "Milão",
  VCE: "Veneza",
  FLR: "Florença",
  NAP: "Nápoles",
  CTA: "Catânia",
  PMO: "Palermo",
  BLQ: "Bolonha",
  LHR: "Londres",
  LGW: "Londres",
  STN: "Londres",
  EDI: "Edimburgo",
  MAN: "Manchester",
  FRA: "Frankfurt",
  MUC: "Munique",
  BER: "Berlim",
  HAM: "Hamburgo",
  AMS: "Amsterdã",
  ZRH: "Zurique",
  GVA: "Genebra",
  VIE: "Viena",
  BRU: "Bruxelas",
  ATH: "Atenas",
  JTR: "Santorini",
  JMK: "Mykonos",
  RHO: "Rodes",
  HER: "Heraklion",
  CFU: "Corfu",
  SKG: "Tessalônica",
  DBV: "Dubrovnik",
  SPU: "Split",
  ZAG: "Zagreb",
  PRG: "Praga",
  BUD: "Budapeste",
  WAW: "Varsóvia",
  KRK: "Cracóvia",
  IST: "Istambul",
  SAW: "Istambul",
  AYT: "Antalya",
  BJV: "Bodrum",
  DLM: "Dalaman",
  SVO: "Moscou",
  DME: "Moscou",
  LED: "São Petersburgo",
  ARN: "Estocolmo",
  OSL: "Oslo",
  CPH: "Copenhague",
  HEL: "Helsinque",
  KEF: "Reykjavik",
  DUB: "Dublin",
  OTP: "Bucareste",
  SOF: "Sofia",
  // ── Middle East / Africa ─────────────────────────────────────────────────
  DXB: "Dubai",
  AUH: "Abu Dhabi",
  DOH: "Doha",
  RUH: "Riade",
  BAH: "Manama",
  AMM: "Amã",
  TLV: "Tel Aviv",
  CAI: "Cairo",
  HRG: "Hurghada",
  SSH: "Sharm el-Sheikh",
  RAK: "Marrakech",
  CMN: "Casablanca",
  TUN: "Tunis",
  JNB: "Joanesburgo",
  CPT: "Cidade do Cabo",
  DUR: "Durban",
  NBO: "Nairóbi",
  ZNZ: "Zanzibar",
  DAR: "Dar es Salaam",
  EBB: "Kampala",
  ADD: "Adis Abeba",
  SEZ: "Seychelles",
  MRU: "Maurício",
  RUN: "Reunião",
  // ── Asia ─────────────────────────────────────────────────────────────────
  NRT: "Tóquio",
  HND: "Tóquio",
  KIX: "Osaka",
  NGO: "Nagoia",
  CTS: "Sapporo",
  OKA: "Okinawa",
  ICN: "Seul",
  GMP: "Seul",
  PUS: "Busan",
  PVG: "Xangai",
  SHA: "Xangai",
  PEK: "Pequim",
  PKX: "Pequim",
  HKG: "Hong Kong",
  CAN: "Guangzhou",
  CTU: "Chengdu",
  CKG: "Chongqing",
  XIY: "Xi'an",
  SIN: "Singapura",
  KUL: "Kuala Lumpur",
  BKK: "Bangkok",
  DMK: "Bangkok",
  HKT: "Phuket",
  CNX: "Chiang Mai",
  USM: "Koh Samui",
  DPS: "Bali",
  CGK: "Jacarta",
  SUB: "Surabaia",
  HAN: "Hanói",
  SGN: "Ho Chi Minh",
  DAD: "Da Nang",
  PNH: "Phnom Penh",
  REP: "Siem Reap",
  MNL: "Manila",
  CEB: "Cebu",
  BOM: "Mumbai",
  DEL: "Nova Déli",
  BLR: "Bangalore",
  GOI: "Goa",
  MAA: "Chennai",
  CCU: "Calcutá",
  CMB: "Colombo",
  MLE: "Maldivas",
  KTM: "Katmandu",
  // ── Oceania ───────────────────────────────────────────────────────────────
  SYD: "Sydney",
  MEL: "Melbourne",
  BNE: "Brisbane",
  PER: "Perth",
  CNS: "Cairns",
  AKL: "Auckland",
  CHC: "Christchurch",
  WLG: "Wellington",
  PPT: "Taiti",
  FAA: "Taiti",
  NOU: "Nova Caledônia",
};

function airportCodeToCity(code: string): string | undefined {
  return AIRPORT_MAP[code];
}

// ─── Utilities ───

/** Strips star/rating symbols and non-printable characters from hotel names */
function cleanHotelName(name: string): string {
  return name
    // All Unicode symbol/emoji blocks
    .replace(/[^\u0020-\u024F\u1E00-\u1EFF]/g, "")
    // ASCII asterisks used as ratings
    .replace(/(\s*\*+)+/g, "")
    // Trailing punctuation and excess whitespace
    .replace(/[,;.]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractField(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) return match[1].trim();
  }
  return undefined;
}

function extractDestinationFromAirport(text: string): string | undefined {
  const airportMap = AIRPORT_MAP;

  // Extract only the "Ida" section (before "Volta") to avoid picking up origin
  const idaSection = text.match(/\bIda\b([\s\S]*?)(?:\bVolta\b)/i)?.[1] ?? text;

  // Find all "HH:MM CODE" patterns in the Ida section — last arrival is the destination
  const timeCodeRe = /\d{1,2}:\d{2}\s+([A-Z]{3})\b/g;
  let last: string | undefined;
  let m: RegExpExecArray | null;
  while ((m = timeCodeRe.exec(idaSection)) !== null) {
    if (airportMap[m[1]]) last = m[1];
  }
  if (last) return airportMap[last];

  return undefined;
}

function normalizeDestino(d: string): string {
  const map: Record<string, string> = {
    // English → Portuguese
    cancun: "Cancún",
    "punta cana": "Punta Cana", puntacana: "Punta Cana",
    "riviera maya": "Riviera Maya",
    havana: "Havana",
    varadero: "Varadero",
    jamaica: "Jamaica",
    "montego bay": "Montego Bay",
    aruba: "Aruba",
    curacao: "Curaçao", curaçao: "Curaçao",
    "sint maarten": "Sint Maarten", "st. maarten": "Sint Maarten", "st maarten": "Sint Maarten",
    barbados: "Barbados",
    bahamas: "Bahamas",
    "buenos aires": "Buenos Aires",
    bariloche: "Bariloche",
    mendoza: "Mendoza",
    "punta del este": "Punta del Este",
    montevideo: "Montevidéu", montevideu: "Montevidéu",
    assuncao: "Assunção", asuncion: "Assunção",
    bogota: "Bogotá",
    medellin: "Medellín", "medellín": "Medellín",
    cartagena: "Cartagena",
    "san andres": "San Andrés", "san andrés": "San Andrés",
    lima: "Lima",
    cusco: "Cusco", cuzco: "Cusco",
    "machu picchu": "Machu Picchu",
    quito: "Quito",
    galapagos: "Galápagos", galápagos: "Galápagos",
    santiago: "Santiago",
    "punta arenas": "Punta Arenas",
    "isla de pascua": "Ilha de Páscoa", "easter island": "Ilha de Páscoa",
    "ciudad de panama": "Cidade do Panamá", panama: "Cidade do Panamá",
    "costa rica": "Costa Rica",
    "isla margarita": "Isla Margarita",
    miami: "Miami",
    orlando: "Orlando",
    "new york": "Nova York", "nova york": "Nova York",
    "los angeles": "Los Angeles",
    "las vegas": "Las Vegas",
    "san francisco": "San Francisco",
    chicago: "Chicago",
    "washington dc": "Washington D.C.", "washington d.c.": "Washington D.C.",
    hawaii: "Havaí", havaí: "Havaí",
    toronto: "Toronto",
    vancouver: "Vancouver",
    lisbon: "Lisboa", lisboa: "Lisboa",
    "algarve": "Algarve",
    madeira: "Madeira",
    azores: "Açores", açores: "Açores",
    madrid: "Madrid",
    barcelona: "Barcelona",
    ibiza: "Ibiza",
    seville: "Sevilha", sevilla: "Sevilha",
    mallorca: "Palma de Mallorca", "palma de mallorca": "Palma de Mallorca",
    tenerife: "Tenerife",
    "gran canaria": "Gran Canária", "gran canária": "Gran Canária",
    lanzarote: "Lanzarote",
    malaga: "Málaga",
    paris: "Paris",
    nice: "Nice",
    rome: "Roma", roma: "Roma",
    milan: "Milão",
    venice: "Veneza", venezia: "Veneza",
    florence: "Florença", firenze: "Florença",
    naples: "Nápoles", napoli: "Nápoles",
    sicily: "Sicília", sicília: "Sicília",
    london: "Londres",
    edinburgh: "Edimburgo",
    frankfurt: "Frankfurt",
    munich: "Munique", münchen: "Munique",
    berlin: "Berlim",
    amsterdam: "Amsterdã",
    zurich: "Zurique", zürich: "Zurique",
    geneva: "Genebra",
    vienna: "Viena", wien: "Viena",
    brussels: "Bruxelas",
    athens: "Atenas",
    santorini: "Santorini",
    mykonos: "Mykonos",
    rhodes: "Rodes",
    crete: "Creta", heraklion: "Heraklion",
    dubrovnik: "Dubrovnik",
    croatia: "Croácia",
    prague: "Praga",
    budapest: "Budapeste",
    warsaw: "Varsóvia",
    krakow: "Cracóvia",
    istanbul: "Istambul",
    antalya: "Antalya",
    bodrum: "Bodrum",
    moscow: "Moscou",
    "st. petersburg": "São Petersburgo", "saint petersburg": "São Petersburgo",
    stockholm: "Estocolmo",
    oslo: "Oslo",
    copenhagen: "Copenhague",
    helsinki: "Helsinque",
    reykjavik: "Reykjavik",
    dubai: "Dubai",
    "abu dhabi": "Abu Dhabi",
    doha: "Doha",
    "tel aviv": "Tel Aviv",
    cairo: "Cairo",
    hurghada: "Hurghada",
    marrakech: "Marrakech",
    casablanca: "Casablanca",
    johannesburg: "Joanesburgo",
    "cape town": "Cidade do Cabo",
    nairobi: "Nairóbi",
    zanzibar: "Zanzibar",
    seychelles: "Seychelles",
    mauritius: "Maurício",
    tokyo: "Tóquio", toquio: "Tóquio",
    osaka: "Osaka",
    kyoto: "Kyoto",
    seoul: "Seul",
    shanghai: "Xangai",
    beijing: "Pequim",
    "hong kong": "Hong Kong",
    singapore: "Singapura",
    "kuala lumpur": "Kuala Lumpur",
    bangkok: "Bangkok",
    phuket: "Phuket",
    "chiang mai": "Chiang Mai",
    "koh samui": "Koh Samui",
    bali: "Bali",
    jakarta: "Jacarta",
    hanoi: "Hanói", hanói: "Hanói",
    "ho chi minh": "Ho Chi Minh",
    "da nang": "Da Nang",
    "siem reap": "Siem Reap",
    manila: "Manila",
    mumbai: "Mumbai",
    "new delhi": "Nova Déli", delhi: "Nova Déli",
    goa: "Goa",
    maldives: "Maldivas", maldivas: "Maldivas",
    sydney: "Sydney",
    melbourne: "Melbourne",
    brisbane: "Brisbane",
    cairns: "Cairns",
    auckland: "Auckland",
    tahiti: "Taiti",
    // Handle "Costa Mujeres" — redirect to same destination tag as Cancún area
    "costa mujeres": "Costa Mujeres",
  };
  return map[d.toLowerCase()] ?? d;
}

function parseMoneyToNumber(str: string): number {
  const num = parseFloat(str.replace(/[^\d,]/g, "").replace(",", "."));
  return isNaN(num) ? 0 : num;
}

function formatMoney(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
