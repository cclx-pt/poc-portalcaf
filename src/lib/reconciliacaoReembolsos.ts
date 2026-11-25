/**
 * Reconciliação dos reembolsos pagos por MB Way ou transferência (saídas do extrato) com as submissões do
 * formulário CCLX - REGISTO DE DESPESAS. Especificação funcional de 25/11/2026:
 * regra 1 Unique ID no descritivo; fallback (sem Unique ID) regra 2 telefone parcial + valor + data,
 * regra 3 sem telefone (valor exato, um único candidato), regra 4 agregado (soma de 2 a 4 submissões).
 * Pontuação de 0 a 100, atribuição global pelo melhor score (FIFO nos empates) e cada submissão usada uma vez.
 * Funções puras: não lê nem grava nada.
 */
import { norm } from './format';
import type { Lote, MovBanco } from './types';

export type FormaReembolso = 'mbway' | 'transferencia';
export type EstadoMatch = 'Confirmado' | 'Provável' | 'Ambíguo' | 'Agregado' | 'Sem submissão';
export type RegraMatch = 1 | 2 | 3 | 4;

export interface SubmissaoReembolso {
  id: string;
  /** Unique ID (R2026NNNN). */
  codigo?: string;
  /** Data de submissão no Jotform (AAAA-MM-DD). */
  submetido: string;
  valor: number;
  comunidadeId: string;
  pessoa?: string;
  /** Telefone para pagamento MB Way, como vem do Jotform (só no nível confidencial). */
  telefone?: string;
  /** Forma de Reembolso; desconhecida em registos sincronizados antes de 25/11/2026. */
  forma?: FormaReembolso | null;
  /** Manual Control (Fechado, Pagamento em curso, Em Pagamento, CANCELADO MANUALMENTE…). */
  estado?: string;
}

export interface ParametrosReembolsos {
  /** O movimento pode ser até N dias antes da submissão. */
  diasAntes: number;
  /** …e até N dias depois. */
  diasDepois: number;
}
export const PARAMETROS_REEMBOLSOS: ParametrosReembolsos = { diasAntes: 2, diasDepois: 45 };

export interface Candidato { id: string; score: number }
export interface ResultadoReembolso {
  movId: string;
  estado: EstadoMatch;
  regra: RegraMatch | null;
  /** 0 a 100 (no agregado, o menor dos scores das parcelas). */
  score: number;
  /** Submissões associadas (vazio quando Ambíguo ou Sem submissão; várias no agregado). */
  submissoes: string[];
  /** Melhores candidatos com o score (os 3 primeiros), para a revisão. */
  candidatos: Candidato[];
  /** Telefone mascarado do descritivo, normalizado (prefixo…sufixo). */
  mbway?: string;
  observacoes: string[];
}

// ---------- normalização ----------
const CODIGO = /R[\s-]*20\d{2}[\s-]*\d{4}/;
const normCodigo = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const cent = (v: number) => Math.round(Math.abs(v) * 100);
const eur = (cents: number) => `${(cents / 100).toFixed(2).replace('.', ',')} €`;
const diasEntre = (de: string, ate: string) => Math.round((new Date(ate).getTime() - new Date(de).getTime()) / 86400000);
export const normNome = (s?: string) => norm(s ?? '').replace(/\s+/g, ' ').trim();
const nomeVisivel = (s?: string) => (s ?? '').replace(/\s+/g, ' ').trim();

/** Telefone mascarado num descritivo MB Way ("Trf Mbway 924XXX727" → 924 e 727). */
export function extrairTelefoneMascarado(descricao: string): { prefixo: string; sufixo: string } | null {
  const m = descricao.match(/mb\s*way\D{0,6}(\d{3})\s*[x*]{3}\s*(\d{3})/i);
  return m ? { prefixo: m[1], sufixo: m[2] } : null;
}

