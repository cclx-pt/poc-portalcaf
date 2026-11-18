import { periodo, r2 } from './format';
import { OUTROS_FUNCIONAMENTO, classificador } from './rubricas';
import { contaParaMedia } from './domingos';
import type { BancoLote, Categoria, Comunidade, CustoFixo, Lote, ParteRubrica, Publico, PublicoMes, PublicoSite, Resumo, ResumoMes } from './types';

export interface DadosCalculo {
  ano: number;
  comunidades: Comunidade[];
  contribuir: Lote[];
  depositos: Lote[];
  despesas: Lote[];
  assistencia: Lote[];
  banco: BancoLote[];
  custosFixos: CustoFixo[];
  mesesFechados: Set<string>;
  hoje: string; // YYYY-MM-DD
  /** Categorias configuradas (rubrica e âmbito). Sem elas, tudo é local. */
  categorias?: Categoria[];
  /** Assistência do ano anterior, para a média dos últimos 12 meses. */
  assistenciaAnterior?: Lote[];
  /** Tipo de evento que conta para as médias (ex.: "Celebração de Domingo"). Sem ele, contam os domingos. */
  eventoCelebracao?: string | null;
}

/** Comunidade especial onde ficam os gerais quando nenhuma comunidade tem assistência. */
export const GERAIS_POR_REPARTIR = 'gerais';

/** Reparte `valor` pelos pesos, arredondado ao cêntimo; o último recebe a diferença. */
export function repartir(valor: number, pesos: number[]): number[] {
  const total = pesos.reduce((s, w) => s + w, 0);
  let dado = 0;
  return pesos.map((w, i) => {
    const q = i === pesos.length - 1 ? r2(valor - dado) : r2((valor * w) / total);
    dado = r2(dado + q);
    return q;
  });
}

/** Média de jovens e adultos por registo, por comunidade, nos 12 meses que terminam em (ano, mes). */
export function pesos12m(assistencia: Lote[], assistenciaAnterior: Lote[], ano: number, mes: number, eventoCelebracao?: string | null): Map<string, number> {
  const fim = ano * 12 + mes;
  const acc = new Map<string, { soma: number; n: number }>();
  for (const l of [...assistenciaAnterior, ...assistencia]) {
    const k = l.ano * 12 + l.mes;
    if (k > fim || k <= fim - 12) continue;
    const a = acc.get(l.comunidadeId) ?? { soma: 0, n: 0 };
    for (const r of l.registos) if (contaParaMedia(r, eventoCelebracao)) { a.soma += r.valor; a.n++; } // só a celebração
    acc.set(l.comunidadeId, a);
  }
  return new Map([...acc].filter(([, a]) => a.n).map(([c, a]) => [c, r2(a.soma / a.n)]));
}

const vazio = (mes: number): ResumoMes => ({
  mes, contribuir: 0, coletas: 0, transferencias: 0, quotaBolsa: 0, entradas: 0, custosFixos: 0, despesas: 0, saidas: 0, saldo: 0,
  adultosMedia: null, entradasPorCategoria: {}, despesasPorCategoria: {}, custosRubricas: {},
  n: { contribuir: 0, coletas: 0, transferencias: 0, despesas: 0 },
  rubricas: { entrada: {}, saida: {} }, geralEntradas: 0, geralSaidas: 0, pesoGeral: null, adultosMedia12m: null,
  cedidoGeral: { entradas: 0, custosFixos: 0, despesas: 0 },
});

const somaParte = (o: Record<string, ParteRubrica>, rubrica: string, parte: keyof ParteRubrica, v: number) => {
  const x = (o[rubrica] ??= { local: 0, geral: 0 });
  x[parte] = r2(x[parte] + v);
};

const soma = (o: Record<string, number>, k: string, v: number) => { o[k] = r2((o[k] ?? 0) + v); };

/** Último mês do ano que conta para custos fixos (meses já decorridos). */
export function mesesDecorridos(ano: number, hoje: string): number {
  const a = Number(hoje.slice(0, 4));
  if (ano < a) return 12;
  if (ano > a) return 0;
  return Number(hoje.slice(5, 7));
}

