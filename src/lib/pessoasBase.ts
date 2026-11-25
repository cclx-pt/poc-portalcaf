/**
 * Pessoas (dados de referência, confidenciais: só Master e CAF). Nome, telefones, contribuinte (NIF), e-mails e
 * comunidade, para futuras consolidações e registos. Proposta a partir do Jotform (Contribuir e Registo de Despesas,
 * nível confidencial) e editável à mão; as pessoas editadas à mão não são substituídas pela proposta automática.
 * Funções puras (o acesso ao Firestore está em pessoas.ts).
 */
import { norm } from './format';
import { normalizarTelefones } from './reconciliacaoReembolsos';
import type { Lote } from './types';

export interface Pessoa {
  id: string;
  nome: string;
  telefones: string[];
  nif?: string;
  emails: string[];
  comunidadeId?: string;
  notas?: string;
  /** true depois de editada à mão: a atualização a partir do Jotform só acrescenta telefones e e-mails. */
  manual: boolean;
  /** Submissões do Jotform de onde veio (origem:id). */
  fontes: string[];
  criadoEm?: string;
  atualizadoEm: string;
  atualizadoPor: string;
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
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

interface Registo { fonte: string; nome?: string; nif?: string; emails: string[]; telefones: string[]; comunidadeId: string }

/** Pessoas propostas a partir dos lotes confidenciais (Contribuir e Despesas): a mesma pessoa junta pelo NIF, e-mail ou telefone. */
export function pessoasDoJotform(lotes: Lote[]): Omit<Pessoa, 'atualizadoEm' | 'atualizadoPor'>[] {
  const regs: Registo[] = lotes.flatMap((l) => l.registos.map((r) => ({
    fonte: `${l.origem}:${r.id}`,
    nome: r.pessoa?.replace(/\s+/g, ' ').trim() || undefined,
    nif: normNif(r.nif),
    emails: unicos([normEmail(r.email) ?? '']),
    telefones: normalizarTelefones(r.telefone),
    comunidadeId: l.comunidadeId,
  }))).filter((r) => r.nome || r.nif || r.emails.length || r.telefones.length);

  // União pelas chaves (NIF, e-mail, telefone); só com o nome não se junta (há nomes iguais).
  const pai = regs.map((_, i) => i);
  const raiz = (i: number): number => (pai[i] === i ? i : (pai[i] = raiz(pai[i])));
  const dono = new Map<string, number>();
  regs.forEach((r, i) => {
    for (const k of [r.nif && `nif:${r.nif}`, ...r.emails.map((e) => `email:${e}`), ...r.telefones.map((t) => `tel:${t}`)].filter(Boolean) as string[]) {
      const j = dono.get(k);
      if (j == null) dono.set(k, i); else pai[raiz(i)] = raiz(j);
    }
  });
  const grupos = new Map<number, Registo[]>();
  regs.forEach((r, i) => grupos.set(raiz(i), [...(grupos.get(raiz(i)) ?? []), r]));

  return [...grupos.values()].map((g) => {
    const nomes = g.map((r) => r.nome).filter(Boolean) as string[];
    const nomeNorm = maisFrequente(nomes.map(normNome));
    const nome = maisFrequente(nomes.filter((n) => normNome(n) === nomeNorm)) ?? 'Sem nome';
    const nif = maisFrequente(g.map((r) => r.nif ?? '').filter(Boolean));
    const emails = unicos(g.flatMap((r) => r.emails));
    const telefones = unicos(g.flatMap((r) => r.telefones));
    const id = nif ? `nif-${nif}` : emails[0] ? `email-${slug(emails[0])}` : telefones[0] ? `tel-${telefones[0]}` : `nome-${slug(normNome(nome))}-${slug(g[0].fonte)}`;
    return {
      id, nome, telefones, emails, ...(nif ? { nif } : {}),
      comunidadeId: maisFrequente(g.map((r) => r.comunidadeId)),
      manual: false, fontes: unicos(g.map((r) => r.fonte)),
    };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
}

const chaves = (p: Pick<Pessoa, 'nif' | 'emails' | 'telefones'>) => [p.nif && `nif:${p.nif}`, ...p.emails.map((e) => `email:${e}`), ...p.telefones.map((t) => `tel:${t}`)].filter(Boolean) as string[];
const igual = (a: Pessoa, b: Pessoa) => JSON.stringify([a.nome, a.nif ?? '', [...a.telefones].sort(), [...a.emails].sort(), a.comunidadeId ?? '', [...a.fontes].sort()])
  === JSON.stringify([b.nome, b.nif ?? '', [...b.telefones].sort(), [...b.emails].sort(), b.comunidadeId ?? '', [...b.fontes].sort()]);

/**
 * Junta a proposta do Jotform à base: cria as pessoas novas; nas automáticas atualiza tudo; nas editadas à mão
 * só acrescenta telefones, e-mails, fontes e o NIF em falta.
 */
export function fundirComJotform(existentes: Pessoa[], jot: Omit<Pessoa, 'atualizadoEm' | 'atualizadoPor'>[], quem: string, agora: string) {
  const porChave = new Map<string, Pessoa>();
  existentes.forEach((p) => chaves(p).forEach((k) => porChave.set(k, p)));
  const novas: Pessoa[] = [];
  const mudadas = new Map<string, Pessoa>();
  let semAlteracao = 0;
  for (const j of jot) {
    const ex = chaves(j).map((k) => porChave.get(k)).find(Boolean);
    if (!ex) { novas.push({ ...j, criadoEm: agora, atualizadoEm: agora, atualizadoPor: quem }); continue; }
    const base = mudadas.get(ex.id) ?? ex;
    const junto: Pessoa = ex.manual
      ? { ...base, nif: base.nif ?? j.nif, telefones: unicos([...base.telefones, ...j.telefones]), emails: unicos([...base.emails, ...j.emails]), fontes: unicos([...base.fontes, ...j.fontes]) }
      : { ...base, nome: j.nome, nif: j.nif ?? base.nif, comunidadeId: j.comunidadeId ?? base.comunidadeId, telefones: unicos([...base.telefones, ...j.telefones]), emails: unicos([...base.emails, ...j.emails]), fontes: unicos([...base.fontes, ...j.fontes]) };
    if (!junto.nif) delete junto.nif;
    if (igual(junto, ex)) { semAlteracao++; continue; }
    mudadas.set(ex.id, { ...junto, atualizadoEm: agora, atualizadoPor: quem });
  }
  return { novas, atualizadas: [...mudadas.values()], semAlteracao };
}

/** Pesquisa por nome (sem acentos), telefone, NIF ou e-mail. */
export function procurarPessoas(ps: Pessoa[], q: string): Pessoa[] {
  const t = normNome(q);
  if (!t) return ps;
  const dig = q.replace(/\D/g, '');
  const e = q.trim().toLowerCase();
  return ps.filter((p) => normNome(p.nome).includes(t) || p.emails.some((x) => x.includes(e))
    || (dig.length >= 3 && (p.telefones.some((x) => x.includes(dig)) || (p.nif ?? '').includes(dig))));
}
