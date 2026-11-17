/**
 * Rascunhos de registos de presenças, guardados no dispositivo (localStorage) a cada contagem,
 * para não se perderem se a página fechar a meio da contagem. Por utilizador; apagam-se ao gravar o registo.
 */
import { slug } from './format';
import type { EntradaPresenca } from './presencas';

export type Armazem = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface Rascunho { id: string; entrada: EntradaPresenca; atualizadoEm: string }

const chave = (email: string) => `caf-portal:rascunhos-presencas:${email.toLowerCase()}`;
const NUMEROS = ['adultos', 'jump', 'criancas', 'connects'] as const;

/** Um rascunho por comunidade, data e evento. */
export const idRascunho = (e: Pick<EntradaPresenca, 'comunidadeId' | 'data' | 'evento'>) => `${e.comunidadeId}_${e.data}_${slug(e.evento)}`;

const temValor = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

/** Guarda-se quando já há data, evento e comunidade e começou a contagem (ou há observações). */
export function deveGuardarRascunho(e: EntradaPresenca): boolean {
  if (!e.data || !e.evento || !e.comunidadeId) return false;
  return NUMEROS.some((k) => temValor(e[k])) || Object.values(e.outras ?? {}).some(temValor) || !!e.observacoes?.trim();
}

/** Os campos vazios (NaN) vão para JSON como null; voltam a ser NaN. */
function reviver(e: EntradaPresenca): EntradaPresenca {
  const x = { ...e };
  for (const k of NUMEROS) if (!temValor(x[k])) x[k] = NaN;
  if (x.outras) x.outras = Object.fromEntries(Object.entries(x.outras).map(([k, v]) => [k, temValor(v) ? v : NaN]));
  return x;
}

/** Rascunhos do utilizador, o mais recente primeiro. */
export function lerRascunhos(s: Armazem | undefined, email: string): Rascunho[] {
  if (!s) return [];
  try {
    const lista = JSON.parse(s.getItem(chave(email)) ?? '[]') as Rascunho[];
    if (!Array.isArray(lista)) return [];
    return lista.filter((r) => r?.id && r.entrada).map((r) => ({ ...r, entrada: reviver(r.entrada) }))
      .sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
  } catch { return []; }
}

function escrever(s: Armazem, email: string, lista: Rascunho[]) {
  try {
    if (lista.length) s.setItem(chave(email), JSON.stringify(lista));
    else s.removeItem(chave(email));
  } catch { /* armazenamento indisponível ou cheio: o rascunho é uma ajuda, não é essencial */ }
}

export function guardarRascunho(s: Armazem | undefined, email: string, e: EntradaPresenca, agora = new Date().toISOString()) {
  if (!s) return;
  const id = idRascunho(e);
  escrever(s, email, [{ id, entrada: e, atualizadoEm: agora }, ...lerRascunhos(s, email).filter((r) => r.id !== id)].slice(0, 20));
}

export function apagarRascunho(s: Armazem | undefined, email: string, id: string) {
  if (!s) return;
  escrever(s, email, lerRascunhos(s, email).filter((r) => r.id !== id));
}

/** localStorage, se existir e funcionar. */
export function armazemLocal(): Armazem | undefined {
  try { return typeof window !== 'undefined' && window.localStorage ? window.localStorage : undefined; } catch { return undefined; }
}
