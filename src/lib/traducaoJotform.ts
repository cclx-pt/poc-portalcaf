/**
 * Tradução das categorias do Jotform (não uniformes: "Dízimo", "Dizimo", "Oferta", "Missões"…) para as categorias CAF.
 * O portal só trabalha com categorias CAF: a tradução aplica-se ao ler os dados (os lotes guardam o valor original
 * do Jotform, que não é alterado). Uma tabela por formulário, editável em Configuração › Jotform e sincronização.
 */
import { classificador } from './rubricas';
import { norm } from './format';
import type { Categoria, Lote } from './types';

export type OrigemJotform = 'contribuir' | 'depositos' | 'despesas';
export const ORIGENS_JOTFORM: OrigemJotform[] = ['contribuir', 'depositos', 'despesas'];
export const NOME_ORIGEM: Record<OrigemJotform, string> = { contribuir: 'Contribuir', depositos: 'Depósitos de coletas', despesas: 'Reembolsos e despesas' };
/** Regra direta: no formulário `origem`, se a categoria do Jotform é (ou contém) `valor`, a categoria CAF é `codigo`. */
export interface LinhaTraducao { origem: OrigemJotform; valor: string; codigo: string; modo?: 'igual' | 'contem' }
export interface TraducaoJotform { linhas: LinhaTraducao[]; atualizadoEm?: string; atualizadoPor?: string }
export const POR_TRADUZIR = 'Por traduzir';

/** Tipo de categoria de cada formulário: entradas (Contribuir, depósitos) ou gastos (despesas). */
const tipoDe = (o: OrigemJotform): Categoria['tipo'] => (o === 'despesas' ? 'saida' : 'entrada');
const chave = (s: string) => norm(s).replace(/[^a-z0-9]+/g, ' ').trim();

export interface Traducao { categoria: string | null; fonte: 'regra' | 'caf' | null; regra?: LinhaTraducao }

/**
 * Tradutor só com regras escritas: 1) regra "igual" (sem maiúsculas nem acentos); 2) regra "contém" (a mais longa);
 * 3) um valor que já é o nome de uma categoria CAF (ex.: registos IFTHENPAY do portal); 4) nada: por traduzir.
 */
export function tradutorJotform(t: TraducaoJotform | null | undefined, categorias: Categoria[]) {
  const porCodigo = new Map(categorias.filter((c) => c.codigo).map((c) => [c.codigo!, c]));
  const nomes = new Map(categorias.filter((c) => c.codigo).map((c) => [chave(c.nome), c]));
  const regras = (t?.linhas ?? []).filter((l) => porCodigo.has(l.codigo) && chave(l.valor));
  const iguais = new Map(regras.filter((l) => (l.modo ?? 'igual') === 'igual').map((l) => [`${l.origem}|${chave(l.valor)}`, l]));
  const contem = regras.filter((l) => l.modo === 'contem').sort((a, b) => chave(b.valor).length - chave(a.valor).length);
  const cache = new Map<string, Traducao>();
  return (origem: OrigemJotform, valor: string): Traducao => {
    const k = `${origem}|${chave(valor)}`;
    if (cache.has(k)) return cache.get(k)!;
    const v = ` ${chave(valor)} `;
    const regra = iguais.get(k) ?? contem.find((l) => l.origem === origem && v.includes(` ${chave(l.valor)} `));
    const caf = nomes.get(chave(valor));
    const r: Traducao = regra ? { categoria: porCodigo.get(regra.codigo)!.nome, fonte: 'regra', regra } : caf ? { categoria: caf.nome, fonte: 'caf' } : { categoria: null, fonte: null };
    cache.set(k, r);
    return r;
  };
}

/** Sugestão para escrever uma regra (pelos sinónimos das categorias, do tipo do formulário). Nunca se aplica sozinha. */
export function sugestaoRegra(origem: OrigemJotform, valor: string, categorias: Categoria[]): Categoria | null {
  const c = classificador(categorias)(valor, tipoDe(origem));
  const cat = categorias.find((x) => x.codigo && x.nome === c.categoria);
  return cat && cat.tipo === tipoDe(origem) ? cat : null;
}

/** Lotes com as categorias CAF (o valor do Jotform fica em extra.categoriaJotform). */
export function traduzirLotes(lotes: Lote[], origem: OrigemJotform, tr: ReturnType<typeof tradutorJotform>): Lote[] {
  return lotes.map((l) => ({
    ...l, registos: l.registos.map((r) => {
      const original = r.categoria ?? '';
      const { categoria } = tr(origem, original);
      if (categoria === original) return r;
      return { ...r, categoria: categoria ?? `${POR_TRADUZIR}: ${original || 'sem categoria'}`, extra: { ...(r.extra ?? {}), categoriaJotform: original } };
    }),
  }));
}

export interface ValorJotform { origem: OrigemJotform; valor: string; n: number; total: number }
/** Valores de categoria usados nos registos do Jotform, por formulário (iguais sem maiúsculas e acentos juntam-se). */
export function valoresJotform(lotes: Partial<Record<OrigemJotform, Lote[]>>): ValorJotform[] {
  const out = new Map<string, ValorJotform>();
  for (const o of ORIGENS_JOTFORM) for (const l of lotes[o] ?? []) for (const r of l.registos) {
    if (r.id.startsWith('portal-')) continue; // registos do portal (ex.: IFTHENPAY) já têm categoria CAF
    const valor = (r.categoria ?? '').trim();
    if (!valor) continue;
    const k = `${o}|${chave(valor)}`;
    const x = out.get(k) ?? { origem: o, valor, n: 0, total: 0 };
    out.set(k, { ...x, n: x.n + 1, total: Math.round((x.total + r.valor) * 100) / 100 });
  }
  return [...out.values()].sort((a, b) => ORIGENS_JOTFORM.indexOf(a.origem) - ORIGENS_JOTFORM.indexOf(b.origem) || b.total - a.total);
}
