/**
 * Pessoas (dados de referência, confidenciais: só Master e CAF): nome, telemóvel, contribuinte (NIF), e-mail e
 * comunidade, para futuras consolidações e registos. Regras (decisão do CAF, 25/11/2026):
 * - um só telemóvel e um só e-mail por linha; não se agrupa automaticamente: a mesma pessoa com dois telemóveis tem duas
 *   linhas, a não ser que alguém as funda (27/11/2026: os outros telemóveis ficam em `outrosTelefones`, os outros e-mails nas notas);
 * - não se grava sem nome nem sem telemóvel; a comunidade Geral fica de fora da proposta do Jotform;
 * - as linhas editadas à mão não são alteradas pela proposta automática.
 * Funções puras (o acesso ao Firestore está em pessoas.ts).
 */
import { norm } from './format';
import { extrairTelefoneMascarado, normalizarTelefones } from './reconciliacaoReembolsos';
import type { Lote } from './types';

export interface Pessoa {
  id: string;
  nome: string;
  /** Um só telemóvel (9 dígitos começados por 9). */
  telefone: string;
  /** Um só e-mail. */
  email?: string;
  nif?: string;
  comunidadeId?: string;
  notas?: string;
  /** true depois de editada à mão: a proposta do Jotform não a altera. */
  manual: boolean;
  /** Submissões do Jotform de onde veio (origem:id). */
  fontes: string[];
  criadoEm?: string;
  atualizadoEm: string;
  atualizadoPor: string;
  /** Outros telemóveis da mesma pessoa, vindos de uma fusão (contam no MB Way e na procura). */
  outrosTelefones?: string[];
  /** Fusão de linhas repetidas: as linhas como estavam, para desfazer e para o Jotform não as voltar a criar. */
  fusao?: { originais: Pessoa[]; em: string; por: string };
}

