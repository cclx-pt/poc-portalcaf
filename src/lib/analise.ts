/** Agregações para as páginas de análise (demonstração de resultados e comparação). Só leem resumos. */
import { r2 } from './format';
import { OUTROS_FUNCIONAMENTO, POR_CLASSIFICAR, RUBRICAS_ENTRADA, RUBRICAS_SAIDA } from './rubricas';
import type { Resumo, ResumoMes } from './types';

export type TipoDR = 'entrada' | 'saida';
export interface LinhaDR {
  tipo: TipoDR;
  rubrica: string;
  parte?: 'local' | 'geral';
  /** Valor por comunidadeId, mais 'cclx' com a soma de todos os resumos. */
  valores: Record<string, number>;
}

const noPeriodo = (r: Resumo, de: number, ate: number) => r.meses.filter((x) => x.mes >= de && x.mes <= ate);
const rub = (x: ResumoMes, tipo: TipoDR) => x.rubricas?.[tipo] ?? {};

/** Rubricas de um tipo, pela ordem do desenho, mais as que aparecerem nos dados (ex.: Outros custos de funcionamento). */
function ordemRubricas(resumos: Resumo[], tipo: TipoDR): string[] {
  const legado: string[] = [...(tipo === 'entrada' ? RUBRICAS_ENTRADA : RUBRICAS_SAIDA)];
  const presentes = new Set<string>();
  for (const r of resumos) for (const x of r.meses) for (const k of Object.keys(rub(x, tipo))) presentes.add(k);
  // Com o plano financeiro, as rubricas têm código (01…, R1…) e ordenam-se por ele; o desenho antigo só se usa se os dados o tiverem.
  const base = !presentes.size || legado.some((b) => presentes.has(b)) ? legado : [];
  const ultimo = (k: string) => (k === POR_CLASSIFICAR ? 2 : k === OUTROS_FUNCIONAMENTO ? 1 : 0);
  const extras = [...presentes].filter((k) => !base.includes(k)).sort((a, b) => ultimo(a) - ultimo(b) || a.localeCompare(b, 'pt'));
  return [...base, ...extras];
}

/** Linhas da demonstração de resultados para os meses de `de` a `ate`. */
export function linhasDR(resumos: Resumo[], de: number, ate: number, separar: boolean): LinhaDR[] {
  const out: LinhaDR[] = [];
  for (const tipo of ['entrada', 'saida'] as const) {
    for (const rubrica of ordemRubricas(resumos, tipo)) {
      const partes = separar ? (['local', 'geral'] as const) : [undefined];
      for (const parte of partes) {
        const valores: Record<string, number> = { cclx: 0 };
        for (const r of resumos) {
          let v = 0;
          for (const x of noPeriodo(r, de, ate)) {
            const p = rub(x, tipo)[rubrica];
            if (p) v += parte ? p[parte] : p.local + p.geral;
          }
          valores[r.comunidadeId] = r2(v);
          valores.cclx = r2(valores.cclx + v);
        }
        out.push({ tipo, rubrica, ...(parte ? { parte } : {}), valores });
      }
    }
  }
  return out;
}

export interface TotaisPeriodo {
  entradas: number;
  saidas: number;
  resultado: number;
  geralEntradas: number;
  geralSaidas: number;
  dizimos: number;
  /** Média de jovens e adultos por registo nos meses do período com assistência. */
  adultosMedia: number | null;
}

export function totaisPeriodo(r: Resumo, de: number, ate: number): TotaisPeriodo {
  const xs = noPeriodo(r, de, ate);
  const s = (f: (x: ResumoMes) => number) => r2(xs.reduce((t, x) => t + (f(x) || 0), 0));
  const comAss = xs.filter((x) => x.adultosMedia != null);
  const entradas = s((x) => x.entradas);
  const saidas = s((x) => x.saidas);
  return {
    entradas,
    saidas,
    resultado: r2(entradas - saidas),
    geralEntradas: s((x) => x.geralEntradas ?? 0),
    geralSaidas: s((x) => x.geralSaidas ?? 0),
    dizimos: s((x) => { const p = rub(x, 'entrada')['Dízimos']; return p ? p.local + p.geral : 0; }),
    adultosMedia: comAss.length ? r2(comAss.reduce((t, x) => t + (x.adultosMedia ?? 0), 0) / comAss.length) : null,
  };
}
