/**
 * Pessoas (dados de referência, confidenciais: só Master e CAF): nome, telemóvel, contribuinte (NIF), e-mail e
 * comunidade, para futuras consolidações e registos. Regras (decisão do CAF, 25/11/2026):
 * - um só telemóvel e um só e-mail por linha; não se agrupa: a mesma pessoa com dois telemóveis tem duas linhas;
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
  const porChave = new Map(existentes.map((p) => [chavePessoa(p), p]));
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
  const achadas = ps.filter((p) => (p.telefone ?? '').startsWith(m.prefixo) && (p.telefone ?? '').endsWith(m.sufixo));
  if (!achadas.length) return null;
  const coms = [...new Set(achadas.map((p) => p.comunidadeId).filter(Boolean))] as string[];
  return { mascara: `${m.prefixo}XXX${m.sufixo}`, nomes: [...new Set(achadas.map((p) => p.nome))].sort((a, b) => a.localeCompare(b, 'pt')), comunidadeId: coms.length === 1 ? coms[0] : undefined };
}

/** Pesquisa por nome (sem acentos), telefone, máscara MB Way (966XXX014), NIF ou e-mail. */
export function procurarPessoas(ps: Pessoa[], q: string): Pessoa[] {
  const t = normNome(q);
  if (!t) return ps;
  const masc = extrairTelefoneMascarado(/mb\s*way/i.test(q) ? q : `mbway ${q}`);
  if (masc) return ps.filter((p) => (p.telefone ?? '').startsWith(masc.prefixo) && (p.telefone ?? '').endsWith(masc.sufixo));
  const dig = q.replace(/\D/g, '');
  const e = q.trim().toLowerCase();
  return ps.filter((p) => normNome(p.nome).includes(t) || (p.email ?? '').includes(e)
    || (dig.length >= 3 && ((p.telefone ?? '').includes(dig) || (p.nif ?? '').includes(dig))));
}
