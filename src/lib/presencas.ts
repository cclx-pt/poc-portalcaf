/**
 * Registo de presenças feito no portal (equivalente ao formulário Jotform "CCLX : Registo de Presenças").
 * Os registos entram nos mesmos lotes mensais da origem "assistencia", para o mapa, as médias e os domingos
 * em falta funcionarem sem distinção entre Jotform e portal.
 */
import { norm, periodo, r2 } from './format';
import type { Comunidade, Lote, Registo } from './types';

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
  observacoes?: string;
}

const inteiro = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** Devolve a mensagem de erro ou null. `existentes` serve para avisar de duplicados (mesmo dia, evento e comunidade). */
export function validarPresenca(e: EntradaPresenca, hoje: string, existentes: Lote[] = [], ignorarId?: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.data)) return 'Indique a data do evento.';
  if (e.data > hoje) return 'A data não pode ser futura.';
  if (!e.evento?.trim()) return 'Escolha o evento.';
  if (norm(e.evento) === 'outra' && !e.descricao?.trim()) return 'Indique a descrição do evento.';
  if (!e.comunidadeId) return 'Escolha a comunidade.';
  const campos: [number, string, string][] = [[e.adultos, 'jovens e adultos', 'Jovens e adultos'], [e.jump, 'Jump (12-14)', 'Jump (12-14)'], [e.criancas, 'crianças (3-11)', 'Crianças (3-11)'], [e.connects, "Connect's", "Connect's"]];
  for (const [v, nome] of campos) if (v == null || Number.isNaN(v)) return `Indique o número de ${nome} (0 se não houve).`;
  if (!inteiro(e.adultos)) return 'Jovens e adultos: número inteiro, 0 ou mais.';
  if (!inteiro(e.jump)) return 'Jump (12-14): número inteiro, 0 ou mais.';
  if (!inteiro(e.criancas)) return 'Crianças (3-11): número inteiro, 0 ou mais.';
  if (!inteiro(e.connects)) return "Connect's: número inteiro, 0 ou mais.";
  const duplicado = existentes.some((l) => l.comunidadeId === e.comunidadeId && l.registos.some((r) => r.id !== ignorarId && r.data === e.data && norm(r.evento ?? '') === norm(e.evento)));
  if (duplicado) return `Já existe um registo de "${e.evento}" nesta comunidade em ${e.data.split('-').reverse().join('/')}. ${ignorarId ? 'Corrija esse registo em vez deste.' : 'Apague-o primeiro se quiser substituí-lo.'}`;
  return null;
}

export function novoRegistoPresenca(e: EntradaPresenca, quem: string): Registo {
  const id = `${ID_PORTAL}${e.data}-${norm(e.evento).replace(/\s+/g, '-')}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const r: Registo = { id, data: e.data, valor: e.adultos, categoria: 'Assistência', evento: e.evento.trim(), extra: { jump: e.jump, criancas: e.criancas, connects: e.connects, registadoPor: quem } };
  if (e.descricao?.trim()) r.descricao = e.descricao.trim();
  if (e.observacoes?.trim()) r.extra!.observacoes = e.observacoes.trim();
  return r;
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
  return { ...lote, registos, total: r2(registos.reduce((s, x) => s + x.valor, 0)), n: registos.length, atualizadoEm: new Date().toISOString() };
}

// ---------- correção de registos anteriores (do portal ou do Jotform) ----------
/** Registo corrigido no portal: a releitura completa do Jotform mantém a correção. */
export const eCorrigido = (r: Pick<Registo, 'extra'>) => !!r.extra?.alteradoEm;

const n0 = (v: unknown) => (v == null || v === '' ? 0 : Number(v));

/** Valores do registo no formato do formulário (campos em falta no Jotform contam 0). */
export function entradaDeRegisto(r: Registo, comunidadeId: string): EntradaPresenca {
  return {
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
export function corrigirRegisto(lote: Lote, id: string, e: EntradaPresenca, quem: string, hoje: string, agora = new Date().toISOString()) {
  const antigo = lote.registos.find((x) => x.id === id);
  if (!antigo) throw new Error('Registo não encontrado (pode ter sido apagado entretanto).');
  if (e.data.slice(0, 7) !== antigo.data.slice(0, 7)) throw new Error('A data corrigida tem de ficar no mesmo mês. Para outro mês, registe de novo e peça para apagar este.');
  const erro = validarPresenca({ ...e, comunidadeId: lote.comunidadeId }, hoje, [lote], id);
  if (erro) throw new Error(erro);
  const antes = entradaDeRegisto(antigo, lote.comunidadeId);
  const texto = (k: keyof EntradaPresenca, v: unknown) => {
    const t = typeof v === 'string' ? v.trim() : String(v ?? '');
    return t === '' ? '(vazio)' : k === 'data' ? t.split('-').reverse().join('/') : t;
  };
  const alteracoes = ROTULOS.filter(([k]) => texto(k, antes[k]) !== texto(k, e[k]))
    .map(([k, rot]) => `${rot}: ${texto(k, antes[k])} → ${texto(k, e[k])}`).join('; ');
  if (!alteracoes) throw new Error('Não há alterações para guardar.');
  const extra: NonNullable<Registo['extra']> = { ...(antigo.extra ?? {}), jump: e.jump, criancas: e.criancas, connects: e.connects, alteradoPor: quem, alteradoEm: agora };
  if (e.observacoes?.trim()) extra.observacoes = e.observacoes.trim(); else delete extra.observacoes;
  const novo: Registo = { ...antigo, data: e.data, valor: e.adultos, evento: e.evento.trim(), extra };
  if (e.descricao?.trim()) novo.descricao = e.descricao.trim(); else delete novo.descricao;
  const registos = lote.registos.map((x) => (x.id === id ? novo : x)).sort((a, b) => a.data.localeCompare(b.data));
  return {
    lote: { ...lote, registos, total: r2(registos.reduce((s, x) => s + x.valor, 0)), n: registos.length, atualizadoEm: agora, atualizadoPor: quem },
    alteracoes,
  };
}
