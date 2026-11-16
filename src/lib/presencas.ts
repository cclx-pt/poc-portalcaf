/**
 * Registo de presenças feito no portal (equivalente ao formulário Jotform "CCLX : Registo de Presenças").
 * Os registos entram nos mesmos lotes mensais da origem "assistencia", para o mapa, as médias e os domingos
 * em falta funcionarem sem distinção entre Jotform e portal.
 */
import { norm, periodo, r2 } from './format';
import type { Lote, Registo } from './types';

/** Tipos de evento do formulário Jotform; a lista configurada pode alterá-los. */
export const EVENTOS_INICIAIS = ['Celebração Domingo', 'Reunião Oração', 'ATOS', 'Outra'];
/** Prefixo dos IDs dos registos feitos no portal (distingue-os das submissões Jotform). */
export const ID_PORTAL = 'portal-';
export const eRegistoDoPortal = (r: Pick<Registo, 'id'>) => r.id.startsWith(ID_PORTAL);

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
export function validarPresenca(e: EntradaPresenca, hoje: string, existentes: Lote[] = []): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.data)) return 'Indique a data do evento.';
  if (e.data > hoje) return 'A data não pode ser futura.';
  if (!e.evento?.trim()) return 'Escolha o evento.';
  if (norm(e.evento) === 'outra' && !e.descricao?.trim()) return 'Indique a descrição do evento.';
  if (!e.comunidadeId) return 'Escolha a comunidade.';
  if (!inteiro(e.adultos)) return 'Jovens e adultos: número inteiro, 0 ou mais.';
  if (!inteiro(e.jump)) return 'Jump (12-14): número inteiro, 0 ou mais.';
  if (!inteiro(e.criancas)) return 'Crianças (3-11): número inteiro, 0 ou mais.';
  if (!inteiro(e.connects)) return "Connect's: número inteiro, 0 ou mais.";
  const duplicado = existentes.some((l) => l.comunidadeId === e.comunidadeId && l.registos.some((r) => r.data === e.data && norm(r.evento ?? '') === norm(e.evento)));
  if (duplicado) return `Já existe um registo de "${e.evento}" nesta comunidade em ${e.data.split('-').reverse().join('/')}. Apague-o primeiro se quiser substituí-lo.`;
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