/** Valor mensal imputado à comunidade: valor total × incidência (por omissão 100%). */
export const valorImputado = (c: Pick<CustoFixo, 'valorMensal' | 'incidencia'>) => r2(c.valorMensal * (c.incidencia ?? 100) / 100);

export function custoAtivo(c: CustoFixo, p: string) {
  return c.inicio <= p && (!c.fim || c.fim >= p);
}

/** A linha de custo fixo está ativa em pelo menos um mês do ano. */
export function custoNoAno(c: CustoFixo, ano: number) {
  return c.inicio <= `${ano}-12` && (!c.fim || c.fim >= `${ano}-01`);
}

export function comunidadeAtiva(c: Comunidade, p: string) {
  const inicio = c.inicio ? c.inicio.slice(0, 7) : '0000-00';
  const fim = c.fim ? c.fim.slice(0, 7) : '9999-99';
  return inicio <= p && fim >= p;
}

/**
 * Calcula os resumos mensais por comunidade.
 * Entradas = Contribuir + coletas depositadas + transferências bancárias atribuídas + quota da bolsa geral.
 * Saídas = custos fixos (tabela) + despesas/reembolsos do Jotform + débitos bancários marcados para contabilizar.
 * A bolsa geral é distribuída pela média de assistência de adultos de cada comunidade no mesmo mês.
 */