/** Telefones de 9 dígitos começados por 9, sem indicativo; números colados partem-se em blocos de 9. */
export function normalizarTelefones(t?: string | null): string[] {
  let d = String(t ?? '').replace(/\D/g, '');
  if (!d) return [];
  d = d.replace(/^(00351|351)(?=9\d{8})/, '');
  const out: string[] = [];
  for (let i = 0; i + 9 <= d.length; i += 9) {
    const bloco = d.slice(i, i + 9).replace(/^(00351|351)/, '');
    if (/^9\d{8}$/.test(bloco)) out.push(bloco);
  }
  return [...new Set(out)];
}

type TipoMov = 'mbway' | 'transferencia' | 'reembolso';
/** Saídas no âmbito: MB Way, transferência ou "Reembolso" no descritivo. */
function tipoMovimento(m: MovBanco): TipoMov | null {
  if (m.valor >= 0) return null;
  const d = norm(m.descricao);
  if (/mb ?way/.test(d)) return 'mbway';
  if (/\btrf\b|transf/.test(d)) return 'transferencia';
  if (/reembolso/.test(d) || CODIGO.test(m.descricao.toUpperCase())) return 'reembolso';
  return null;
}

const CANCELADO = (e?: string) => norm(e ?? '').includes('cancelado');
const ESTADO_PAGO = (e?: string) => ['fechado', 'pagamento em curso', 'em pagamento'].includes(norm(e ?? '').trim());

/** Submissões a partir dos lotes confidenciais do Registo de Despesas (só reembolsos). */
export function submissoesDeLotes(lotes: Lote[]): SubmissaoReembolso[] {
  return lotes.flatMap((l) => l.registos.map((r) => {
    const f = norm(String(r.extra?.forma ?? ''));
    return {
      id: r.id,
      codigo: r.extra?.codigo ? String(r.extra.codigo) : undefined,
      submetido: String(r.extra?.submetido ?? r.data).slice(0, 10),
      valor: r.valor,
      comunidadeId: l.comunidadeId,
      pessoa: r.pessoa,
      telefone: r.telefone,
      forma: /mb ?way/.test(f) ? 'mbway' : /transf/.test(f) ? 'transferencia' : null,
      estado: r.extra?.estado ? String(r.extra.estado) : undefined,
    } satisfies SubmissaoReembolso;
  }));
}

// ---------- pontuação ----------
interface Par { mov: MovBanco; sub: SubmissaoReembolso; regra: RegraMatch; bruto: number; obs: string[] }

/**
 * Reconcilia as saídas de reembolso com as submissões. `usados`: submissões já associadas noutra execução
 * (não voltam a ser escolhidas, mas os telefones delas servem para inferir os de outras submissões da mesma pessoa).
 */
