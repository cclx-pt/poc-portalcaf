/** Rubricas da demonstração de resultados e classificação das categorias (âmbito local ou geral). */
import { norm } from './format';
import type { Categoria } from './types';

export const RUBRICAS_ENTRADA = ['Dízimos', 'Ofertas', 'Outras contribuições', 'Pagamentos (eventos, inscrições)', 'Outros rendimentos'] as const;
export const RUBRICAS_SAIDA = ['Vencimentos e encargos', 'Instalações', 'Consumíveis e funcionamento', 'Donativos e ofertas', 'Atividades e eventos', 'Outros gastos'] as const;
/** Rubrica onde entram, agregadas, as categorias de nível confidencial. */
export const OUTROS_FUNCIONAMENTO = 'Outros custos de funcionamento';

type Tipo = Categoria['tipo'];

const INICIAL: Record<'entrada' | 'saida', Record<string, string>> = {
  entrada: {
    dizimos: 'Dízimos', ofertas: 'Ofertas', 'coletas em dinheiro': 'Ofertas',
    missoes: 'Outras contribuicoes', 'acao social': 'Outras contribuicoes', obras: 'Outras contribuicoes',
    eventos: 'Pagamentos', 'outras entradas': 'Outros rendimentos',
  },
  saida: {
    vencimentos: 'Vencimentos e encargos', 'seguranca social': 'Vencimentos e encargos',
    renda: 'Instalações', luz: 'Instalações', agua: 'Instalações', internet: 'Instalações',
    'comissoes bancarias': 'Consumíveis e funcionamento',
    missoes: 'Donativos e ofertas', 'acao social': 'Donativos e ofertas',
    cultos: 'Atividades e eventos', jovens: 'Atividades e eventos', criancas: 'Atividades e eventos', eventos: 'Atividades e eventos',
    'outras despesas': 'Outros gastos',
  },
};
const POR_CHAVE: Record<string, string> = { 'Outras contribuicoes': 'Outras contribuições', Pagamentos: 'Pagamentos (eventos, inscrições)' };

/** Chave de comparação: sem acentos/maiúsculas e no plural simples ("Dízimo" ↔ "Dízimos"). */
function chave(nome: string) {
  const n = norm(nome);
  return n.endsWith('s') ? n : `${n}s`;
}

/** Rubrica proposta para uma categoria pelo nome (sem correspondência: "Outros rendimentos"/"Outros gastos"). */
export function rubricaInicial(nome: string, tipo: Tipo): string {
  if (tipo === 'financeiro') return 'Movimentos financeiros';
  const n = norm(nome);
  const t = INICIAL[tipo];
  const r = t[n] ?? t[chave(nome)] ?? Object.entries(t).find(([k]) => chave(k) === chave(nome))?.[1];
  if (!r) return tipo === 'entrada' ? 'Outros rendimentos' : 'Outros gastos';
  return POR_CHAVE[r] ?? r;
}

export interface Classificacao {
  rubrica: string;
  ambito: 'local' | 'geral';
  confidencial: boolean;
  /** Movimento financeiro (depósito, transferência interna…): não entra nos resultados. */
  financeiro: boolean;
  /** Nome da categoria configurada que correspondeu (sem correspondência: o nome recebido). */
  categoria: string;
}

/** Rubrica dos movimentos sem categoria correspondente, quando o plano financeiro está carregado. */
export const POR_CLASSIFICAR = 'Por classificar';

/** Nome sem o código do plano: "02.03 Comunicações" → "Comunicações". */
const semCodigo = (nome: string) => nome.replace(/^[A-Z]?\d+(\.\d+)?\s+/, '');

/** Devolve uma função que classifica um nome de categoria (do Jotform, banco ou custo fixo) pela lista configurada. */
export function classificador(categorias: Categoria[]): (nome: string, tipo: 'entrada' | 'saida' | 'financeiro') => Classificacao {
  const mapa = new Map<string, Categoria>();
  const ativas = categorias.filter((c) => c.ativo !== false);
  const plano = ativas.some((c) => c.codigo);
  // Prioridade: nome completo, depois nome sem código, depois sinónimos (os primeiros a chegar ficam).
  const pos = (tipo: string, nome: string, c: Categoria) => { const k = `${tipo}|${chave(nome)}`; if (!mapa.has(k)) mapa.set(k, c); };
  for (const c of ativas) pos(c.tipo, c.nome, c);
  for (const c of ativas) if (c.codigo) pos(c.tipo, semCodigo(c.nome), c);
  for (const c of ativas) for (const s of c.sinonimos ?? []) pos(c.tipo, s, c);
  // Categorias desativadas ainda classificam o histórico (sem entrar como sugestão).
  for (const c of categorias) if (c.ativo === false) pos(c.tipo, c.nome, c);
  return (nome, tipo) => {
    const c = mapa.get(`${tipo}|${chave(nome)}`) ?? (tipo !== 'financeiro' ? mapa.get(`financeiro|${chave(nome)}`) : undefined);
    const financeiro = c?.tipo === 'financeiro';
    return {
      rubrica: c?.rubrica || (plano ? POR_CLASSIFICAR : rubricaInicial(c?.nome ?? nome, tipo === 'entrada' ? 'entrada' : 'saida')),
      ambito: c?.ambito === 'geral' ? 'geral' : 'local',
      confidencial: c?.nivel === 'confidencial',
      financeiro,
      categoria: c?.nome ?? nome,
    };
  };
}

/**
 * Categorias usadas nos dados (resumos) que ainda não estão na lista configurada,
 * por exemplo as que vêm do Jotform. Sem duplicados (nome normalizado + tipo), ordenadas.
 */
export function categoriasEmFalta(
  categorias: Categoria[],
  meses: { entradasPorCategoria?: Record<string, number>; despesasPorCategoria?: Record<string, number> }[],
): { nome: string; tipo: Tipo }[] {
  const existe = new Set(categorias.flatMap((c) => [c.nome, semCodigo(c.nome), ...(c.sinonimos ?? [])].map((n) => `${c.tipo}|${chave(n)}`)));
  const out = new Map<string, { nome: string; tipo: Tipo }>();
  for (const m of meses) {
    for (const [tipo, o] of [['entrada', m.entradasPorCategoria], ['saida', m.despesasPorCategoria]] as const) {
      for (const nome of Object.keys(o ?? {})) {
        const k = `${tipo}|${chave(nome)}`;
        if (!existe.has(k) && !out.has(k)) out.set(k, { nome, tipo });
      }
    }
  }
  return [...out.values()].sort((a, b) => (a.tipo === b.tipo ? a.nome.localeCompare(b.nome, 'pt') : a.tipo === 'entrada' ? -1 : 1));
}