export function calcularResumos(d: DadosCalculo): Resumo[] {
  const ate = mesesDecorridos(d.ano, d.hoje);
  const mapa = new Map<string, ResumoMes[]>();
  for (const c of d.comunidades) mapa.set(c.id, Array.from({ length: 12 }, (_, i) => vazio(i + 1)));
  const m = (c: string, mes: number) => {
    if (!mapa.has(c)) mapa.set(c, Array.from({ length: 12 }, (_, i) => vazio(i + 1)));
    return mapa.get(c)![mes - 1];
  };

  // Classificação por rubrica e âmbito. Os gerais saem da comunidade de origem para o bolo do mês;
  // a bolsa geral (entradas sem comunidade) segue a sua própria regra, mais abaixo.
  const classificar = classificador(d.categorias ?? []);
  type Tipo = 'entrada' | 'saida';
  const bolo = Array.from({ length: 12 }, () => ({ entrada: {} as Record<string, number>, saida: {} as Record<string, number> }));
  const bolsaRub = Array.from({ length: 12 }, () => ({} as Record<string, number>));
  const registar = (com: string, mes: number, tipo: Tipo, categoria: string, valor: number, confidencial = false, custoFixo = false, geral = false) => {
    const c0 = classificar(categoria, tipo);
    const k = geral ? { ...c0, ambito: 'geral' as const } : c0;
    const rubrica = k.confidencial || confidencial ? OUTROS_FUNCIONAMENTO : k.rubrica;
    // Entradas sem comunidade (bolsa geral): rubrica "Outros rendimentos", seja qual for a categoria (decisão do CAF).
    if (com === 'bolsa-geral' && tipo === 'entrada') { soma(bolsaRub[mes - 1], 'Outros rendimentos', valor); return; }
    if (k.ambito === 'geral' && com !== 'bolsa-geral') {
      soma(bolo[mes - 1][tipo], rubrica, valor);
      const ced = m(com, mes).cedidoGeral;
      const campo = tipo === 'entrada' ? 'entradas' : custoFixo ? 'custosFixos' : 'despesas';
      ced[campo] = r2(ced[campo] + valor);
      return;
    }
    somaParte(m(com, mes).rubricas[tipo], rubrica, 'local', valor);
  };

  for (const l of d.contribuir) for (const r of l.registos) {
    const x = m(l.comunidadeId, l.mes); x.contribuir = r2(x.contribuir + r.valor); x.n.contribuir++; soma(x.entradasPorCategoria, r.categoria || 'Sem categoria', r.valor);
    registar(l.comunidadeId, l.mes, 'entrada', r.categoria || 'Sem categoria', r.valor);
  }
  for (const l of d.depositos) for (const r of l.registos) {
    const x = m(l.comunidadeId, l.mes); x.coletas = r2(x.coletas + r.valor); x.n.coletas++; soma(x.entradasPorCategoria, 'Coletas em dinheiro', r.valor);
    registar(l.comunidadeId, l.mes, 'entrada', 'Coletas em dinheiro', r.valor);
  }
  for (const l of d.despesas) for (const r of l.registos) {
    const x = m(l.comunidadeId, l.mes); x.despesas = r2(x.despesas + r.valor); x.n.despesas++; soma(x.despesasPorCategoria, r.categoria || 'Sem categoria', r.valor);
    registar(l.comunidadeId, l.mes, 'saida', r.categoria || 'Sem categoria', r.valor);
  }
  for (const b of d.banco) for (const r of b.registos) {
    if (!r.contabilizar || !r.comunidadeId) continue;
    const mes = Number(r.data.slice(5, 7));
    if (Number(r.data.slice(0, 4)) !== d.ano) continue;
    const x = m(r.comunidadeId, mes);
    if (r.valor > 0) { x.transferencias = r2(x.transferencias + r.valor); x.n.transferencias++; soma(x.entradasPorCategoria, r.categoria || 'Transferências', r.valor); registar(r.comunidadeId, mes, 'entrada', r.categoria || 'Transferências', r.valor); }
    else { x.despesas = r2(x.despesas - r.valor); x.n.despesas++; soma(x.despesasPorCategoria, r.categoria || 'Débitos bancários', -r.valor); registar(r.comunidadeId, mes, 'saida', r.categoria || 'Débitos bancários', -r.valor); }
  }
  // Assistência média de adultos por comunidade e mês.
  const ass = new Map<string, { soma: number; n: number }>();
  for (const l of d.assistencia) for (const r of l.registos) {
    if (!contaParaMedia(r, d.eventoCelebracao)) continue; // a métrica é a celebração de domingo
    const k = `${l.comunidadeId}|${l.mes}`;
    const a = ass.get(k) ?? { soma: 0, n: 0 }; a.soma += r.valor; a.n++; ass.set(k, a);
  }
  for (const [k, a] of ass) { const [c, mes] = k.split('|'); m(c, Number(mes)).adultosMedia = r2(a.soma / a.n); }

  // Custos fixos dos meses decorridos.
  for (const cf of d.custosFixos) for (let mes = 1; mes <= ate; mes++) {
    const p = periodo(d.ano, mes);
    if (!custoAtivo(cf, p)) continue;
    const x = m(cf.comunidadeId, mes);
    const valor = valorImputado(cf);
    x.custosFixos = r2(x.custosFixos + valor);
    soma(x.custosRubricas, cf.nivel === 'confidencial' ? 'Outros custos de funcionamento' : cf.rubrica, valor);
    // Custo fixo confidencial: nunca aparece com a sua rubrica própria.
    registar(cf.comunidadeId, mes, 'saida', cf.rubrica, valor, cf.nivel === 'confidencial', true, cf.ambito === 'geral');
  }

  // Distribuição da bolsa geral (média de adultos do mesmo mês), também por rubrica.
  for (let mes = 1; mes <= 12; mes++) {
    const bolsa = m('bolsa-geral', mes);
    const total = r2(bolsa.contribuir + bolsa.coletas + bolsa.transferencias);
    if (!total) continue;
    const p = periodo(d.ano, mes);
    const elegiveis = d.comunidades.filter((c) => !c.especial && comunidadeAtiva(c, p));
    const pesos = elegiveis.map((c) => m(c.id, mes).adultosMedia ?? 0);
    if (!pesos.reduce((s0, w) => s0 + w, 0)) {
      for (const [rub, v] of Object.entries(bolsaRub[mes - 1])) somaParte(bolsa.rubricas.entrada, rub, 'local', v);
      continue;
    }
    repartir(total, pesos).forEach((q, i) => { m(elegiveis[i].id, mes).quotaBolsa = q; });
    for (const [rub, v] of Object.entries(bolsaRub[mes - 1])) {
      repartir(v, pesos).forEach((q, i) => { if (q) somaParte(m(elegiveis[i].id, mes).rubricas.entrada, rub, 'local', q); });
    }
    bolsa.quotaBolsa = r2(-total);
  }

  // Repartição dos gerais pela média de jovens e adultos dos últimos 12 meses.
  for (let mes = 1; mes <= 12; mes++) {
    const p = periodo(d.ano, mes);
    const w12 = pesos12m(d.assistencia, d.assistenciaAnterior ?? [], d.ano, mes, d.eventoCelebracao);
    for (const [c, w] of w12) if (mapa.has(c)) m(c, mes).adultosMedia12m = w;
    const elegiveis = d.comunidades.filter((c) => !c.especial && comunidadeAtiva(c, p) && (w12.get(c.id) ?? 0) > 0);
    const pesos = elegiveis.map((c) => w12.get(c.id)!);
    const somaW = pesos.reduce((s0, w) => s0 + w, 0);
    elegiveis.forEach((c, i) => { m(c.id, mes).pesoGeral = pesos[i] / somaW; });
    for (const tipo of ['entrada', 'saida'] as const) {
      for (const [rub, v] of Object.entries(bolo[mes - 1][tipo])) {
        if (!elegiveis.length) {
          const g = m(GERAIS_POR_REPARTIR, mes);
          somaParte(g.rubricas[tipo], rub, 'geral', v);
          if (tipo === 'entrada') g.geralEntradas = r2(g.geralEntradas + v); else g.geralSaidas = r2(g.geralSaidas + v);
          continue;
        }
        repartir(v, pesos).forEach((q, i) => {
          if (!q) return;
          const x = m(elegiveis[i].id, mes);
          somaParte(x.rubricas[tipo], rub, 'geral', q);
          if (tipo === 'entrada') x.geralEntradas = r2(x.geralEntradas + q); else x.geralSaidas = r2(x.geralSaidas + q);
        });
      }
    }
  }

  const agora = new Date().toISOString();
  const out: Resumo[] = [];
  for (const [comunidadeId, meses] of mapa) {
    for (const x of meses) {
      const c = x.cedidoGeral;
      x.entradas = r2(x.contribuir + x.coletas + x.transferencias - c.entradas + x.quotaBolsa + x.geralEntradas);
      x.saidas = r2(x.custosFixos + x.despesas - c.custosFixos - c.despesas + x.geralSaidas);
      x.saldo = r2(x.entradas - x.saidas);
    }
    out.push({ id: `${d.ano}_${comunidadeId}`, ano: d.ano, comunidadeId, meses, calculadoEm: agora, calculadoPor: '' });
  }
  return out;
}

