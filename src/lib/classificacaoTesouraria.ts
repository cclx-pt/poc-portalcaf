/**
 * Classificação dos extratos feita pela tesouraria fora do portal (folha "Proposta" da análise de 26/11/2026),
 * aplicada como proposta aos movimentos do banco que o portal já tem. Não mexe em movimentos validados nem conciliados.
 */
import { categoriasDoPlano, CENTROS_CUSTO } from './plano';
import type { Tabela } from './ficheiros';
import type { Categoria, Comunidade, Dimensao, MovBanco, ParteMov } from './types';

const r2 = (v: number) => Math.round(v * 100) / 100;
const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const slug = (s: string) => norm(s).replace(/ /g, '-');

export interface LinhaTesouraria {
  data: string;
  descricao: string;
  valor: number;
  /** Código da categoria do plano (ex.: 02.01). */
  codigo: string;
  /** Nome da comunidade (como na folha). */
  comunidade: string;
  /** Código do centro de custo (ex.: CC02); vazio nos financeiros. */
  centro?: string;
  projeto?: string;
  fornecedor?: string;
  contaAnalitica?: string;
}

function dataIso(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}
const numero = (v: unknown) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/[€\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')));
const codigoDe = (s: unknown) => /^([0-9RF]\d?\.\d{2}|CC\d{2})\b/.exec(String(s ?? '').trim())?.[1] ?? '';

/** Lê a folha: fica só o que tem categoria, comunidade e confiança Alta ou Média, e não é tratado pelo portal por outra fonte. */
export function lerFolhaTesouraria(t: Tabela): { linhas: LinhaTesouraria[]; ignoradas: number; erro: string | null } {
  const col = (re: RegExp) => t.colunas.find((c) => re.test(norm(c)));
  const c = {
    data: col(/^data$/), desc: col(/^descricao/), valor: col(/^valor/), cat: col(/^categoria plano/), com: col(/^comunidade$/), cc: col(/^centro de custo/),
    proj: col(/^projeto/), forn: col(/^fornecedor/), conta: col(/^conta analitica/), trat: col(/^tratamento no portal/), conf: col(/^confianca/),
  };
  if (!c.data || !c.valor || !c.cat || !c.com) return { linhas: [], ignoradas: 0, erro: 'O ficheiro não tem a folha "Proposta" com as colunas Data, Valor, Categoria (plano) e Comunidade.' };
  const linhas: LinhaTesouraria[] = [];
  let ignoradas = 0;
  for (const l of t.linhas) {
    const data = dataIso(l[c.data]);
    const valor = numero(l[c.valor]);
    const codigo = codigoDe(l[c.cat]);
    const comunidade = String(l[c.com] ?? '').trim();
    const conf = norm(c.conf ? l[c.conf] : 'alta');
    if (!data || !Number.isFinite(valor) || !valor || !codigo || !comunidade || (conf !== 'alta' && conf !== 'media') || (c.trat && String(l[c.trat] ?? '').trim())) { ignoradas++; continue; }
    const txt = (k?: string) => (k ? String(l[k] ?? '').trim() : '') || undefined;
    const centro = codigoDe(c.cc ? l[c.cc] : '') || undefined;
    linhas.push({ data, descricao: String(l[c.desc!] ?? '').trim(), valor: r2(valor), codigo, comunidade, ...(centro ? { centro } : {}),
      ...(txt(c.proj) ? { projeto: txt(c.proj) } : {}), ...(txt(c.forn) ? { fornecedor: txt(c.forn) } : {}), ...(txt(c.conta) ? { contaAnalitica: txt(c.conta) } : {}) });
  }
  return { linhas, ignoradas, erro: null };
}

const dias = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
/** Semelhança simples entre descritivos: palavras em comum. */
function parecenca(a: string, b: string) {
  const pa = new Set(norm(a).split(' ').filter((w) => w.length > 2));
  return norm(b).split(' ').filter((w) => w.length > 2 && pa.has(w)).length;
}

export interface ResultadoTesouraria {
  /** Movimentos com a proposta aplicada (só os que mudam). */
  alterados: MovBanco[];
  /** Grupos de linhas cujo movimento já está validado ou conciliado. */
  jaTratados: number;
  /** Grupos de linhas sem movimento correspondente no portal. */
  semPar: number;
  /** Grupos com categoria ou comunidade que o portal não conhece. */
  desconhecidas: number;
}

/**
 * Junta as linhas da folha por movimento (mesma data e descritivo) e procura no portal o movimento com a mesma data e o
 * mesmo valor (soma das linhas). Sem ele no próprio dia, aceita até 3 dias de diferença se houver um só candidato.
 */
export function aplicarClassificacaoTesouraria(movs: MovBanco[], linhas: LinhaTesouraria[], ctx: { categorias: Categoria[]; comunidades: Comunidade[]; quando: string }): ResultadoTesouraria {
  const catPor = new Map(ctx.categorias.filter((c) => c.codigo).map((c) => [c.codigo!, c.nome]));
  const comPor = new Map(ctx.comunidades.map((c) => [norm(c.nome), c.id]));
  const grupos = new Map<string, LinhaTesouraria[]>();
  for (const l of linhas) {
    const k = `${l.data}|${norm(l.descricao)}|${Math.sign(l.valor)}`;
    grupos.set(k, [...(grupos.get(k) ?? []), l]);
  }
  const usados = new Set<string>();
  const alterados: MovBanco[] = [];
  let jaTratados = 0, semPar = 0, desconhecidas = 0;
  for (const g of grupos.values()) {
    const { data, descricao } = g[0];
    const total = r2(g.reduce((s, l) => s + l.valor, 0));
    const livres = movs.filter((m) => !usados.has(m.id) && Math.abs(m.valor - total) < 0.005);
    let cand = livres.filter((m) => m.data === data);
    if (cand.length > 1) {
      const melhor = Math.max(...cand.map((m) => parecenca(descricao, m.descricao)));
      cand = cand.filter((m) => parecenca(descricao, m.descricao) === melhor);
    }
    if (!cand.length) { const perto = livres.filter((m) => dias(m.data, data) <= 3); if (perto.length === 1) cand = perto; }
    const m = cand[0];
    if (!m) { semPar++; continue; }
    usados.add(m.id);
    if (m.estado === 'validado' || m.conciliadoCom) { jaTratados++; continue; }
    const partes: ParteMov[] = [];
    let ok = true;
    for (const l of g) {
      const categoria = catPor.get(l.codigo);
      const comunidadeId = comPor.get(norm(l.comunidade));
      if (!categoria || !comunidadeId) { ok = false; break; }
      partes.push({ comunidadeId, valor: l.valor, categoria, ...(l.centro ? { centroCusto: l.centro } : {}), ...(l.projeto ? { projeto: l.projeto } : {}), ...(l.fornecedor ? { fornecedor: l.fornecedor } : {}) });
    }
    if (!ok) { desconhecidas++; continue; }
    const maior = [...g].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor))[0];
    const base: MovBanco = {
      ...m, estado: 'proposto', contabilizar: false, nota: `Classificação da tesouraria (folha de ${ctx.quando})`,
      categoria: catPor.get(maior.codigo), centroCusto: maior.centro, projeto: maior.projeto, fornecedor: maior.fornecedor, contaAnalitica: maior.contaAnalitica,
    };
    alterados.push(g.length === 1 ? { ...base, comunidadeId: partes[0].comunidadeId, partes: undefined } : { ...base, comunidadeId: undefined, partes });
  }
  return { alterados, jaTratados, semPar, desconhecidas };
}

