export type Papel = 'master' | 'caf' | 'tesoureiro' | 'leitura' | 'registos';
export type Nivel = 'publico' | 'privado' | 'confidencial';
export type Origem = 'contribuir' | 'depositos' | 'despesas' | 'assistencia';

export const NIVEIS: Nivel[] = ['publico', 'privado', 'confidencial'];
export const NIVEL_LABEL: Record<Nivel, string> = { publico: 'Público', privado: 'Privado', confidencial: 'Confidencial' };
export const PAPEL_LABEL: Record<Papel, string> = { master: 'Master', caf: 'CAF', tesoureiro: 'Tesoureiro', leitura: 'Leitura', registos: 'Registos' };
export const nivelNum = (n: Nivel) => NIVEIS.indexOf(n);

// Contas Master fixas (iguais às das regras de segurança).
export const MASTER_EMAILS = ['tesouraria@cclx.pt', 'ricardoribeiro9@gmail.com', 'ricardoribeiro9@googlemail.com'];

export interface Perfil {
  email: string;
  nome?: string;
  papel: Papel;
  nivel: Nivel;
  comunidades: string[]; // ['*'] = todas
  ativo: boolean;
}

export interface Comunidade {
  id: string;
  nome: string;
  inicio?: string | null; // YYYY-MM-DD
  fim?: string | null;
  ordem: number;
  especial?: boolean; // bolsa geral
  ativo?: boolean; // false = desativada (mantém o histórico)
  /** Comunidade que fica com esta depois do fim (fusão): custos, registos e assistência passam para ela. */
  sucessora?: string;
}

/** Dimensões do plano financeiro usadas na classificação dos extratos e dos custos fixos. */
export interface Dimensao {
  id: string;
  tipo: 'centro' | 'projeto' | 'fornecedor' | 'conta';
  nome: string;
  /** Centros de custo: CC01…; opcional nos outros. */
  codigo?: string;
  /** Centros de custo: Central, Local, Ministério… */
  ambito?: string;
  /** Contas analíticas: código da categoria a que pertencem. */
  categoria?: string;
  ativo?: boolean;
}

export interface Conta {
  id: string;
  nome: string;
  banco: string;
  tipo: 'principal' | 'investimentos' | 'corrente';
  iban?: string;
  etiqueta?: string;
  ativo?: boolean;
  /** Logótipo (imagem pequena, data URL) mostrado nos extratos e filtros. */
  logo?: string;
  /** Colunas do extrato desta conta (aplicadas sozinhas ao importar). */
  mapa?: { data?: string; descricao?: string; valor?: string; debito?: string; credito?: string; saldo?: string; estorno?: string };
  mapaColunas?: string[];
}

export interface Categoria {
  id: string;
  nome: string;
  /** financeiro: depósitos, transferências internas, empréstimos, adiantamentos; não entra nos resultados. */
  tipo: 'entrada' | 'saida' | 'financeiro';
  /** Código do plano financeiro (ex.: 02.03). */
  codigo?: string;
  /** Outros nomes que correspondem a esta categoria (ex.: categorias do Jotform). */
  sinonimos?: string[];
  atividade: string;
  nivel: Nivel;
  snc?: string;
  origem?: string; // jotform, portal
  ativo?: boolean;
  /** Rubrica da demonstração de resultados (ver lib/rubricas.ts). */
  rubrica?: string;
  /** local: fica na comunidade; geral: reparte-se pela média de jovens e adultos dos últimos 12 meses. */
  ambito?: 'local' | 'geral';
}

/** Um registo individual dentro de um lote mensal. */
export interface Registo {
  id: string;
  data: string; // YYYY-MM-DD
  valor: number;
  categoria: string;
  descricao?: string;
  evento?: string;
  // Só no nível confidencial:
  pessoa?: string;
  nif?: string;
  email?: string;
  telefone?: string;
  iban?: string;
  // Nos dois níveis:
  pessoaRef?: string;
  extra?: Record<string, string | number>;
}

export interface Lote {
  id: string;
  origem: Origem;
  ano: number;
  mes: number;
  periodo: string; // YYYY-MM
  comunidadeId: string;
  registos: Registo[];
  total: number;
  n: number;
  atualizadoEm: string;
  atualizadoPor: string;
  /** Assistência: ids de registos vindos do Jotform apagados no portal (a sincronização não os volta a importar). */
  apagados?: string[];
}

