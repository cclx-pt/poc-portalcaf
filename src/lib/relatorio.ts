/** Agregações do relatório custos x entradas (por comunidade ou CCLX), a partir dos resumos. */
import { r2 } from './format';
import { partesMes } from './resumos';
import type { Resumo } from './types';

export interface MesRelatorio {
  mes: number;
  entradas: number;
  custosFixos: number;
  despesas: number;
  gerais: number;
  saidas: number;
  saldo: number;
  saldoAcumulado: number;
  /** Soma das médias de jovens e adultos das comunidades nesse mês (domingos). */
  adultosMedia: number | null;
}

/** Meses 1..ate somados sobre os resumos dados, com saldo acumulado. */
export function mesesDoRelatorio(resumos: Resumo[], ate: number): MesRelatorio[] {
  let acc = 0;
  return Array.from({ length: Math.max(0, ate) }, (_, i) => {
    const xs = resumos.map((r) => r.meses[i]).filter(Boolean);
    const ps = xs.map(partesMes);
    const s = (f: (p: ReturnType<typeof partesMes>) => number) => r2(ps.reduce((t, p) => t + f(p), 0));
    const comA = xs.filter((x) => x.adultosMedia != null);
    const saldo = s((p) => p.saldo);
    acc = r2(acc + saldo);
    return {
      mes: i + 1,
      entradas: s((p) => p.entradas),
      custosFixos: s((p) => p.custosFixos),
      despesas: s((p) => p.despesas),
      gerais: s((p) => p.gerais),
      saidas: r2(xs.reduce((t, x) => t + x.saidas, 0)),
      saldo,
      saldoAcumulado: acc,
      adultosMedia: comA.length ? r2(comA.reduce((t, x) => t + (x.adultosMedia ?? 0), 0)) : null,
    };
  });
}

export interface ResumoAnual {
  meses: number;
  entradas: number;
  contribuir: number;
  coletas: number;
  /** Transferências, quota da bolsa geral e parte dos gerais (líquidas). */
  outrasEntradas: number;
  custosFixos: number;
  despesas: number;
  gerais: number;
  saidas: number;
  resultado: number;
  cobertura: number | null;
  mediaMensalEntradas: number;
  adultosMedia: number | null;
}

export function resumoAnual(resumos: Resumo[], ate: number): ResumoAnual {
  const ms = mesesDoRelatorio(resumos, ate);
  const soma = (f: (m: MesRelatorio) => number) => r2(ms.reduce((t, m) => t + f(m), 0));
  const somaR = (k: 'contribuir' | 'coletas') => r2(resumos.reduce((t, r) => t + r.meses.slice(0, ate).reduce((u, x) => u + (x[k] ?? 0), 0), 0));
  const entradas = soma((m) => m.entradas);
  const saidas = soma((m) => m.saidas);
  const contribuir = somaR('contribuir');
  const coletas = somaR('coletas');
  const comA = ms.filter((m) => m.adultosMedia != null);
  return {
    meses: ms.length,
    entradas, contribuir, coletas,
    outrasEntradas: r2(entradas - contribuir - coletas),
    custosFixos: soma((m) => m.custosFixos),
    despesas: soma((m) => m.despesas),
    gerais: soma((m) => m.gerais),
    saidas,
    resultado: r2(entradas - saidas),
    cobertura: saidas ? entradas / saidas : null,
    mediaMensalEntradas: ms.length ? r2(entradas / ms.length) : 0,
    adultosMedia: comA.length ? r2(comA.reduce((t, m) => t + (m.adultosMedia ?? 0), 0) / comA.length) : null,
  };
}