/** Categorias do plano usadas na folha que o portal ainda não tem. */
export function categoriasEmFalta(linhas: LinhaTesouraria[], categorias: Categoria[]): Categoria[] {
  const tem = new Set(categorias.map((c) => c.codigo));
  const usadas = new Set(linhas.map((l) => l.codigo));
  return categoriasDoPlano().filter((c) => usadas.has(c.codigo!) && !tem.has(c.codigo));
}

/** Centros de custo (do plano), projetos, fornecedores e contas analíticas usados na folha que ainda não existem. */
export function dimensoesEmFalta(linhas: LinhaTesouraria[], dims: Dimensao[]): Dimensao[] {
  const tem = (tipo: Dimensao['tipo'], v: string) => dims.some((d) => d.tipo === tipo && (tipo === 'centro' ? d.codigo === v : norm(d.nome) === norm(v)));
  const novas: Dimensao[] = [];
  const junta = (d: Dimensao) => { if (!novas.some((x) => x.id === d.id)) novas.push(d); };
  for (const l of linhas) {
    if (l.centro && !tem('centro', l.centro)) {
      const c = CENTROS_CUSTO.find(([cod]) => cod === l.centro);
      if (c) junta({ id: `centro-${c[0].toLowerCase()}`, tipo: 'centro', codigo: c[0], nome: c[1], ambito: c[2], ativo: true });
    }
  }
  for (const l of linhas) if (l.projeto && !tem('projeto', l.projeto)) junta({ id: `projeto-${slug(l.projeto)}`, tipo: 'projeto', nome: l.projeto, ativo: true });
  for (const l of linhas) if (l.fornecedor && !tem('fornecedor', l.fornecedor)) junta({ id: `fornecedor-${slug(l.fornecedor)}`, tipo: 'fornecedor', nome: l.fornecedor, ativo: true });
  for (const l of linhas) if (l.contaAnalitica && !tem('conta', l.contaAnalitica)) junta({ id: `conta-${slug(l.contaAnalitica)}`, tipo: 'conta', nome: l.contaAnalitica, categoria: l.codigo, ativo: true });
  return novas;
}
