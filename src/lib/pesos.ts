/**
 * Peso de cada comunidade na repartição dos gerais e da bolsa geral, gravado por mês (decisão do CAF, 25/11/2026).
 * Cada mês guarda a proposta original pelos dois métodos (média e mediana de jovens e adultos por celebração nos
 * últimos 12 meses), o método escolhido e o peso final, que o administrador pode alterar.
 */
import { collection, doc, getDocs, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { MetodoPeso } from './resumos';

export type { MetodoPeso };
export const NOME_METODO: Record<MetodoPeso, string> = { media: 'Média', mediana: 'Mediana' };

export interface PropostaComunidade { valor: number; pct: number }
export interface PesosMes {
  id: string; // AAAA-MM
  ano: number;
  mes: number;
  /** Método usado para o peso proposto (e gravado, se não foi alterado à mão). */
  metodo: MetodoPeso;
  /** Peso final de cada comunidade, em % (soma 100). É o que conta nos cálculos. */
  pesos: Record<string, number>;
  /** Proposta original, pelos dois métodos, para indicação e simulação. */
  proposta: { media: Record<string, PropostaComunidade>; mediana: Record<string, PropostaComunidade> };
  /** true quando o peso final foi alterado à mão (o recálculo dos pesos não o substitui). */
  manual: boolean;
  calculadoEm: string;
  gravadoPor: string;
  gravadoEm: string;
}

/** Como se mostra a tabela anual: peso em % ou pessoas (jovens e adultos por celebração) usadas na proposta. */
export type VistaPesos = 'pct' | 'pessoas';

/** Texto de uma célula da tabela anual, sem decimais; null quando o mês não tem valor para a comunidade. */
export function textoPeso(g: Pick<PesosMes, 'metodo' | 'pesos' | 'proposta'> | undefined, c: string, vista: VistaPesos): string | null {
  if (!g) return null;
  const v = vista === 'pct' ? g.pesos[c] : g.proposta?.[g.metodo]?.[c]?.valor;
  if (v == null || !Number.isFinite(v)) return null;
  const n = Math.round(v).toLocaleString('pt-PT');
  return vista === 'pct' ? `${n}%` : n;
}

/** Texto de uma célula pela proposta de um método (média ou mediana), sem decimais; null sem valor. */
export function textoProposta(prop: PesosMes['proposta'] | null | undefined, metodo: MetodoPeso, c: string, vista: VistaPesos): string | null {
  const x = prop?.[metodo]?.[c];
  const v = vista === 'pct' ? x?.pct : x?.valor;
  if (v == null || !Number.isFinite(v)) return null;
  const n = Math.round(v).toLocaleString('pt-PT');
  return vista === 'pct' ? `${n}%` : n;
}

/** Soma dos pesos (para validar 100 %). */
export const somaPesos = (p: Record<string, number>) => Math.round(Object.values(p).reduce((t, v) => t + (Number(v) || 0), 0) * 100) / 100;
/** Os pesos de um mês são válidos quando somam 100 % (com tolerância de arredondamento) e nenhum é negativo. */
export const pesosValidos = (p: Record<string, number>) => Math.abs(somaPesos(p) - 100) <= 0.05 && Object.values(p).every((v) => v >= 0);

/** Ajusta a última casa decimal para a soma dar exatamente 100 (o arredondamento vai para o maior peso). */
export function fecharEm100(p: Record<string, number>): Record<string, number> {
  const out = { ...p };
  const dif = Math.round((100 - somaPesos(out)) * 100) / 100;
  const maior = Object.entries(out).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (maior && dif && Math.abs(dif) < 1) out[maior] = Math.round((out[maior] + dif) * 100) / 100;
  return out;
}

/** Pesos por mês no formato do cálculo dos resumos (AAAA-MM → comunidade → %). */
export const pesosParaCalculo = (ps: PesosMes[]) => Object.fromEntries(ps.map((x) => [x.id, x.pesos]));

export async function listarPesos(ano: number): Promise<PesosMes[]> {
  const snap = await getDocs(query(collection(db, 'pesos'), where('ano', '==', ano)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PesosMes).sort((a, b) => a.mes - b.mes);
}
export const gravarPesosMes = (p: PesosMes) => setDoc(doc(db, 'pesos', p.id), p);
export async function gravarPesosVarios(ps: PesosMes[]) {
  const b = writeBatch(db);
  for (const p of ps) b.set(doc(db, 'pesos', p.id), p);
  await b.commit();
}
