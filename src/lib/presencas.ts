/**
 * Registo de presenças feito no portal (equivalente ao formulário Jotform "CCLX : Registo de Presenças").
 * Os registos entram nos mesmos lotes mensais da origem "assistencia", para o mapa, as médias e os domingos
 * em falta funcionarem sem distinção entre Jotform e portal.
 */
import { norm, periodo, r2 } from './format';
import type { Comunidade, Lote, Registo } from './types';
import { IDS_BASE, descreverDias, type EventoConfig } from './eventos';

/** Tipos de evento do formulário Jotform; a lista configurada pode alterá-los. */
export const EVENTOS_INICIAIS = ['Celebração Domingo', 'Reunião Oração', 'ATOS', 'Outra'];
/** Prefixo dos IDs dos registos feitos no portal (distingue-os das submissões Jotform). */
export const ID_PORTAL = 'portal-';
export const eRegistoDoPortal = (r: Pick<Registo, 'id'>) => r.id.startsWith(ID_PORTAL);

/** Comunidades onde o utilizador pode registar e consultar presenças: ativas, não especiais e dentro do seu âmbito ('*' = todas). */
export function comunidadesDoUtilizador<C extends Pick<Comunidade, 'id' | 'especial' | 'ativo'>>(todas: C[], ambito: string[]): C[] {
  const tudo = ambito.includes('*');
  return todas.filter((c) => !c.especial && c.ativo !== false && (tudo || ambito.includes(c.id)));
}

export interface EntradaPresenca {
  data: string; // AAAA-MM-DD
  evento: string;
  descricao?: string; // obrigatória quando o evento é "Outra"
  comunidadeId: string;
  adultos: number; // jovens e adultos
  jump: number; // 12-14
  criancas: number; // 3-11
  connects: number;
  /** Contagens acrescentadas na configuração (ex.: online), por id. */
  outras?: Record<string, number>;
  observacoes?: string;
}

const inteiro = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** Devolve a mensagem de erro ou null. `existentes` serve para avisar de duplicados (mesmo dia, evento e comunidade). */
export function validarPresenca(e: EntradaPresenca, hoje: string, existentes: Lote[] = [], ignorarId?: string, evento?: EventoConfig, nomes: Record<string, string> = {}): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.data)) return 'Indique a data do evento.';
  if (e.data > hoje) return 'A data não pode ser futura.';
  if (!e.evento?.trim()) return 'Escolha o evento.';
  if (evento?.dias.length && !evento.dias.includes(new Date(`${e.data}T12:00:00Z`).getUTCDay())) return `"${evento.nome}" só ocorre: ${descreverDias(evento.dias).toLowerCase()}.`;
  if ((evento ? evento.pedeDescricao : norm(e.evento) === 'outra') && !e.descricao?.trim()) return 'Indique a descrição do evento.';
  if (!e.comunidadeId) return 'Escolha a comunidade.';
  const base: Record<string, [number, string, string]> = { adultos: [e.adultos, 'jovens e adultos', 'Jovens e adultos'], jump: [e.jump, 'Jump (12-14)', 'Jump (12-14)'], criancas: [e.criancas, 'crianças (3-11)', 'Crianças (3-11)'], connects: [e.connects, "Connect's", "Connect's"] };
  const pedidas = evento ? evento.contagens : IDS_BASE;
  const campos = pedidas.map((id) => base[id] ?? [e.outras?.[id] ?? NaN, nomes[id] ?? id, nomes[id] ?? id] as [number, string, string]);
  for (const [v, nome] of campos) if (v == null || Number.isNaN(v)) return `Indique o número de ${nome} (0 se não houve).`;
  for (const [v, , rot] of campos) if (!inteiro(v)) return `${rot}: número inteiro, 0 ou mais.`;
  const duplicado = existentes.some((l) => l.comunidadeId === e.comunidadeId && l.registos.some((r) => r.id !== ignorarId && r.data === e.data && norm(r.evento ?? '') === norm(e.evento)));
  if (duplicado) return `Já existe um registo de "${e.evento}" nesta comunidade em ${e.data.split('-').reverse().join('/')}. ${ignorarId ? 'Corrija esse registo em vez deste.' : 'Apague-o primeiro se quiser substituí-lo.'}`;
  return null;
}

