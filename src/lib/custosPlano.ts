/** Classificação dos custos fixos com o plano financeiro (categoria, fornecedor, centro de custo). */
import { norm } from './format';
import type { Categoria, CustoFixo } from './types';

export interface ClassificacaoCusto { categoria?: string; fornecedor?: string; centroCusto?: string }

/** Regras por palavra-chave na rubrica atual: código da categoria e centro de custo. A primeira que corresponde fica. */
const REGRAS: [RegExp, string, string][] = [
  [/seguranca social|\btsu\b/, '01.02', 'CC03'],
  [/vencimento|ordenado|salario/, '01.01', 'CC03'],
  [/estipendio/, '07.04', 'CC11'],
  [/missao|missoes|missionari/, '07.01', 'CC11'],
  [/imposto/, '02.08', 'CC02'],
  [/deslocac|plafond|quilometr|\bkms?\b/, '01.05', 'CC03'],
  [/renda|condominio|garage/, '02.01', 'CC02'],
  [/luz|eletricidade|energia|agua|edp|endesa|iberdrola/, '02.02', 'CC02'],
  [/comunicac|internet|telefone|telemovel|\bmeo\b|vodafone|\bnos\b/, '02.03', 'CC02'],
  [/limpeza|praga|anticimex|desinfest|higiene/, '02.04', 'CC02'],
  [/alarme|prosegur|securitas|seguro|vigilancia/, '02.06', 'CC02'],
  [/manutenc|extintor|inspec|elevador/, '02.05', 'CC02'],
  [/contabil|assessoria/, '03.01', 'CC01'],
  [/software|subscric|google|zoom|hostinger|inchurch|dropbox|licenca/, '03.04', 'CC01'],
];

/** Fornecedor entre parênteses na rubrica, ex.: "Alarme (Prosegur)" → Prosegur. */
const NAO_FORNECEDOR = /^(donativo|oferta|partilhado|geral)$/i;
const fornecedorDe = (rubrica: string) => { const f = rubrica.match(/\(([^)]+)\)\s*$/)?.[1].trim(); return f && !NAO_FORNECEDOR.test(f) ? f : undefined; };

/** Propõe a classificação de um custo fixo pela rubrica atual. Só propõe categorias que existem no catálogo. */
export function proporClassificacaoCusto(rubrica: string, categorias: Categoria[]): ClassificacaoCusto {
  const n = norm(rubrica);
  const regra = REGRAS.find(([re]) => re.test(n));
  const cat = regra && categorias.find((c) => c.codigo === regra[1] && c.ativo !== false);
  if (!cat || !regra) return {};
  const fornecedor = fornecedorDe(rubrica);
  return { categoria: cat.nome, ...(fornecedor ? { fornecedor } : {}), centroCusto: regra[2] };
}

/** Propostas para as linhas ainda sem categoria do plano. */
export function propostasCustos(custos: CustoFixo[], categorias: Categoria[]) {
  return custos.filter((c) => !c.categoria).map((c) => ({ custo: c, proposta: proporClassificacaoCusto(c.rubrica, categorias) }));
}
