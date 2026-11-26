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
export interface LinhaTraducao { origem: OrigemJotform; valor: string; codigo: string }
export interface TraducaoJotform { linhas: LinhaTraducao[]; atualizadoEm?: string; atualizadoPor?: string }
export const POR_TRADUZIR = 'Por traduzir';

/** Tipo de categoria de cada formulário: entradas (Contribuir, depósitos) ou gastos (despesas). */
const tipoDe = (o: OrigemJotform): Categoria['tipo'] => (o === 'despesas' ? 'saida' : 'entrada');
const chave = (s: string) => norm(s).replace(/[^a-z0-9]+/g, ' ').trim();

export interface Traducao { categoria: string | null; fonte: 'tabela' | 'caf' | 'automatica' | null }

/**
 * Tradutor: 1) a tabela; 2) um valor que já é o nome de uma categoria CAF; 3) proposta automática pelos sinónimos
 * das categorias (só categorias do plano, do tipo do formulário); 4) nada (por traduzir).
 */
export function tradutorJotform(t: TraducaoJotform | null | undefined, categorias: Categoria[]) {
  const porCodigo = new Map(categorias.filter((c) => c.codigo).map((c) => [c.codigo!, c]));
  const nomes = new Map(categorias.filter((c) => c.codigo).map((c) => [chave(c.nome), c]));
  const tabela = new Map((t?.linhas ?? []).map((l) => [`${l.origem}|${chave(l.valor)}`, l.codigo]));
  const classificar = classificador(categorias);
  const cache = new Map<string, Traducao>();
  return (origem: OrigemJotform, valor: string): Traducao => {
    const k = `${origem}|${chave(valor)}`;
    if (cache.has(k)) return cache.get(k)!;
    let r: Traducao = { categoria: null, fonte: null };
    const daTabela = tabela.get(k);
    const caf = nomes.get(chave(valor));
    if (daTabela && porCodigo.has(daTabela)) r = { categoria: porCodigo.get(daTabela)!.nome, fonte: 'tabela' };
    else if (caf) r = { categoria: caf.nome, fonte: 'caf' };
    else if (valor.trim()) {
      const c = classificar(valor, tipoDe(origem));
      const cat = nomes.get(chave(c.categoria));
      if (cat && cat.tipo === tipoDe(origem)) r = { categoria: cat.nome, fonte: 'automatica' };
    }
    cache.set(k, r);
    return r;
  };
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

/** Proposta para os valores sem linha na tabela (e que não são já categorias CAF): a correspondência automática. */
export function propostaTraducao(valores: ValorJotform[], t: TraducaoJotform, categorias: Categoria[]): LinhaTraducao[] {
  const tr = tradutorJotform({ linhas: [] }, categorias);
  const tem = new Set(t.linhas.map((l) => `${l.origem}|${chave(l.valor)}`));
  const codigo = new Map(categorias.filter((c) => c.codigo).map((c) => [c.nome, c.codigo!]));
  return valores.filter((v) => !tem.has(`${v.origem}|${chave(v.valor)}`)).flatMap((v) => {
    const r = tr(v.origem, v.valor);
    return r.fonte === 'automatica' && r.categoria ? [{ origem: v.origem, valor: v.valor, codigo: codigo.get(r.categoria)! }] : [];
  });
}
