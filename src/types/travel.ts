export interface ReelsScene {
  cena: number;
  tipo: string;
  duracao: string;
  texto: string;
}

export interface MarketingContent {
  captionInstagram: string;
  captionWhatsApp: string;
  emailScript: string;
  reelsScript: ReelsScene[];
}

export interface TravelData {
  destino: string;
  hotel: string;
  quartoTipo?: string;
  precoTotal: string;
  precoPorPessoa: string;
  precoParcela: string;
  parcelas: number;
  precoAVista: string;
  numAdultos: number;
  duracao: string;
  regime: string;
  roteiro: string[];
  imageUrl?: string;
  videoSceneImageUrls?: string[];
  desconto?: string;
  dataInicio?: string;
  dataFim?: string;
  companhiaAerea?: string;
  bagagem?: string;
  origemVoo?: string;
  agencia?: string;
  inclui?: string[];
  condicoes?: string;
  tipoProduto?: string;
  campanha?: string;
  /** Multiple campaigns. `campanha` is kept as the first entry for back-compat. */
  campanhas?: string[];
  bloqueioAereo?: boolean;
  marketing?: MarketingContent;
  archiveSessionId?: string;
}

export interface VideoScene {
  cena: number;
  texto: string;
  duracao: string;
}

export const SAMPLE_DATA: TravelData = {
  destino: "Cancún",
  hotel: "Grand Palladium Select Costa Mujeres",
  quartoTipo: "Suite Júnior ao Lado da Piscina",
  precoTotal: "R$ 18.616,97",
  precoPorPessoa: "R$ 9.308,49",
  precoParcela: "R$ 930,85",
  parcelas: 10,
  precoAVista: "R$ 8.843,06",
  numAdultos: 2,
  duracao: "6 Noites",
  regime: "All Inclusive",
  roteiro: [
    "Chegada em Cancún e transfer ao hotel",
    "Dia livre – sugestão: Chichén Itzá",
    "Dia livre – sugestão: Isla Mujeres",
    "Dia livre no resort All Inclusive",
    "Dia livre no resort",
    "Transfer ao aeroporto e retorno",
  ],
  desconto: "5",
  dataInicio: "01/08/2026",
  dataFim: "07/08/2026",
  companhiaAerea: "LATAM",
  inclui: [
    "Aéreo CWB / CUN / CWB com LATAM em Classe Econômica",
    "Transfer de chegada e saída",
    "Seguro Viagem Universal Assistance 30K",
    "6 noites no Grand Palladium Select Costa Mujeres",
    "All Inclusive (Tudo Incluído)",
  ],
  tipoProduto: "Aéreo + Hotel",
  campanha: "Operação Caribe",
};