export function reconciliarReembolsos(movs: MovBanco[], todas: SubmissaoReembolso[], usados: Set<string> = new Set(), p: ParametrosReembolsos = PARAMETROS_REEMBOLSOS): ResultadoReembolso[] {
  const alvo = movs.map((m) => ({ m, tipo: tipoMovimento(m) })).filter((x): x is { m: MovBanco; tipo: TipoMov } => !!x.tipo);
  const telReg = new Map(todas.map((s) => [s.id, normalizarTelefones(s.telefone)]));
  // Telefones já usados por cada pessoa (nome normalizado), para inferir o de submissões sem telefone.
  const telPessoa = new Map<string, Set<string>>();
  for (const s of todas) {
    const n = normNome(s.pessoa);
    if (!n) continue;
    const set = telPessoa.get(n) ?? new Set<string>();
    telReg.get(s.id)!.forEach((t) => set.add(t));
    telPessoa.set(n, set);
  }
  const elegiveis = todas.filter((s) => !CANCELADO(s.estado) && !usados.has(s.id));
  const naJanela = (s: SubmissaoReembolso, m: MovBanco) => { const d = diasEntre(s.submetido, m.data); return d >= -p.diasAntes && d <= p.diasDepois; };
  const pontosData = (s: SubmissaoReembolso, m: MovBanco) => Math.max(0, 20 * (1 - Math.max(0, diasEntre(s.submetido, m.data)) / p.diasDepois));
  const pontosForma = (s: SubmissaoReembolso, tipo: TipoMov) => (s.forma && s.forma === tipo ? 5 : 0);
  const pontosEstado = (s: SubmissaoReembolso) => (ESTADO_PAGO(s.estado) ? 5 : 0);
  /** Pontos do valor (null exclui) e observação da diferença. */
  const pontosValor = (s: SubmissaoReembolso, m: MovBanco): { pts: number; obs?: string } | null => {
    const a = cent(s.valor); const b = cent(m.valor); const dif = Math.abs(a - b);
    if (dif === 0) return { pts: 40 };
    if (dif <= 50 || dif <= b * 0.01) return { pts: 15, obs: `Valor na submissão é ${eur(a)} (diferença de ${eur(dif)})` };
    return null;
  };
  /** Telefone da submissão face ao do descritivo: 40 registado, 30 inferido, 0 sem telefone; null exclui (diferente). */
  const pontosTelefone = (s: SubmissaoReembolso, tel: { prefixo: string; sufixo: string } | null): { pts: number; obs?: string } | null => {
    const bate = (t: string) => !!tel && t.startsWith(tel.prefixo) && t.endsWith(tel.sufixo);
    const reg = telReg.get(s.id) ?? [];
    if (!tel) return { pts: 0 };
    if (reg.length) return reg.some(bate) ? { pts: 40 } : null;
    const inferidos = [...(telPessoa.get(normNome(s.pessoa)) ?? [])];
    if (inferidos.some(bate)) return { pts: 30, obs: `Telefone inferido de outra submissão de ${nomeVisivel(s.pessoa)}` };
    return { pts: 0 };
  };

  const resultados = new Map<string, ResultadoReembolso>();
  const pares: Par[] = [];
  const atribuidas = new Set<string>();
  const porMov = new Map<string, Par[]>();

  for (const { m, tipo } of alvo) {
    const tel = extrairTelefoneMascarado(m.descricao);
    const base: ResultadoReembolso = { movId: m.id, estado: 'Sem submissão', regra: null, score: 0, submissoes: [], candidatos: [], observacoes: [], ...(tel ? { mbway: `${tel.prefixo}…${tel.sufixo}` } : {}) };
    resultados.set(m.id, base);

    // Regra 1: Unique ID no descritivo (associação direta, fora da janela de datas).
    const bruto = m.descricao.toUpperCase().match(CODIGO)?.[0];
    if (bruto) {
      const codigo = normCodigo(bruto);
      const s = todas.find((x) => normCodigo(x.codigo ?? '') === codigo || normCodigo(x.id) === codigo);
      if (s && !usados.has(s.id) && !atribuidas.has(s.id)) {
        atribuidas.add(s.id);
        const v = pontosValor(s, m);
        const igual = cent(s.valor) === cent(m.valor);
        Object.assign(base, {
          regra: 1, submissoes: [s.id], score: igual ? 100 : 70, estado: igual ? 'Confirmado' : 'Provável',
          candidatos: [{ id: s.id, score: igual ? 100 : 70 }],
          observacoes: igual ? [] : [v?.obs ?? `Valor na submissão é ${eur(cent(s.valor))} (diferença de ${eur(Math.abs(cent(s.valor) - cent(m.valor)))})`],
        });
        if (CANCELADO(s.estado)) base.observacoes.push('Submissão CANCELADO MANUALMENTE no Jotform');
        continue;
      }
      base.observacoes.push(s ? `${codigo} já associado a outro movimento` : `${codigo} não existe no Jotform`);
    }

    // Regra 2: telefone parcial (registado ou inferido) + valor + data.
    const lista: Par[] = [];
    if (tel) {
      for (const s of elegiveis) {
        if (!naJanela(s, m)) continue;
        const t = pontosTelefone(s, tel); if (!t || t.pts === 0) continue;
        const v = pontosValor(s, m); if (!v) continue;
        lista.push({ mov: m, sub: s, regra: 2, bruto: t.pts + v.pts + pontosData(s, m) + pontosForma(s, tipo) + pontosEstado(s), obs: [t.obs, v.obs].filter(Boolean) as string[] });
      }
    }
    porMov.set(m.id, lista);
    pares.push(...lista);
  }

  // Atribuição global (regra 2): melhor score primeiro; empates para a submissão mais antiga (FIFO), depois pelo Unique ID.
  const ordenar = (a: Par, b: Par) => b.bruto - a.bruto || a.sub.submetido.localeCompare(b.sub.submetido) || (a.sub.codigo ?? a.sub.id).localeCompare(b.sub.codigo ?? b.sub.id);
  const movFeito = new Set([...resultados.values()].filter((r) => r.submissoes.length).map((r) => r.movId));
  for (const par of [...pares].sort(ordenar)) {
    if (movFeito.has(par.mov.id) || atribuidas.has(par.sub.id)) continue;
    movFeito.add(par.mov.id); atribuidas.add(par.sub.id);
    const r = resultados.get(par.mov.id)!;
    const score = Math.min(100, Math.round(par.bruto));
    const rivais = porMov.get(par.mov.id)!.filter((x) => x !== par);
    const repetido = rivais.some((x) => cent(x.sub.valor) === cent(par.sub.valor) && x.sub.submetido === par.sub.submetido);
    const recorrente = rivais.some((x) => cent(x.sub.valor) === cent(par.sub.valor));
    Object.assign(r, { regra: 2, score, submissoes: [par.sub.id], estado: score >= 85 && !repetido ? 'Confirmado' : score >= 60 ? 'Provável' : 'Ambíguo' });
    r.observacoes.push(...par.obs);
    if (repetido) r.observacoes.push('Provável, valores repetidos');
    else if (recorrente) r.observacoes.push(`Valor repetido de ${nomeVisivel(par.sub.pessoa) || 'a mesma pessoa'}; atribuído à submissão mais antiga`);
    if (r.estado === 'Ambíguo') r.submissoes = [];
  }
  for (const [id, lista] of porMov) resultados.get(id)!.candidatos = [...lista].sort(ordenar).slice(0, 3).map((x) => ({ id: x.sub.id, score: Math.min(100, Math.round(x.bruto)) }));

  // Regra 3: fallback sem telefone (valor exato, na janela, um único candidato livre).
  for (const { m, tipo } of alvo) {
    const r = resultados.get(m.id)!;
    if (r.regra === 1 || movFeito.has(m.id)) continue;
    const tel = extrairTelefoneMascarado(m.descricao);
    const lista = elegiveis.filter((s) => !atribuidas.has(s.id) && naJanela(s, m) && cent(s.valor) === cent(m.valor)
      && (tipo === 'reembolso' || !s.forma || s.forma === tipo) && pontosTelefone(s, tel) !== null)
      .map((s) => ({ s, score: Math.min(100, Math.round(pontosTelefone(s, tel)!.pts + 40 + pontosData(s, m) + pontosForma(s, tipo) + pontosEstado(s))) }))
      .sort((a, b) => b.score - a.score || a.s.submetido.localeCompare(b.s.submetido));
    if (!lista.length) continue;
    r.regra = 3;
    r.candidatos = lista.slice(0, 3).map((x) => ({ id: x.s.id, score: x.score }));
    if (lista.length > 1) { r.estado = 'Ambíguo'; r.score = lista[0].score; continue; }
    const { s, score } = lista[0];
    atribuidas.add(s.id); movFeito.add(m.id);
    Object.assign(r, { score, submissoes: [s.id], estado: score >= 85 ? 'Confirmado' : score >= 60 ? 'Provável' : 'Ambíguo' });
    if (r.estado === 'Ambíguo') { r.submissoes = []; atribuidas.delete(s.id); movFeito.delete(m.id); }
    if (!telReg.get(s.id)?.length) r.observacoes.push('Telemóvel não preenchido na submissão; match por valor e data');
    if (!tel) r.observacoes.push('Descrição sem MB Way; match por valor');
    if (tipo === 'transferencia' || s.forma === 'transferencia') r.observacoes.push('Pago por transferência bancária');
  }

  // Regra 4: agregado (2 a 4 submissões do mesmo telefone ou da mesma pessoa cuja soma é o valor do movimento).
  for (const { m } of alvo) {
    const r = resultados.get(m.id)!;
    if (r.regra === 1 || movFeito.has(m.id) || r.estado === 'Ambíguo') continue;
    const tel = extrairTelefoneMascarado(m.descricao);
    if (!tel) continue;
    const livres = elegiveis.filter((s) => !atribuidas.has(s.id) && naJanela(s, m) && (pontosTelefone(s, tel)?.pts ?? 0) > 0)
      .sort((a, b) => a.submetido.localeCompare(b.submetido)).slice(0, 12);
    const combo = procurarSoma(livres, cent(m.valor));
    if (!combo) continue;
    combo.forEach((s) => atribuidas.add(s.id)); movFeito.add(m.id);
    Object.assign(r, { regra: 4, estado: 'Agregado', score: 60, submissoes: combo.map((s) => s.id), candidatos: [] });
    r.observacoes.push(`Soma de ${combo.length} submissões: ${combo.map((s) => `${s.codigo ?? s.id} (${eur(cent(s.valor))})`).join(' + ')}`);
  }

  // Pagamentos fixos: mesmo telefone e valor em meses diferentes, sem submissão.
  const sem = alvo.filter(({ m }) => !resultados.get(m.id)!.submissoes.length && resultados.get(m.id)!.estado === 'Sem submissão');
  for (const { m } of sem) {
    const tel = extrairTelefoneMascarado(m.descricao);
    if (!tel) continue;
    const iguais = sem.filter(({ m: o }) => o.id !== m.id && cent(o.valor) === cent(m.valor) && o.data.slice(0, 7) !== m.data.slice(0, 7)
      && JSON.stringify(extrairTelefoneMascarado(o.descricao)) === JSON.stringify(tel));
    if (iguais.length) resultados.get(m.id)!.observacoes.push('Sem submissão; pagamento mensal fixo');
  }

  return alvo.map(({ m }) => resultados.get(m.id)!);
}

