/**
 * Regras dos extratos sugeridas a partir do histórico já consolidado: movimentos validados que se repetem
 * (pelo menos 3 meses) com a mesma classificação. As regras gravadas ficam em Configuração › Regras dos extratos
 * e são usadas na proposta de classificação de cada extrato.
 */
import { regraDoMovimento, sugerirPadrao, temPalavra, type RegraBanco } from './classificacaoBanco';
import { norm } from './format';
import type { Categoria, MovBanco } from './types';

export interface RegraSugerida {
  /** Id da regra (o da regra existente quando é para atualizar). */
  id: string;
  padrao: string;
  categoria: string;
  comunidadeId?: string;
  centroCusto?: string;
  fornecedor?: string;
  projeto?: string;
  contaAnalitica?: string;
  /** Movimentos validados com este texto e esta classificação. */
  ocorrencias: number;
  /** Meses (AAAA-MM) em que aparece, por ordem. */
  meses: string[];
  /** Pelo menos 3 meses seguidos. */
  mensal: boolean;
  valorMedio: number;
  /** Parte dos movimentos com este texto que tem esta classificação (0 a 1). */
  concordancia: number;
  acao: 'nova' | 'atualizar';
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const slug = (s: string) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const chaveClass = (m: MovBanco) => `${m.categoria}|${m.comunidadeId ?? ''}|${m.centroCusto ?? ''}`;
/** O valor que todos têm (ou nada, se mudar). */
const comum = <T,>(xs: (T | undefined)[]) => (xs.every((x) => x != null && x === xs[0]) ? xs[0] : undefined);
const mesSeguinte = (p: string) => { const [a, m] = p.split('-').map(Number); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`; };
function maiorSequencia(meses: string[]) {
  let melhor = meses.length ? 1 : 0, atual = melhor;
  for (let i = 1; i < meses.length; i++) { atual = meses[i] === mesSeguinte(meses[i - 1]) ? atual + 1 : 1; melhor = Math.max(melhor, atual); }
  return melhor;
}

/** Palavras que não identificam ninguém nem nada (títulos, prefixos de transferências). */
const VAZIAS = new Set(['dra', 'dr', 'sr', 'sra', 'eng', 'mbway', 'trf', 'tfi', 'transf', 'imed']);
/** Texto da regra: o do descritivo sem prefixos nem títulos; uma palavra com 5 letras ou mais, ou duas palavras. */
export function padraoDe(descricao: string): string | null {
  const limpo = descricao.split(/\s+/).filter((w) => !VAZIAS.has(norm(w))).join(' ');
  const palavras = sugerirPadrao(limpo).split(' ').filter(Boolean);
  const p = palavras.join(' ');
  const letras = norm(p).replace(/[^a-z0-9]/g, '').length;
  return (palavras.length >= 2 && letras >= 5) || (palavras.length === 1 && letras >= 5) ? p : null;
}

export function sugerirRegras(movs: MovBanco[], regras: RegraBanco[], o: { categorias: Categoria[]; minMeses?: number; minConcordancia?: number }): RegraSugerida[] {
  const minMeses = o.minMeses ?? 3;
  const minConc = o.minConcordancia ?? 0.8;
  const existe = new Set(o.categorias.filter((c) => c.ativo !== false).map((c) => c.nome));
  // Histórico consolidado: validado à mão ou aceite, não conciliado com o Jotform, numa só linha.
  const base = movs.filter((m) => m.estado === 'validado' && !m.conciliadoCom && !m.partes?.length && m.categoria && existe.has(m.categoria));
  const candidatos = new Map<string, string>();
  for (const m of base) {
    const p = padraoDe(m.descricao);
    if (!p || !temPalavra(m.descricao, p)) continue;
    candidatos.set(`${norm(p)}|${Math.sign(m.valor)}`, p);
  }
  const out: RegraSugerida[] = [];
  for (const [k, padrao] of candidatos) {
    const sinal = Number(k.split('|')[1]);
    const todos = base.filter((m) => Math.sign(m.valor) === sinal && temPalavra(m.descricao, padrao));
    const grupos = new Map<string, MovBanco[]>();
    for (const m of todos) grupos.set(chaveClass(m), [...(grupos.get(chaveClass(m)) ?? []), m]);
    const [, g] = [...grupos].sort((a, b) => b[1].length - a[1].length)[0];
    const concordancia = g.length / todos.length;
    const meses = [...new Set(g.map((m) => m.data.slice(0, 7)))].sort();
    if (meses.length < minMeses || concordancia < minConc) continue;
    const ref = g[0];
    const sug = {
      padrao, categoria: ref.categoria!, ...(ref.comunidadeId ? { comunidadeId: ref.comunidadeId } : {}), ...(ref.centroCusto ? { centroCusto: ref.centroCusto } : {}),
      fornecedor: comum(g.map((m) => m.fornecedor)), projeto: comum(g.map((m) => m.projeto)), contaAnalitica: comum(g.map((m) => m.contaAnalitica)),
    };
    // Já há uma regra que dá esta classificação? Não se repete. Com o mesmo texto e outra classificação: atualizar.
    const atual = regraDoMovimento(ref.descricao, regras.filter((x) => x.ativo !== false));
    const mesma = atual && atual.categoria === sug.categoria && (atual.comunidadeId ?? '') === (sug.comunidadeId ?? '') && (atual.centroCusto ?? '') === (sug.centroCusto ?? '') && !atual.partes?.length;
    if (mesma) continue;
    const mesmoTexto = regras.find((x) => norm(x.padrao) === norm(padrao));
    if (atual && !mesmoTexto) continue; // outra regra mais específica decide: não se mexe sem olhar
    out.push({
      id: mesmoTexto?.id ?? slug(padrao), ...Object.fromEntries(Object.entries(sug).filter(([, x]) => x != null)) as typeof sug,
      ocorrencias: g.length, meses, mensal: maiorSequencia(meses) >= 3, valorMedio: r2(g.reduce((s, m) => s + m.valor, 0) / g.length),
      concordancia, acao: mesmoTexto ? 'atualizar' : 'nova',
    });
  }
  // Uma sugestão que contém outra com a mesma classificação é redundante (a mais curta já a cobre).
  const igual = (a: RegraSugerida, b: RegraSugerida) => a.categoria === b.categoria && a.comunidadeId === b.comunidadeId && a.centroCusto === b.centroCusto && Math.sign(a.valorMedio) === Math.sign(b.valorMedio);
  const final = out.filter((a) => !out.some((b) => b !== a && igual(a, b) && norm(a.padrao) !== norm(b.padrao) && temPalavra(a.padrao, b.padrao)));
  return final.sort((a, b) => b.meses.length - a.meses.length || b.ocorrencias - a.ocorrencias || a.padrao.localeCompare(b.padrao, 'pt'));
}

/** A regra a gravar a partir de uma sugestão (mantém o que a regra existente já tinha e a sugestão não muda). */
export function regraDaSugestao(s: RegraSugerida, existente?: RegraBanco): RegraBanco {
  const { id, padrao, categoria, comunidadeId, centroCusto, fornecedor, projeto, contaAnalitica } = s;
  return JSON.parse(JSON.stringify({ ...(existente ?? {}), id, padrao, categoria, comunidadeId, centroCusto, fornecedor, projeto, contaAnalitica, ativo: true, partes: undefined }));
}