export interface MovBanco {
  id: string;
  data: string;
  descricao: string;
  valor: number; // + crédito, - débito
  saldo?: number | null;
  /** Posição cronológica no extrato (para saber o saldo mais recente dentro do mesmo dia). */
  ordem?: number;
  /** Movimento de estorno (CGD: coluna "Estorno" = E). */
  estorno?: boolean;
  categoria?: string;
  comunidadeId?: string; // 'bolsa-geral' para ofertas sem comunidade
  contabilizar: boolean;
  conciliadoCom?: string | null;
  sugestao?: string | null;
  /** Classificação com o plano financeiro. */
  estado?: EstadoMov;
  /** Motivo do estado (ex.: REVER - Dados inconsistentes) ou origem da proposta. */
  nota?: string;
  contaAnalitica?: string;
  fornecedor?: string;
  centroCusto?: string;
  projeto?: string;
  /** Documento de suporte (ex.: FT 123). */
  documento?: string;
  /** Repartição do movimento por comunidades (a soma dos valores é o valor do movimento). */
  partes?: ParteMov[];
}

export type EstadoMov = 'por-classificar' | 'proposto' | 'validado' | 'rever';
/** Parte de um movimento repartido ou itemizado (uma linha com categoria, comunidade e valor próprios). */
export interface ParteMov {
  comunidadeId: string;
  valor: number;
  centroCusto?: string;
  /** Categoria desta linha; sem ela, vale a do movimento. */
  categoria?: string;
  descricao?: string;
  fornecedor?: string;
  projeto?: string;
  /** Definido ao validar: false se a linha é financeira (não conta nos resultados). */
  contabilizar?: boolean;
  /** Linha em percentagem (do que sobra depois das linhas de valor fixo); sem ela, o valor é fixo. */
  pct?: number;
}

export interface BancoLote {
  id: string;
  contaId: string;
  ano: number;
  mes: number;
  periodo: string;
  registos: MovBanco[];
  atualizadoEm: string;
  atualizadoPor: string;
}

export interface CustoFixo {
  id: string;
  comunidadeId: string;
  rubrica: string;
  /** Valor total mensal do custo (antes da incidência). */
  valorMensal: number;
  /** Parte do custo imputada a esta comunidade, em % (por omissão 100). Para custos partilhados. */
  incidencia?: number;
  /** "geral": custo partilhado por toda a CCLX, repartido pelas comunidades conforme a assistência. Por omissão, local. */
  ambito?: 'local' | 'geral';
  /** Categoria do plano financeiro (nome, ex.: "02.01 Rendas e condomínios"). Sem ela, a rubrica classifica pelo nome. */
  categoria?: string;
  /** Dimensões do plano financeiro (nomes ou códigos das dimensões configuradas). */
  contaAnalitica?: string;
  fornecedor?: string;
  centroCusto?: string;
  projeto?: string;
  /** Ano a que a linha pertence; início e fim são meses desse ano. Linhas antigas sem ano usam o ano do início. */
  ano?: number;
  inicio: string; // YYYY-MM
  fim: string | null;
  nivel: Nivel;
  notas?: string;
  /** Periodicidade: a cada N meses, anos ou dias (sem ela, todos os meses). Com ela, valorMensal é o valor de cada vez. */
  periodicidade?: { cada: number; unidade: 'meses' | 'anos' | 'dias' };
  /** Data da primeira ocorrência (AAAA-MM-DD), para a periodicidade. Sem ela, o início. */
  desde?: string;
}