/** Procura 2 a 4 submissões cuja soma dá exatamente `alvo` cêntimos (as mais antigas primeiro). */
function procurarSoma(subs: SubmissaoReembolso[], alvo: number): SubmissaoReembolso[] | null {
  const n = subs.length;
  const v = subs.map((s) => cent(s.valor));
  for (let k = 2; k <= 4; k++) {
    const idx: number[] = [];
    const rec = (inicio: number, soma: number): number[] | null => {
      if (idx.length === k) return soma === alvo ? [...idx] : null;
      for (let i = inicio; i < n; i++) {
        if (soma + v[i] > alvo) continue;
        idx.push(i);
        const r = rec(i + 1, soma + v[i]);
        if (r) return r;
        idx.pop();
      }
      return null;
    };
    const r = rec(0, 0);
    if (r) return r.map((i) => subs[i]);
  }
  return null;
}

/**
 * Relatório inverso: submissões fechadas, pagas por MB Way, com data de submissão no período do extrato,
 * que não ficaram associadas a nenhum movimento.
 */
export function relatorioInverso(subs: SubmissaoReembolso[], resultados: ResultadoReembolso[], periodo: { de: string; ate: string }, usados: Set<string> = new Set()): SubmissaoReembolso[] {
  const associadas = new Set([...usados, ...resultados.flatMap((r) => r.submissoes)]);
  return subs.filter((s) => norm(s.estado ?? '').trim() === 'fechado' && s.forma !== 'transferencia' && s.submetido >= periodo.de && s.submetido <= periodo.ate && !associadas.has(s.id))
    .sort((a, b) => a.submetido.localeCompare(b.submetido));
}
