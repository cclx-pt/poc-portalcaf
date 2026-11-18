import { r2 } from './format';
import { comunidadeAtiva } from './resumos';
import type { Comunidade, CustoFixo } from './types';

/** Ano da linha: o campo ano ou, nas linhas antigas, o ano do início. */
export const anoDoCusto = (c: CustoFixo) => c.ano ?? Number(c.inicio.slice(0, 4));

const slug = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const mesPT = (p: string) => p.split('-').reverse().join('/');

export interface OpcoesCopia {
  origem: number;
  destino: number;
  /** Atualização dos valores, em % (0 = mesmos valores). */
  atualizacao: number;
  /** Comunidades a copiar; null = todas. */
  comunidades: string[] | null;
}

/**
 * Gera as linhas do ano de destino a partir do ano de origem.
 * Por comunidade e rubrica copia a linha mais recente, como linha de janeiro a dezembro do destino.
 * Não copia linhas que terminaram antes de dezembro nem comunidades sem nenhum mês ativo no destino.
 */
export function copiarAno(custos: CustoFixo[], o: OpcoesCopia, comunidades: Comunidade[]): { novos: CustoFixo[]; avisos: string[] } {
  if (o.origem === o.destino) throw new Error('O ano de destino tem de ser diferente do ano de origem.');
  const fator = 1 + (Number(o.atualizacao) || 0) / 100;
  const coms = new Map(comunidades.map((c) => [c.id, c]));
  const ativaNoDestino = (id: string) => {
    const c = coms.get(id);
    return !c || Array.from({ length: 12 }, (_, i) => `${o.destino}-${String(i + 1).padStart(2, '0')}`).some((p) => comunidadeAtiva(c, p));
  };
  const maisRecente = new Map<string, CustoFixo>();
  for (const c of custos) {
    if (anoDoCusto(c) !== o.origem) continue;
    if (o.comunidades && !o.comunidades.includes(c.comunidadeId)) continue;
    const k = `${c.comunidadeId}|${c.rubrica}`;
    const atual = maisRecente.get(k);
    if (!atual || (c.fim ?? '9999-99') > (atual.fim ?? '9999-99') || ((c.fim ?? '') === (atual.fim ?? '') && c.inicio > atual.inicio)) maisRecente.set(k, c);
  }
  const novos: CustoFixo[] = [];
  const avisos: string[] = [];
  const inativas = new Map<string, number>();
  const ids = new Set<string>();
  for (const c of maisRecente.values()) {
    if (!ativaNoDestino(c.comunidadeId)) { inativas.set(c.comunidadeId, (inativas.get(c.comunidadeId) ?? 0) + 1); continue; }
    if (c.fim && c.fim < `${o.origem}-12`) {
      avisos.push(`${coms.get(c.comunidadeId)?.nome ?? c.comunidadeId} · ${c.rubrica}: terminou em ${mesPT(c.fim)}; não foi copiada.`);
      continue;
    }
    const base = `${c.comunidadeId}-${slug(c.rubrica)}`;
    let id = `${base}-${o.destino}`;
    for (let k = 2; ids.has(id); k++) id = `${base}-${k}-${o.destino}`;
    ids.add(id);
    const n: CustoFixo = { ...c, id, ano: o.destino, inicio: `${o.destino}-01`, fim: `${o.destino}-12`, valorMensal: r2(c.valorMensal * fator) };
    novos.push(n);
  }
  for (const [id, n] of inativas) avisos.push(`${coms.get(id)?.nome ?? id} não está ativa em ${o.destino}; ${n} ${n === 1 ? 'linha não foi copiada' : 'linhas não foram copiadas'}.`);
  return { novos, avisos };
}

/** Totais por rubrica (somando comunidades), do maior para o menor; além de `max` rubricas, o resto vai para "Outros". */
export function totaisPorRubrica(linhas: CustoFixo[], valor: (c: CustoFixo) => number, max = 12): { rubrica: string; valor: number }[] {
  const t = new Map<string, number>();
  for (const c of linhas) t.set(c.rubrica, (t.get(c.rubrica) ?? 0) + valor(c));
  const lista = [...t].map(([rubrica, v]) => ({ rubrica, valor: r2(v) })).filter((x) => x.valor > 0).sort((a, b) => b.valor - a.valor || a.rubrica.localeCompare(b.rubrica));
  if (lista.length <= max + 1) return lista;
  const resto = lista.slice(max);
  return [...lista.slice(0, max), { rubrica: `Outros (${resto.length} rubricas)`, valor: r2(resto.reduce((s, x) => s + x.valor, 0)) }];
}
