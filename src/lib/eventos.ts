/**
 * Configuração dos eventos do registo de presenças, ao estilo Church Metrics:
 * cada evento tem nome, descrição, as contagens que recolhe, os dias da semana e o horário.
 * Sem configuração, os eventos derivam da lista antiga (config/assistencia.eventos), com todas as contagens.
 */
import { norm, slug } from './format';
import type { ConfigAssistencia } from './types';

/** O que se conta num registo (as "categorias" do Church Metrics). */
export interface Contagem { id: string; nome: string }

/** Contagens base: as do formulário Jotform. "adultos" (jovens e adultos) é a base das médias e da repartição dos gerais. */
export const CONTAGENS_BASE: Contagem[] = [
  { id: 'adultos', nome: 'Jovens e adultos' },
  { id: 'jump', nome: 'Jump (12-14)' },
  { id: 'criancas', nome: 'Crianças (3-11)' },
  { id: 'connects', nome: "Connect's (antigos VIP's)" },
];
export const IDS_BASE = CONTAGENS_BASE.map((c) => c.id);

export type Horario = { diaTodo: true } | { diaTodo: false; inicio: string; fim?: string };

export interface EventoConfig {
  id: string;
  nome: string;
  descricao?: string;
  ativo: boolean;
  /** IDs das contagens recolhidas (do catálogo). */
  contagens: string[];
  /** Dias da semana (0 = domingo … 6 = sábado). Vazio = qualquer dia. */
  dias: number[];
  horario: Horario;
  /** O registo pede uma descrição (ex.: "Outra"). */
  pedeDescricao?: boolean;
}

export const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const EVENTOS_ANTIGOS = ['Celebração Domingo', 'Reunião Oração', 'ATOS', 'Outra'];

/** Catálogo de contagens: as base e as acrescentadas na configuração. */
export function catalogoContagens(cfg?: Pick<ConfigAssistencia, 'contagens'> | null): Contagem[] {
  const extra = (cfg?.contagens ?? []).filter((c) => !IDS_BASE.includes(c.id));
  return [...CONTAGENS_BASE, ...extra];
}

/** Eventos em vigor: os configurados ou, sem configuração, os derivados da lista antiga. */
export function eventosEfetivos(cfg?: Partial<ConfigAssistencia> | null): EventoConfig[] {
  if (cfg?.eventosConfig?.length) return cfg.eventosConfig;
  const nomes = cfg?.eventos?.length ? cfg.eventos : EVENTOS_ANTIGOS;
  const celebracao = cfg?.eventoCelebracao ?? 'Celebração Domingo';
  return nomes.map((nome) => ({
    id: slug(nome), nome, ativo: true, contagens: [...IDS_BASE],
    dias: norm(nome) === norm(celebracao) ? [0] : [],
    horario: { diaTodo: true },
    ...(norm(nome) === 'outra' ? { pedeDescricao: true } : {}),
  }));
}

const diaDaSemana = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

/** Eventos ativos que ocorrem no dia da semana da data (sem data: todos os ativos). */
export function eventosParaData(eventos: EventoConfig[], data: string): EventoConfig[] {
  const ativos = eventos.filter((e) => e.ativo);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return ativos;
  const d = diaDaSemana(data);
  return ativos.filter((e) => !e.dias.length || e.dias.includes(d));
}

/** Evento com este nome (sem distinguir maiúsculas e acentos). */
export const eventoPorNome = (eventos: EventoConfig[], nome: string) => eventos.find((e) => norm(e.nome) === norm(nome));

/** "Domingo", "Terça e quinta", "Segunda, quarta e sexta". */
export function descreverDias(dias: number[]): string {
  if (!dias.length) return 'Qualquer dia';
  const n = [...dias].sort((a, b) => a - b).map((d, i) => (i === 0 ? DIAS_SEMANA[d] : DIAS_SEMANA[d].toLowerCase()));
  return n.length === 1 ? n[0] : `${n.slice(0, -1).join(', ')} e ${n[n.length - 1]}`;
}

/** "Domingo · 10:30–12:30", "Qualquer dia · dia todo". */
export function descreverQuando(e: Pick<EventoConfig, 'dias' | 'horario'>): string {
  const h = e.horario.diaTodo ? 'dia todo' : `${e.horario.inicio}${e.horario.fim ? `–${e.horario.fim}` : ''}`;
  return `${descreverDias(e.dias)} · ${h}`;
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Mensagem de erro ou null. `existentes` serve para não repetir nomes. */
export function validarEvento(e: EventoConfig, existentes: EventoConfig[]): string | null {
  if (!e.nome.trim()) return 'Indique o nome do evento.';
  if (existentes.some((x) => x.id !== e.id && norm(x.nome) === norm(e.nome))) return `Já existe um evento "${e.nome.trim()}".`;
  if (!e.contagens.length) return 'Escolha pelo menos uma contagem a recolher.';
  if (e.dias.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return 'Dias da semana inválidos.';
  if (!e.horario.diaTodo) {
    if (!HORA.test(e.horario.inicio)) return 'Indique a hora de início (hh:mm).';
    if (e.horario.fim && !HORA.test(e.horario.fim)) return 'A hora de fim não é válida (hh:mm).';
    if (e.horario.fim && e.horario.fim <= e.horario.inicio) return 'A hora de fim tem de ser depois da de início.';
  }
  return null;
}
