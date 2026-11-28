/**
 * Mudar o nome de uma categoria (Configuração). O código e o tipo não mudam. Os dados que guardam o nome
 * (movimentos dos meses abertos, custos fixos, regras dos extratos, orçamentos) passam para o nome novo; o nome antigo
 * fica em `nomesAnteriores`, para os meses fechados (que não se alteram) contarem na mesma categoria.
 */
import type { RegraBanco } from './classificacaoBanco';
import type { BancoLote, Categoria, CustoFixo, Orcamento } from './types';

const limpar = (s: string) => s.replace(/\s+/g, ' ').trim();
const chave = (s: string) => limpar(s).toLowerCase();

/** Erro do novo nome, ou null: tem de ter texto além do código, começar pelo código e não repetir outra categoria. */
export function validarNovoNome(c: Categoria, novo: string, todas: Categoria[]): string | null {
  const n = limpar(novo);
  if (!n || (c.codigo && n === c.codigo)) return 'Indique o nome.';
  if (c.codigo && !n.startsWith(`${c.codigo} `)) return `O nome tem de começar pelo código "${c.codigo}" (ex.: "${c.codigo} ${limpar(c.nome).slice(c.codigo.length + 1) || 'Nome'}").`;
  if (todas.some((x) => x.id !== c.id && (chave(x.nome) === chave(n) || (x.nomesAnteriores ?? []).some((a) => chave(a) === chave(n))))) return 'Já existe uma categoria com este nome.';
  return null;
}

/** Nome antigo → nome atual, de todas as categorias que já mudaram de nome. */
export function mapaNomesCategorias(categorias: Pick<Categoria, 'nome' | 'nomesAnteriores'>[]): Map<string, string> {
  return new Map(categorias.flatMap((c) => (c.nomesAnteriores ?? []).filter((a) => a !== c.nome).map((a) => [a, c.nome] as const)));
}

const troca = (v: string | undefined, antigo: string, novo: string) => (v === antigo ? novo : v);

/** Lotes de extratos com a categoria trocada (no movimento e nas linhas divididas); só os que mudam. */
export function renomearEmLotesBanco(lotes: BancoLote[], antigo: string, novo: string): BancoLote[] {
  const out: BancoLote[] = [];
  for (const l of lotes) {
    let mudou = false;
    const registos = l.registos.map((r) => {
      const usa = r.categoria === antigo || (r.partes ?? []).some((p) => p.categoria === antigo);
      if (!usa) return r;
      mudou = true;
      return { ...r, ...(r.categoria === antigo ? { categoria: novo } : {}), ...(r.partes ? { partes: r.partes.map((p) => ({ ...p, categoria: troca(p.categoria, antigo, novo) })) } : {}) };
    });
    if (mudou) out.push({ ...l, registos });
  }
  return out;
}

/** Custos fixos com a categoria trocada; só os que mudam. */
export const renomearEmCustos = (cs: CustoFixo[], antigo: string, novo: string): CustoFixo[] =>
  cs.filter((c) => c.categoria === antigo).map((c) => ({ ...c, categoria: novo }));

/** Regras dos extratos com a categoria trocada (na regra e nas suas linhas); só as que mudam. */
export const renomearEmRegras = (rs: RegraBanco[], antigo: string, novo: string): RegraBanco[] =>
  rs.filter((r) => r.categoria === antigo || (r.partes ?? []).some((p) => p.categoria === antigo))
    .map((r) => ({ ...r, categoria: troca(r.categoria, antigo, novo)!, ...(r.partes ? { partes: r.partes.map((p) => ({ ...p, categoria: troca(p.categoria, antigo, novo) })) } : {}) }));

/** Orçamentos com a categoria trocada nas linhas; só os que mudam. */
export const renomearEmOrcamento = (os: Orcamento[], antigo: string, novo: string): Orcamento[] =>
  os.filter((o) => o.linhas.some((l) => l.categoria === antigo)).map((o) => ({ ...o, linhas: o.linhas.map((l) => ({ ...l, categoria: troca(l.categoria, antigo, novo)! })) }));