export interface ResumoMes {
  mes: number;
  contribuir: number;
  coletas: number;
  transferencias: number;
  quotaBolsa: number;
  entradas: number;
  custosFixos: number;
  despesas: number;
  saidas: number;
  saldo: number;
  adultosMedia: number | null;
  entradasPorCategoria: Record<string, number>;
  despesasPorCategoria: Record<string, number>;
  custosRubricas: Record<string, number>; // só rubricas não confidenciais
  n: { contribuir: number; coletas: number; transferencias: number; despesas: number };
  /** Demonstração de resultados por rubrica: local (registado aqui, inclui quota da bolsa) e geral (parte recebida dos gerais). */
  rubricas: { entrada: Record<string, ParteRubrica>; saida: Record<string, ParteRubrica> };
  /** Parte recebida dos custos e proveitos gerais. */
  geralEntradas: number;
  geralSaidas: number;
  /** Peso desta comunidade na repartição dos gerais neste mês (0 a 1). */
  pesoGeral: number | null;
  /** Média de jovens e adultos por registo nos 12 meses até este mês. */
  adultosMedia12m: number | null;
  /** O que foi registado aqui em categorias gerais e saiu para a repartição. */
  cedidoGeral: { entradas: number; custosFixos: number; despesas: number };
  /** Mês aberto: valores provisórios (registos já feitos e previsão dos custos fixos por pagar). */
  previsao?: boolean;
  /** Custos fixos previstos da comunidade no mês (tabela, mesmo com o mês fechado). */
  cfPrevisto?: number;
  /** Parte dos custos fixos gerais previstos no mês, repartida pela média proporcional de assistência. */
  cfGeralPrevisto?: number;
}

export interface ParteRubrica { local: number; geral: number }

export interface Resumo {
  id: string;
  ano: number;
  comunidadeId: string;
  meses: ResumoMes[];
  calculadoEm: string;
  calculadoPor: string;
}

export interface PublicoMes {
  mes: number;
  entradas: number | null;
  custosFuncionamento: number | null;
  outrasDespesas: number | null;
  saldo: number | null;
}

/** Contas públicas por comunidade (publico_sites/{ano}): só com login. */
export interface Publico {
  ano: number;
  comunidades: { id: string; nome: string; meses: PublicoMes[] }[];
  mesesFechados: number[];
  atualizadoEm: string;
}

/** Contas públicas do site CCLX, consolidado (publico/{ano}): abertas, sem login. Sem dados por comunidade. */
export interface PublicoSite {
  ano: number;
  site: { nome: string; meses: PublicoMes[] };
  mesesFechados: number[];
  atualizadoEm: string;
}

export interface LinhaOrcamento {
  comunidadeId: string;
  grupo: 'entradas' | 'custosFixos' | 'despesas';
  categoria: string;
  anual: number;
}

export interface Orcamento {
  ano: number;
  estado: 'rascunho' | 'aprovado';
  versao: number;
  linhas: LinhaOrcamento[];
  base: string;
  atualizadoEm: string;
  atualizadoPor: string;
  aprovadoEm?: string;
  aprovadoPor?: string;
}

export interface Fecho {
  periodo: string;
  estado: 'fechado' | 'aberto';
  por: string;
  em: string;
}

/** Fotografia de um mês fechado para uma comunidade (fotos_fecho/{periodo}_{comunidadeId}): os dados do fecho. */
export interface FotoFecho {
  id: string;
  periodo: string;
  ano: number;
  mes: number;
  comunidadeId: string;
  dados: ResumoMes;
  em: string;
  por: string;
}

/** Domingo em que não é esperada assistência (ex.: culto conjunto, retiro). */
export interface ExcecaoAssistencia {
  id: string;
  data: string; // AAAA-MM-DD (qualquer dia com eventos obrigatórios)
  ambito: 'cclx' | string; // 'cclx' = toda a organização; senão, o id da comunidade
  motivo: string;
  criadoPor: string;
  criadoEm: string;
}

/** Configuração da assistência (config/assistencia). */
export interface ConfigAssistencia {
  /** Tipo de evento (campo "Evento" do Registo de Presenças) que conta como celebração de domingo. */
  eventoCelebracao: string | null;
  /** Tipos de evento disponíveis no formulário de presenças do portal (por omissão, os do Jotform). */
  eventos?: string[];
  /** Eventos configurados (nome, descrição, contagens, dias, horário). Sem isto, derivam de `eventos`. */
  eventosConfig?: import('./eventos').EventoConfig[];
  /** Contagens acrescentadas às base (adultos, jump, crianças, connects). */
  contagens?: import('./eventos').Contagem[];
  atualizadoPor?: string;
  atualizadoEm?: string;
}
