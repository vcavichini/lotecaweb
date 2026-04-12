export type PrizeTier = {
  descricaoFaixa: string;
  numeroDeGanhadores: number;
  valorPremio: number;
};

export type ContestData = {
  numero: number;
  dataApuracao: string;
  listaDezenas: string[];
  listaRateioPremio: PrizeTier[];
  acumulado: boolean;
  dataProximoConcurso: string | null;
  valorEstimadoProximoConcurso: number;
};

export type BetsConfig = {
  permanent: string[][];
  one_off: Record<string, string[][]>;
};