export const normNif = (v?: string | null) => { const d = String(v ?? '').replace(/\D/g, '').replace(/^351(?=\d{9}$)/, ''); return /^\d{9}$/.test(d) ? d : undefined; };
export const normEmail = (v?: string | null) => { const e = String(v ?? '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+$/.test(e) ? e : undefined; };
const normNome = (s?: string) => norm(s ?? '').replace(/\s+/g, ' ').trim();
const unicos = (xs: string[]) => [...new Set(xs.filter(Boolean))];
const maisFrequente = (xs: string[]) => {
  const n = new Map<string, number>();
  xs.forEach((x) => n.set(x, (n.get(x) ?? 0) + 1));
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Chave de uma linha: nome + telemóvel + e-mail (iguais = a mesma linha; qualquer diferença = outra linha). */
export const chavePessoa = (p: Pick<Pessoa, 'nome' | 'telefone' | 'email'>) => `${normNome(p.nome)}|${p.telefone}|${p.email ?? ''}`;
/** Id estável de uma linha (o mesmo nome + telemóvel + e-mail dá sempre o mesmo id). */
export const idNovaPessoa = (p: Pick<Pessoa, 'nome' | 'telefone' | 'email'>) => `p-${p.telefone}-${slug(p.nome).slice(0, 40)}${p.email ? `-${slug(p.email).slice(0, 40)}` : ''}`;

type Proposta = Omit<Pessoa, 'atualizadoEm' | 'atualizadoPor'>;

/**
 * Linhas propostas a partir dos lotes confidenciais (Contribuir e Despesas): uma por nome + telemóvel + e-mail.
 * Submissões iguais juntam as fontes; sem nome, sem telemóvel ou da Geral não entram.
 */
export function pessoasDoJotform(lotes: Lote[]): Proposta[] {
  const linhas = new Map<string, { nome: string; telefone: string; email?: string; nifs: string[]; coms: string[]; fontes: string[] }>();
  for (const l of lotes) {
    if (l.comunidadeId === 'bolsa-geral') continue;
    for (const r of l.registos) {
      const nome = r.pessoa?.replace(/\s+/g, ' ').trim();
      if (!nome) continue;
      const email = normEmail(r.email);
      for (const telefone of normalizarTelefones(r.telefone)) {
        const k = chavePessoa({ nome, telefone, email });
        const x = linhas.get(k) ?? { nome, telefone, email, nifs: [], coms: [], fontes: [] };
        const nif = normNif(r.nif);
        if (nif) x.nifs.push(nif);
        x.coms.push(l.comunidadeId);
        x.fontes.push(`${l.origem}:${r.id}`);
        linhas.set(k, x);
      }
    }
  }
  return [...linhas.values()].map((x) => {
    const nif = maisFrequente(x.nifs);
    return {
      id: idNovaPessoa(x), nome: x.nome, telefone: x.telefone, ...(x.email ? { email: x.email } : {}), ...(nif ? { nif } : {}),
      comunidadeId: maisFrequente(x.coms), manual: false, fontes: unicos(x.fontes),
    };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt') || a.telefone.localeCompare(b.telefone));
}

const igual = (a: Pessoa, b: Pessoa) => JSON.stringify([a.nif ?? '', a.comunidadeId ?? '', [...a.fontes].sort()]) === JSON.stringify([b.nif ?? '', b.comunidadeId ?? '', [...b.fontes].sort()]);

/**
 * Junta a proposta do Jotform à base: cria as linhas novas (nome + telemóvel + e-mail que ainda não existem);
 * numa linha automática igual atualiza o NIF, a comunidade e as fontes; as editadas à mão ficam como estão.
 */
export function fundirComJotform(existentes: Pessoa[], jot: Proposta[], quem: string, agora: string) {
  // Uma linha fundida responde também pelas chaves das linhas que absorveu (não as volta a criar).
  const porChave = new Map(existentes.flatMap((p) => chavesDe(p).map((k) => [k, p] as const)));
  const novas: Pessoa[] = [];
  const atualizadas: Pessoa[] = [];
  let semAlteracao = 0;
  for (const j of jot) {
    const ex = porChave.get(chavePessoa(j));
    if (!ex) { novas.push({ ...j, criadoEm: agora, atualizadoEm: agora, atualizadoPor: quem }); continue; }
    if (ex.manual) { semAlteracao++; continue; }
    const junto: Pessoa = { ...ex, nif: j.nif ?? ex.nif, comunidadeId: j.comunidadeId ?? ex.comunidadeId, fontes: unicos([...ex.fontes, ...j.fontes]) };
    if (!junto.nif) delete junto.nif;
    if (igual(junto, ex)) { semAlteracao++; continue; }
    atualizadas.push({ ...junto, atualizadoEm: agora, atualizadoPor: quem });
  }
  return { novas, atualizadas, semAlteracao };
}

/** Validação ao gravar à mão: nome e telemóvel obrigatórios; um só telemóvel e um só e-mail. Devolve o erro ou null. */
export function validarPessoa(v: { nome: string; telefone: string; email?: string; nif?: string }): string | null {
  if (!v.nome.trim()) return 'Indique o nome.';
  if (!v.telefone.trim()) return 'Indique o telemóvel.';
  const tels = normalizarTelefones(v.telefone);
  if (/[,;/]/.test(v.telefone) || tels.length > 1) return 'Indique um só telemóvel por linha (para outro número, crie outra linha).';
  if (tels.length !== 1) return 'O telemóvel tem de ter 9 dígitos começados por 9.';
  if (v.email?.trim()) {
    if (/[,;\s]/.test(v.email.trim())) return 'Indique um só e-mail por linha (para outro, crie outra linha).';
    if (!normEmail(v.email)) return 'E-mail inválido.';
  }
  if (v.nif?.trim() && !normNif(v.nif)) return 'O contribuinte (NIF) tem de ter 9 dígitos.';
  return null;
}

/** Telemóvel como aparece no descritivo MB Way do extrato: 3 primeiros + XXX + 3 últimos (966XXX014). */
export const mascaraMbway = (tel?: string) => (tel && /^\d{9}$/.test(tel) ? `${tel.slice(0, 3)}XXX${tel.slice(6)}` : '');

/**
 * Pessoas cujo telemóvel encaixa no MB Way mascarado de um descritivo do extrato ("Trf Mbway 966XXX014").
 * `comunidadeId` só vem preenchida quando todas são da mesma comunidade. null = sem MB Way ou sem ninguém.
 */
export function comunidadePorMbway(ps: Pessoa[], descricao: string): { mascara: string; nomes: string[]; comunidadeId?: string } | null {
  const m = extrairTelefoneMascarado(descricao);
  if (!m) return null;
  const achadas = ps.filter((p) => telefonesDe(p).some((t) => t.startsWith(m.prefixo) && t.endsWith(m.sufixo)));
  if (!achadas.length) return null;
  const coms = [...new Set(achadas.map((p) => p.comunidadeId).filter(Boolean))] as string[];
  return { mascara: `${m.prefixo}XXX${m.sufixo}`, nomes: [...new Set(achadas.map((p) => p.nome))].sort((a, b) => a.localeCompare(b, 'pt')), comunidadeId: coms.length === 1 ? coms[0] : undefined };
}

/** Pesquisa por nome (sem acentos), telefone, máscara MB Way (966XXX014), NIF ou e-mail. */
export function procurarPessoas(ps: Pessoa[], q: string): Pessoa[] {
  const t = normNome(q);
  if (!t) return ps;
  const masc = extrairTelefoneMascarado(/mb\s*way/i.test(q) ? q : `mbway ${q}`);
  if (masc) return ps.filter((p) => telefonesDe(p).some((x) => x.startsWith(masc.prefixo) && x.endsWith(masc.sufixo)));
  const dig = q.replace(/\D/g, '');
  const e = q.trim().toLowerCase();
  return ps.filter((p) => normNome(p.nome).includes(t) || (p.email ?? '').includes(e)
    || (dig.length >= 3 && (telefonesDe(p).some((x) => x.includes(dig)) || (p.nif ?? '').includes(dig))));
}

// ---------- Repetidos e fusão de linhas (decisão do CAF, 27/11/2026) ----------

/** Telemóvel principal e os outros (de uma fusão). */
export const telefonesDe = (p: Pick<Pessoa, 'telefone' | 'outrosTelefones'>) => [p.telefone ?? '', ...(p.outrosTelefones ?? [])].filter(Boolean);
/** Chaves de uma linha: a sua e as das linhas que absorveu numa fusão (também as de fusões anteriores). */
export function chavesDe(p: Pessoa): string[] {
  return unicos([chavePessoa(p), ...(p.fusao?.originais ?? []).flatMap((o) => (o.id === p.id && !o.fusao ? [chavePessoa(o)] : chavesDe(o)))]);
}

export interface GrupoRepetidos {
  /** A: mesmo telemóvel e mesmo nome; B: mesmo telemóvel e nome parecido; C: mesmo NIF ou e-mail com telemóvel diferente; M: escolhidas à mão. */
  tipo: 'A' | 'B' | 'C' | 'M';
  motivo: string;
  ids: string[];
}
const palavras = (s: string) => normNome(s).split(' ').filter(Boolean);
/** Nomes parecidos: as palavras de um estão todas no outro, ou têm a mesma primeira e última palavra. */
function nomesParecidos(a: string, b: string) {
  const pa = palavras(a), pb = palavras(b);
  if (!pa.length || !pb.length) return false;
  const [curto, longo] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  if (curto.every((w) => longo.includes(w))) return true;
  return pa.length > 1 && pb.length > 1 && pa[0] === pb[0] && pa[pa.length - 1] === pb[pb.length - 1];
}

/** Grupos de linhas que parecem a mesma pessoa, com o motivo. A ordem das linhas é a da base. */
export function gruposRepetidos(ps: Pessoa[]): GrupoRepetidos[] {
  const out: GrupoRepetidos[] = [];
  const ordem = new Map(ps.map((p, i) => [p.id, i]));
  const porOrdem = (ids: string[]) => [...new Set(ids)].sort((x, y) => ordem.get(x)! - ordem.get(y)!);
  // A e B: dentro do mesmo telemóvel, junta os nomes iguais e depois os parecidos.
  const porTel = new Map<string, Pessoa[]>();
  for (const p of ps) if (p.telefone) porTel.set(p.telefone, [...(porTel.get(p.telefone) ?? []), p]);
  for (const [tel, xs] of porTel) {
    if (xs.length < 2) continue;
    const porNome = new Map<string, Pessoa[]>();
    for (const x of xs) porNome.set(normNome(x.nome), [...(porNome.get(normNome(x.nome)) ?? []), x]);
    const blocos = [...porNome.values()];
    const usado = new Set<number>();
    for (let i = 0; i < blocos.length; i++) {
      if (usado.has(i)) continue;
      const juntos = [i];
      for (let j = i + 1; j < blocos.length; j++) if (!usado.has(j) && juntos.some((k) => nomesParecidos(blocos[k][0].nome, blocos[j][0].nome))) { juntos.push(j); usado.add(j); }
      const linhas = juntos.flatMap((k) => blocos[k]);
      if (linhas.length < 2) continue;
      out.push(juntos.length > 1
        ? { tipo: 'B', motivo: `Mesmo telemóvel (${tel}) e nomes parecidos`, ids: porOrdem(linhas.map((x) => x.id)) }
        : { tipo: 'A', motivo: `Mesmo telemóvel (${tel}) e mesmo nome`, ids: porOrdem(linhas.map((x) => x.id)) });
    }
  }
  // C: mesmo NIF ou mesmo e-mail, com telemóveis diferentes.
  const vistos = new Set<string>();
  for (const [rotulo, valor] of [['NIF', (p: Pessoa) => normNif(p.nif)], ['e-mail', (p: Pessoa) => normEmail(p.email)]] as const) {
    const por = new Map<string, Pessoa[]>();
    for (const p of ps) { const v = valor(p); if (v) por.set(v, [...(por.get(v) ?? []), p]); }
    for (const [v, xs] of por) {
      if (xs.length < 2 || new Set(xs.map((x) => x.telefone)).size < 2) continue;
      const ids = porOrdem(xs.map((x) => x.id));
      if (vistos.has(ids.join('|'))) continue;
      vistos.add(ids.join('|'));
      out.push({ tipo: 'C', motivo: `Mesmo ${rotulo} (${v}) com telemóveis diferentes`, ids });
    }
  }
  const ord = { A: 0, B: 1, C: 2, M: 3 } as const;
  return out.sort((x, y) => ord[x.tipo] - ord[y.tipo] || ordem.get(x.ids[0])! - ordem.get(y.ids[0])!);
}

export interface EscolhaFusao { manterId: string; nome: string; telefone: string; email?: string; nif?: string; comunidadeId?: string }

/** Proposta: fica a linha editada à mão; senão a mais completa (e-mail, NIF, comunidade); depois a com mais registos. */
export function propostaFusao(linhas: Pessoa[]): EscolhaFusao {
  const pontos = (p: Pessoa) => [p.email, p.nif, p.comunidadeId].filter(Boolean).length;
  const m = [...linhas].sort((a, b) => Number(b.manual) - Number(a.manual) || pontos(b) - pontos(a) || b.fontes.length - a.fontes.length)[0];
  const primeiro = (k: 'email' | 'nif' | 'comunidadeId') => m[k] ?? linhas.find((x) => x[k])?.[k];
  return Object.fromEntries(Object.entries({ manterId: m.id, nome: m.nome, telefone: m.telefone, email: primeiro('email'), nif: primeiro('nif'), comunidadeId: primeiro('comunidadeId') })
    .filter(([, v]) => v != null)) as unknown as EscolhaFusao;
}

/**
 * Funde as linhas na escolhida: valores escolhidos, os outros telemóveis em `outrosTelefones`, os outros e-mails nas
 * notas, as fontes juntas, editada à mão, e as linhas como estavam em `fusao` (para desfazer). Devolve as que se apagam.
 */
export function fundirPessoas(linhas: Pessoa[], e: EscolhaFusao, quem: string, agora: string): { pessoa: Pessoa; apagar: string[] } {
  const base = linhas.find((x) => x.id === e.manterId);
  if (!base) throw new Error('A linha a manter não está no grupo.');
  const outrosTels = unicos(linhas.flatMap(telefonesDe)).filter((x) => x !== e.telefone);
  const email = normEmail(e.email);
  const outrosEmails = unicos(linhas.map((x) => normEmail(x.email) ?? '')).filter((x) => x !== email);
  const notas = [...unicos(linhas.map((x) => (x.notas ?? '').trim())), ...(outrosEmails.length ? [`Outros e-mails: ${outrosEmails.join(', ')}`] : [])].join(' · ');
  const pessoa: Pessoa = {
    ...base, nome: e.nome.replace(/\s+/g, ' ').trim(), telefone: e.telefone, email, nif: normNif(e.nif), comunidadeId: e.comunidadeId || undefined, notas: notas || undefined,
    outrosTelefones: outrosTels.length ? outrosTels : undefined, fontes: unicos(linhas.flatMap((x) => x.fontes)), manual: true,
    fusao: { originais: linhas, em: agora, por: quem }, atualizadoEm: agora, atualizadoPor: quem,
  };
  for (const k of Object.keys(pessoa) as (keyof Pessoa)[]) if (pessoa[k] === undefined) delete pessoa[k];
  return { pessoa, apagar: linhas.map((x) => x.id).filter((id) => id !== e.manterId) };
}

/** Linhas a repor para desfazer uma fusão (a que ficou volta ao que era; as outras voltam a existir). */
export const desfazerFusao = (p: Pessoa): Pessoa[] => p.fusao?.originais ?? [];