export function novoRegistoPresenca(e: EntradaPresenca, quem: string): Registo {
  const id = `${ID_PORTAL}${e.data}-${norm(e.evento).replace(/\s+/g, '-')}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const z = (v: number) => (Number.isNaN(v) ? 0 : v); // contagens que o evento não recolhe ficam a 0
  const r: Registo = { id, data: e.data, valor: z(e.adultos), categoria: 'Assistência', evento: e.evento.trim(), extra: { jump: z(e.jump), criancas: z(e.criancas), connects: z(e.connects), ...soNumeros(e.outras), registadoPor: quem } };
  if (e.descricao?.trim()) r.descricao = e.descricao.trim();
  if (e.observacoes?.trim()) r.extra!.observacoes = e.observacoes.trim();
  return r;
}

function soNumeros(o?: Record<string, number>) {
  return Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => Number.isFinite(v)));
}

/** Lote mensal (origem assistencia) da comunidade com o registo acrescentado; cria o lote se não existir. */
export function acrescentarRegisto(lote: Lote | undefined, r: Registo, quem: string, comunidadeId = lote?.comunidadeId ?? ''): Lote {
  const ano = Number(r.data.slice(0, 4));
  const mes = Number(r.data.slice(5, 7));
  const base: Lote = lote ?? { id: '', origem: 'assistencia', ano, mes, periodo: periodo(ano, mes), comunidadeId, registos: [], total: 0, n: 0, atualizadoEm: '', atualizadoPor: '' };
  const registos = [...base.registos.filter((x) => x.id !== r.id), r].sort((a, b) => a.data.localeCompare(b.data));
  return { ...base, id: base.id || `assistencia_${ano}_${String(mes).padStart(2, '0')}_${comunidadeId}`, registos, total: r2(registos.reduce((s, x) => s + x.valor, 0)), n: registos.length, atualizadoEm: new Date().toISOString(), atualizadoPor: quem };
}

export function removerRegisto(lote: Lote, id: string): Lote {
  const registos = lote.registos.filter((x) => x.id !== id);
  // Registo vindo do Jotform: guarda o id, para a sincronização não o voltar a importar.
  const apagados = eRegistoDoPortal({ id }) ? lote.apagados : [...new Set([...(lote.apagados ?? []), id])];
  return { ...lote, registos, total: r2(registos.reduce((s, x) => s + x.valor, 0)), n: registos.length, atualizadoEm: new Date().toISOString(), ...(apagados?.length ? { apagados } : {}) };
}

// ---------- correção de registos anteriores (do portal ou do Jotform) ----------
/** Registo corrigido no portal: a releitura completa do Jotform mantém a correção. */
export const eCorrigido = (r: Pick<Registo, 'extra'>) => !!r.extra?.alteradoEm;

const n0 = (v: unknown) => (v == null || v === '' ? 0 : Number(v));

/** Valores do registo no formato do formulário (campos em falta no Jotform contam 0). */
export function entradaDeRegisto(r: Registo, comunidadeId: string, idsExtra: string[] = []): EntradaPresenca {
  const outras = Object.fromEntries(idsExtra.filter((id) => r.extra?.[id] != null).map((id) => [id, n0(r.extra?.[id])]));
  return {
    ...(Object.keys(outras).length ? { outras } : {}),
    data: r.data, evento: r.evento ?? '', descricao: r.descricao ?? '', comunidadeId,
    adultos: n0(r.valor), jump: n0(r.extra?.jump), criancas: n0(r.extra?.criancas), connects: n0(r.extra?.connects),
    observacoes: String(r.extra?.observacoes ?? ''),
  };
}

const ROTULOS: [keyof EntradaPresenca, string][] = [
  ['data', 'Data'], ['evento', 'Evento'], ['descricao', 'Descrição'], ['adultos', 'Jovens e adultos'],
  ['jump', 'Jump (12-14)'], ['criancas', 'Crianças (3-11)'], ['connects', "Connect's"], ['observacoes', 'Observações'],
];

/**
 * Corrige um registo do lote, no mesmo mês e comunidade. Guarda em extra quem e quando alterou.
 * Devolve o lote atualizado e a descrição das alterações (para a auditoria). Lança erro se for inválido.
 */
export function corrigirRegisto(lote: Lote, id: string, e: EntradaPresenca, quem: string, hoje: string, agora = new Date().toISOString(), evento?: EventoConfig, nomes: Record<string, string> = {}) {
  const antigo = lote.registos.find((x) => x.id === id);
  if (!antigo) throw new Error('Registo não encontrado (pode ter sido apagado entretanto).');
  if (e.data.slice(0, 7) !== antigo.data.slice(0, 7)) throw new Error('A data corrigida tem de ficar no mesmo mês. Para outro mês, registe de novo e peça para apagar este.');
  const erro = validarPresenca({ ...e, comunidadeId: lote.comunidadeId }, hoje, [lote], id, evento, nomes);
  if (erro) throw new Error(erro);
  const idsOutras = [...new Set([...Object.keys(e.outras ?? {})])];
  const antes = entradaDeRegisto(antigo, lote.comunidadeId, idsOutras);
  const texto = (k: keyof EntradaPresenca, v: unknown) => {
    const t = typeof v === 'string' ? v.trim() : String(v ?? '');
    return t === '' ? '(vazio)' : k === 'data' ? t.split('-').reverse().join('/') : t;
  };
  const alteracoes = ROTULOS.filter(([k]) => texto(k, antes[k]) !== texto(k, e[k]))
    .map(([k, rot]) => `${rot}: ${texto(k, antes[k])} → ${texto(k, e[k])}`)
    .concat(idsOutras.filter((k) => String(antes.outras?.[k] ?? '') !== String(e.outras?.[k] ?? '')).map((k) => `${nomes[k] ?? k}: ${antes.outras?.[k] ?? '(vazio)'} → ${e.outras?.[k] ?? '(vazio)'}`))
    .join('; ');
  if (!alteracoes) throw new Error('Não há alterações para guardar.');
  const z = (v: number) => (Number.isNaN(v) ? 0 : v);
  const extra: NonNullable<Registo['extra']> = { ...(antigo.extra ?? {}), jump: z(e.jump), criancas: z(e.criancas), connects: z(e.connects), ...soNumeros(e.outras), alteradoPor: quem, alteradoEm: agora };
  if (e.observacoes?.trim()) extra.observacoes = e.observacoes.trim(); else delete extra.observacoes;
  const novo: Registo = { ...antigo, data: e.data, valor: z(e.adultos), evento: e.evento.trim(), extra };
  if (e.descricao?.trim()) novo.descricao = e.descricao.trim(); else delete novo.descricao;
  const registos = lote.registos.map((x) => (x.id === id ? novo : x)).sort((a, b) => a.data.localeCompare(b.data));
  return {
    lote: { ...lote, registos, total: r2(registos.reduce((s, x) => s + x.valor, 0)), n: registos.length, atualizadoEm: agora, atualizadoPor: quem },
    alteracoes,
  };
}

/** Filtros da lista de registos: comunidade, intervalo de datas (AAAA-MM-DD), tipo de culto/evento e só duplicados. */
export interface FiltroPresencas { comunidadeId?: string; de?: string; ate?: string; evento?: string; soDuplicados?: boolean }

/** Registos duplicados: mais do que um registo da mesma comunidade, no mesmo dia e com o mesmo evento. Devolve os ids. */
export function duplicadosPresenca(lotes: Lote[]): Set<string> {
  const g = new Map<string, string[]>();
  for (const l of lotes) for (const r of l.registos) {
    const k = `${l.comunidadeId}|${r.data}|${norm(r.evento ?? '')}`;
    g.set(k, [...(g.get(k) ?? []), r.id]);
  }
  return new Set([...g.values()].filter((ids) => ids.length > 1).flat());
}

export function filtrarLotesPresenca(lotes: Lote[], f: FiltroPresencas): Lote[] {
  const dup = f.soDuplicados ? duplicadosPresenca(lotes) : null;
  return lotes
    .filter((l) => !f.comunidadeId || f.comunidadeId === 'todas' || l.comunidadeId === f.comunidadeId)
    .map((l) => ({ ...l, registos: l.registos.filter((r) => (!f.de || r.data >= f.de) && (!f.ate || r.data <= f.ate) && (!f.evento || norm(r.evento ?? '') === norm(f.evento)) && (!dup || dup.has(r.id))) }))
    .filter((l) => l.registos.length);
}

/**
 * Uma ocorrência de um evento (ex.: a celebração de um domingo) junta os registos com a mesma data e o mesmo evento
 * (de várias comunidades). As médias "por domingo/evento" usam ocorrências, não registos.
 */
export function ocorrenciasDeEvento<T extends { data: string; evento: string }, K extends keyof T & string>(linhas: T[], campos: K[]) {
  const g = new Map<string, { data: string; evento: string; registos: number } & Record<K, number>>();
  for (const l of linhas) {
    const k = `${l.data}|${norm(l.evento)}`;
    let o = g.get(k);
    if (!o) { o = { data: l.data, evento: l.evento, registos: 0, ...Object.fromEntries(campos.map((c) => [c, 0])) } as { data: string; evento: string; registos: number } & Record<K, number>; g.set(k, o); }
    o.registos++;
    for (const c of campos) (o as Record<string, number>)[c] += Number(l[c]) || 0;
  }
  return [...g.values()].sort((a, b) => a.data.localeCompare(b.data) || a.evento.localeCompare(b.evento));
}

/** Valor de uma contagem num registo (adultos = valor; as outras em extra). */
const valorContagem = (r: Registo, id: string) => (id === 'adultos' ? r.valor : r.extra?.[id]);

/** Auditoria dos eventos: registos com o evento, último registo e quantos têm cada contagem preenchida (> 0). */
export function auditoriaEventos(eventos: Pick<EventoConfig, 'id' | 'nome' | 'contagens'>[], lotes: Lote[]) {
  const out: Record<string, { registos: number; ultimo: string | null; porContagem: Record<string, number> }> = {};
  for (const e of eventos) {
    const regs = lotes.flatMap((l) => l.registos).filter((r) => norm(r.evento ?? '') === norm(e.nome));
    out[e.id] = {
      registos: regs.length,
      ultimo: regs.reduce<string | null>((m, r) => (!m || r.data > m ? r.data : m), null),
      porContagem: Object.fromEntries(e.contagens.map((id) => [id, regs.filter((r) => Number(valorContagem(r, id)) > 0).length])),
    };
  }
  return out;
}

/** Campo do formulário de presenças a que se refere uma mensagem de `validarPresenca` (para o destacar e pôr lá o cursor). */
export function campoDoErroPresenca(texto: string, nomes: Record<string, string> = {}): string | null {
  const t = norm(texto);
  if (!t) return null;
  if (/descricao/.test(t)) return 'descricao';
  if (/comunidade/.test(t) && /escolha/.test(t)) return 'comunidade';
  if (/evento/.test(t) && /escolha/.test(t) || /so ocorre/.test(t)) return 'evento';
  if (/\bdata\b|ja existe um registo/.test(t)) return 'data';
  const contagens: [string, RegExp][] = [['adultos', /jovens e adultos/], ['jump', /jump/], ['criancas', /criancas/], ['connects', /connect/],
    ...Object.entries(nomes).map(([id, nome]) => [id, new RegExp(norm(nome).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))] as [string, RegExp])];
  for (const [id, re] of contagens) if (re.test(t)) return id;
  return null;
}