/**
 * Partes coerentes de um mês, já com a repartição dos gerais:
 * entradas − custosFixos − despesas − gerais = saldo.
 * custosFixos/despesas = o que ficou na comunidade; gerais = parte recebida das saídas gerais.
 * (Resumos antigos sem os campos novos contam como sem gerais.)
 */
export function partesMes(x: Pick<ResumoMes, 'entradas' | 'custosFixos' | 'despesas' | 'saldo'> & Partial<Pick<ResumoMes, 'cedidoGeral' | 'geralSaidas'>>) {
  const c = x.cedidoGeral ?? { entradas: 0, custosFixos: 0, despesas: 0 };
  return {
    entradas: x.entradas,
    custosFixos: r2(x.custosFixos - c.custosFixos),
    despesas: r2(x.despesas - c.despesas),
    gerais: r2(x.geralSaidas ?? 0),
    saldo: x.saldo,
  };
}

/**
 * Valores de um mês para a página pública, já com a repartição dos gerais:
 * custos de funcionamento = custos fixos que ficaram na comunidade;
 * outras despesas = despesas que ficaram + parte recebida dos gerais.
 * (Resumos antigos sem os campos novos contam como sem gerais.)
 */
function valoresPublicos(x: ResumoMes) {
  const p = partesMes(x);
  return { entradas: p.entradas, custos: p.custosFixos, outras: r2(p.despesas + p.gerais) };
}

/** Resumo público: só meses fechados, só totais, com supressão de grupos com menos de 3 registos. */
export function calcularPublico(ano: number, resumos: Resumo[], comunidades: Comunidade[], mesesFechados: Set<string>): Publico {
  const fechados = Array.from({ length: 12 }, (_, i) => i + 1).filter((mes) => mesesFechados.has(periodo(ano, mes)));
  const nomes = new Map(comunidades.map((c) => [c.id, c.nome]));
  const linhas = resumos
    .filter((r) => r.comunidadeId !== 'bolsa-geral' && r.comunidadeId !== GERAIS_POR_REPARTIR)
    .map((r) => ({
      id: r.comunidadeId,
      nome: nomes.get(r.comunidadeId) ?? r.comunidadeId,
      meses: fechados.map((mes): PublicoMes => {
        const x = r.meses[mes - 1];
        const nEntradas = x.n.contribuir + x.n.coletas + x.n.transferencias;
        const v = valoresPublicos(x);
        const entradas = nEntradas >= 3 || nEntradas === 0 ? v.entradas : null;
        const outras = x.n.despesas >= 3 || x.n.despesas === 0 ? v.outras : null;
        const saldo = entradas == null || outras == null ? null : r2(entradas - v.custos - outras);
        return { mes, entradas, custosFuncionamento: v.custos, outrasDespesas: outras, saldo };
      }),
    }))
    .sort((a, b) => (comunidades.find((c) => c.id === a.id)?.ordem ?? 50) - (comunidades.find((c) => c.id === b.id)?.ordem ?? 50));
  return { ano, comunidades: linhas, mesesFechados: fechados, atualizadoEm: new Date().toISOString() };
}

/**
 * Visão pública do site (CCLX consolidado), para a página sem login.
 * Calculada a partir dos resumos (não da soma das comunidades já protegidas), com a mesma regra:
 * valores com menos de 3 registos no total não são mostrados.
 */
export function calcularPublicoSite(ano: number, resumos: Resumo[], mesesFechados: Set<string>): PublicoSite {
  const fechados = Array.from({ length: 12 }, (_, i) => i + 1).filter((mes) => mesesFechados.has(periodo(ano, mes)));
  const rs = resumos.filter((r) => r.comunidadeId !== 'bolsa-geral');
  const meses = fechados.map((mes): PublicoMes => {
    const xs = rs.map((r) => r.meses[mes - 1]);
    const nEntradas = xs.reduce((s, x) => s + x.n.contribuir + x.n.coletas + x.n.transferencias, 0);
    const nDespesas = xs.reduce((s, x) => s + x.n.despesas, 0);
    const vs = xs.map(valoresPublicos);
    const somaE = r2(vs.reduce((s, v) => s + v.entradas, 0));
    const somaD = r2(vs.reduce((s, v) => s + v.outras, 0));
    const custos = r2(vs.reduce((s, v) => s + v.custos, 0));
    const entradas = nEntradas >= 3 || nEntradas === 0 ? somaE : null;
    const outras = nDespesas >= 3 || nDespesas === 0 ? somaD : null;
    const saldo = entradas == null || outras == null ? null : r2(entradas - custos - outras);
    return { mes, entradas, custosFuncionamento: custos, outrasDespesas: outras, saldo };
  });
  return { ano, site: { nome: 'CCLX', meses }, mesesFechados: fechados, atualizadoEm: new Date().toISOString() };
}

export function somarMeses(ms: ResumoMes[]) {
  const t = vazio(0);
  for (const x of ms) {
    for (const k of ['contribuir', 'coletas', 'transferencias', 'quotaBolsa', 'entradas', 'custosFixos', 'despesas', 'saidas', 'saldo', 'geralEntradas', 'geralSaidas'] as const) t[k] = r2(t[k] + (x[k] ?? 0));
    for (const k of ['entradas', 'custosFixos', 'despesas'] as const) t.cedidoGeral[k] = r2(t.cedidoGeral[k] + (x.cedidoGeral?.[k] ?? 0));
    for (const tipo of ['entrada', 'saida'] as const) {
      for (const [rub, p] of Object.entries(x.rubricas?.[tipo] ?? {})) { somaParte(t.rubricas[tipo], rub, 'local', p.local); somaParte(t.rubricas[tipo], rub, 'geral', p.geral); }
    }
    for (const [k, v] of Object.entries(x.entradasPorCategoria)) soma(t.entradasPorCategoria, k, v);
    for (const [k, v] of Object.entries(x.despesasPorCategoria)) soma(t.despesasPorCategoria, k, v);
    for (const [k, v] of Object.entries(x.custosRubricas)) soma(t.custosRubricas, k, v);
    t.n.contribuir += x.n.contribuir; t.n.coletas += x.n.coletas; t.n.transferencias += x.n.transferencias; t.n.despesas += x.n.despesas;
  }
  return t;
}
