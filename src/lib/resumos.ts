import { MESES, periodo, r2 } from './format';
import { OUTROS_FUNCIONAMENTO, classificador } from './rubricas';
import { pedacosDe } from './classificacaoBanco';
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
  /**
   * Regra dos meses fechados (decisão do CAF, 18/11/2026; ativa por omissão): nos meses fechados contam os valores
   * reais (Jotform e banco) e não os custos fixos; nos meses abertos conta só a previsão dos custos fixos (previsao = true).
   * false: comportamento antigo (tudo, com custos fixos até ao mês corrente).
   */
  regraFechados?: boolean;
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

/**
 * Média de jovens e adultos por domingo (celebração), por comunidade, nos 12 meses que terminam em (ano, mes).
 * `juntar` indica a comunidade em que cada uma conta (fusões): as comunidades juntas somam-se por data.
 */
export function pesos12m(assistencia: Lote[], assistenciaAnterior: Lote[], ano: number, mes: number, eventoCelebracao?: string | null, juntar: (comunidadeId: string) => string = (c) => c): Map<string, number> {
  const fim = ano * 12 + mes;
  // Média de cada comunidade de origem em cada data (normalmente um registo por domingo).
  const porData = new Map<string, { soma: number; n: number }>();
  for (const l of [...assistenciaAnterior, ...assistencia]) {
    const k = l.ano * 12 + l.mes;
    if (k > fim || k <= fim - 12) continue;
    for (const r of l.registos) {
      if (!contaParaMedia(r, eventoCelebracao)) continue; // só a celebração
      const chave = `${l.comunidadeId}|${r.data}`;
      const a = porData.get(chave) ?? { soma: 0, n: 0 };
      a.soma += r.valor; a.n++; porData.set(chave, a);
    }
  }
  // Soma por comunidade de destino e data; depois a média pelas datas.
  const destino = new Map<string, number>();
  for (const [chave, a] of porData) {
    const [c, data] = chave.split('|');
    const k = `${juntar(c)}|${data}`;
    destino.set(k, (destino.get(k) ?? 0) + a.soma / a.n);
  }
  const acc = new Map<string, { soma: number; n: number }>();
  for (const [k, v] of destino) {
    const c = k.split('|')[0];
    const a = acc.get(c) ?? { soma: 0, n: 0 };
    a.soma += v; a.n++; acc.set(c, a);
  }
  return new Map([...acc].filter(([, a]) => a.n).map(([c, a]) => [c, r2(a.soma / a.n)]));
}

/**
 * Fusões: depois do fim de uma comunidade com sucessora, o que lhe pertence passa para a sucessora.
 * `quando` é uma data (AAAA-MM-DD, conta depois do dia do fim) ou um mês (AAAA-MM, conta depois do mês do fim).
 */
export function destinoFusao(comunidades: Pick<Comunidade, 'id' | 'fim' | 'sucessora'>[]) {
  const por = new Map(comunidades.map((c) => [c.id, c]));
  return (id: string, quando: string): string => {
    let atual = id;
    for (let i = 0; i < 5; i++) {
      const c = por.get(atual);
      if (!c?.fim || !c.sucessora) return atual;
      const depois = quando.length === 7 ? quando > c.fim.slice(0, 7) : quando > c.fim.slice(0, 10);
      if (!depois) return atual;
      atual = c.sucessora;
    }
    return atual;
  };
}

/** Lotes com os registos de comunidades já terminadas passados para a sucessora (pela data de cada registo). */
function lotesComFusao(lotes: Lote[], destino: ReturnType<typeof destinoFusao>): Lote[] {
  const out: Lote[] = [];
  for (const l of lotes) {
    const grupos = new Map<string, Lote['registos']>();
    for (const r of l.registos) { const c = destino(l.comunidadeId, r.data); grupos.set(c, [...(grupos.get(c) ?? []), r]); }
    if (grupos.size <= 1 && grupos.has(l.comunidadeId)) { out.push(l); continue; }
    for (const [c, registos] of grupos) out.push({ ...l, id: `${l.id}>${c}`, comunidadeId: c, registos });
  }
  return out;
}

const vazio = (mes: number): ResumoMes => ({
  mes, contribuir: 0, coletas: 0, transferencias: 0, quotaBolsa: 0, entradas: 0, custosFixos: 0, despesas: 0, saidas: 0, saldo: 0,
  adultosMedia: null, entradasPorCategoria: {}, despesasPorCategoria: {}, custosRubricas: {},
  n: { contribuir: 0, coletas: 0, transferencias: 0, despesas: 0 },
  rubricas: { entrada: {}, saida: {} }, geralEntradas: 0, geralSaidas: 0, pesoGeral: null, adultosMedia12m: null,
  cedidoGeral: { entradas: 0, custosFixos: 0, despesas: 0 },
  previsao: false,
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

/** Quantas vezes o custo ocorre no mês (AAAA-MM), conforme a periodicidade. Sem periodicidade: 1. */
export function ocorrenciasNoMes(c: Pick<CustoFixo, 'periodicidade' | 'desde' | 'inicio'>, p: string): number {
  const per = c.periodicidade;
  if (!per || (per.unidade === 'meses' && per.cada <= 1)) return 1;
  const cada = Math.max(1, Math.round(per.cada));
  const primeira = c.desde && /^\d{4}-\d{2}-\d{2}$/.test(c.desde) ? c.desde : `${c.inicio}-01`;
  const [a0, m0] = primeira.slice(0, 7).split('-').map(Number);
  const [a, m] = p.split('-').map(Number);
  const dif = (a * 12 + m) - (a0 * 12 + m0);
  if (per.unidade === 'meses') return dif >= 0 && dif % cada === 0 ? 1 : 0;
  if (per.unidade === 'anos') return dif >= 0 && dif % (12 * cada) === 0 ? 1 : 0;
  // A cada X dias: conta as datas da série que caem no mês.
  const ini = Date.UTC(a, m - 1, 1), fim = Date.UTC(a, m, 1);
  const t0 = Date.parse(`${primeira}T00:00:00Z`);
  const passo = cada * 86400000;
  if (fim <= t0) return 0;
  const k0 = Math.max(0, Math.ceil((ini - t0) / passo));
  let n = 0;
  for (let t = t0 + k0 * passo; t < fim; t += passo) n++;
  return n;
}

/** Valor imputado à comunidade num mês, já com a periodicidade (0 nos meses sem ocorrência). */
export const valorImputadoNoMes = (c: Pick<CustoFixo, 'valorMensal' | 'incidencia' | 'periodicidade' | 'desde' | 'inicio'>, p: string) => r2(valorImputado(c) * ocorrenciasNoMes(c, p));

/** Texto da periodicidade: "mensal", "a cada 3 meses", "anual", "a cada 14 dias". */
export function descreverPeriodicidade(c: Pick<CustoFixo, 'periodicidade'>): string {
  const per = c.periodicidade;
  if (!per || (per.unidade === 'meses' && per.cada <= 1)) return 'mensal';
  if (per.unidade === 'anos' && per.cada === 1) return 'anual';
  return `a cada ${per.cada} ${per.unidade === 'meses' ? 'meses' : per.unidade === 'anos' ? 'anos' : 'dias'}`;
}

export function custoAtivo(c: CustoFixo, p: string) {
  if (c.ano != null && p.slice(0, 4) !== String(c.ano)) return false;
  return c.inicio <= p && (!c.fim || c.fim >= p);
}

/** A linha de custo fixo está ativa em pelo menos um mês do ano. */
export function custoNoAno(c: CustoFixo, ano: number) {
  if (c.ano != null) return c.ano === ano;
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
 * A bolsa geral é distribuída, cada mês, pela média de assistência de adultos de cada comunidade nos últimos 12 meses.
 */
export function calcularResumos(d0: DadosCalculo): Resumo[] {
  // Fusões (ex.: Barreiro → Moita depois de 18/07/2026): registos e movimentos depois do fim passam para a sucessora.
  const destino = destinoFusao(d0.comunidades);
  const d: DadosCalculo = {
    ...d0,
    contribuir: lotesComFusao(d0.contribuir, destino), depositos: lotesComFusao(d0.depositos, destino),
    despesas: lotesComFusao(d0.despesas, destino), assistencia: lotesComFusao(d0.assistencia, destino),
    banco: d0.banco.map((b) => ({ ...b, registos: b.registos.map((r) => ({
      ...r, ...(r.comunidadeId ? { comunidadeId: destino(r.comunidadeId, r.data) } : {}),
      ...(r.partes?.length ? { partes: r.partes.map((p) => ({ ...p, comunidadeId: destino(p.comunidadeId, r.data) })) } : {}),
    })) })),
  };
  const regra = d.regraFechados !== false;
  const fechado = (mes: number) => !regra || d.mesesFechados.has(periodo(d.ano, mes));
  // Com a regra, a previsão dos custos fixos cobre os meses abertos do ano todo; sem ela, os meses decorridos.
  const ate = regra ? 12 : mesesDecorridos(d.ano, d.hoje);
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
    // Com o plano financeiro, a rubrica de receita da categoria (R1, R2, R3) mantém-se.
    if (com === 'bolsa-geral' && tipo === 'entrada') { soma(bolsaRub[mes - 1], /^R\d/.test(rubrica) ? rubrica : 'Outros rendimentos', valor); return; }
    // Os custos fixos da comunidade Geral (bolsa-geral) são sempre repartidos pelas comunidades.
    if (k.ambito === 'geral' && (com !== 'bolsa-geral' || custoFixo)) {
      soma(bolo[mes - 1][tipo], rubrica, valor);
      const ced = m(com, mes).cedidoGeral;
      const campo = tipo === 'entrada' ? 'entradas' : custoFixo ? 'custosFixos' : 'despesas';
      ced[campo] = r2(ced[campo] + valor);
      return;
    }
    somaParte(m(com, mes).rubricas[tipo], rubrica, 'local', valor);
  };

  // Taxa IFTHENPAY: 03.07 Taxas (decisão do CAF); sem ela, 03.03 Bancos e pagamentos.
  const nomeComissao = (d.categorias ?? []).find((c) => c.codigo === '03.07')?.nome ?? (d.categorias ?? []).find((c) => c.codigo === '03.03')?.nome ?? 'Comissões bancárias';
  for (const l of d.contribuir) for (const r of l.registos) {
    if (!fechado(l.mes)) continue;
    const x = m(l.comunidadeId, l.mes); x.contribuir = r2(x.contribuir + r.valor); x.n.contribuir++; soma(x.entradasPorCategoria, r.categoria || 'Sem categoria', r.valor);
    registar(l.comunidadeId, l.mes, 'entrada', r.categoria || 'Sem categoria', r.valor);
    // Comissão IFTHENPAY: diferença entre o valor e o líquido recebido.
    const liq = Number(r.extra?.liquido);
    if (Number.isFinite(liq) && liq < r.valor) {
      const com = r2(r.valor - liq);
      x.despesas = r2(x.despesas + com); x.n.despesas++; soma(x.despesasPorCategoria, nomeComissao, com);
      registar(l.comunidadeId, l.mes, 'saida', nomeComissao, com);
    }
  }
  for (const l of d.depositos) for (const r of l.registos) {
    if (!fechado(l.mes)) continue;
    const x = m(l.comunidadeId, l.mes); x.coletas = r2(x.coletas + r.valor); x.n.coletas++; soma(x.entradasPorCategoria, 'Coletas em dinheiro', r.valor);
    registar(l.comunidadeId, l.mes, 'entrada', 'Coletas em dinheiro', r.valor);
  }
  for (const l of d.despesas) for (const r of l.registos) {
    if (!fechado(l.mes)) continue;
    const x = m(l.comunidadeId, l.mes); x.despesas = r2(x.despesas + r.valor); x.n.despesas++; soma(x.despesasPorCategoria, r.categoria || 'Sem categoria', r.valor);
    registar(l.comunidadeId, l.mes, 'saida', r.categoria || 'Sem categoria', r.valor);
  }
  for (const b of d.banco) for (const r0 of b.registos) {
    // Movimento repartido: cada parte conta na sua comunidade.
    const pedacos = pedacosDe(r0);
    for (const r of pedacos) {
      if (!r.contabilizar || !r.comunidadeId) continue;
      // Movimentos financeiros (depósitos, transferências internas…) não são receita nem despesa.
      if (r.categoria && classificar(r.categoria, r.valor > 0 ? 'entrada' : 'saida').financeiro) continue;
      const mes = Number(r.data.slice(5, 7));
      if (Number(r.data.slice(0, 4)) !== d.ano || !fechado(mes)) continue;
      const x = m(r.comunidadeId, mes);
      if (r.valor > 0) { x.transferencias = r2(x.transferencias + r.valor); x.n.transferencias++; soma(x.entradasPorCategoria, r.categoria || 'Transferências', r.valor); registar(r.comunidadeId, mes, 'entrada', r.categoria || 'Transferências', r.valor); }
      else { x.despesas = r2(x.despesas - r.valor); x.n.despesas++; soma(x.despesasPorCategoria, r.categoria || 'Débitos bancários', -r.valor); registar(r.comunidadeId, mes, 'saida', r.categoria || 'Débitos bancários', -r.valor); }
    }
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
  const boloCfPrev = Array.from({ length: 12 }, () => 0);
  for (const cf of d.custosFixos) for (let mes = 1; mes <= ate; mes++) {
    const p = periodo(d.ano, mes);
    if (!custoAtivo(cf, p) || !ocorrenciasNoMes(cf, p)) continue; // periodicidade: só nos meses em que ocorre
    // Previsão (tabela) de todos os meses, para os KPI de custos fixos anuais e mensais: os gerais vão para o bolo.
    {
      const comP = destino(cf.comunidadeId, p);
      const vP = valorImputadoNoMes(cf, p);
      const geralP = cf.ambito === 'geral' || comP === 'bolsa-geral' || classificar(cf.categoria || cf.rubrica, 'saida').ambito === 'geral';
      if (geralP) boloCfPrev[mes - 1] = r2(boloCfPrev[mes - 1] + vP);
      else { const xp = m(comP, mes); xp.cfPrevisto = r2((xp.cfPrevisto ?? 0) + vP); }
    }
    // Mês fechado: conta o pagamento real (banco), não a previsão.
    if (regra && fechado(mes)) continue;
    const comCf = destino(cf.comunidadeId, p); // custo de uma comunidade já terminada: na sucessora
    const x = m(comCf, mes);
    const valor = valorImputadoNoMes(cf, p);
    x.custosFixos = r2(x.custosFixos + valor);
    soma(x.custosRubricas, cf.nivel === 'confidencial' ? 'Outros custos de funcionamento' : cf.rubrica, valor);
    // Custo fixo confidencial: nunca aparece com a sua rubrica própria.
    registar(comCf, mes, 'saida', cf.categoria || cf.rubrica, valor, cf.nivel === 'confidencial', true, cf.ambito === 'geral' || comCf === 'bolsa-geral');
  }

  // Distribuição da bolsa geral: cada mês, pela percentagem da média de jovens e adultos de cada comunidade
  // nos últimos 12 meses (decisão do CAF, 19/11/2026), também por rubrica.
  for (let mes = 1; mes <= 12; mes++) {
    const bolsa = m('bolsa-geral', mes);
    const total = r2(bolsa.contribuir + bolsa.coletas + bolsa.transferencias);
    if (!total) continue;
    const p = periodo(d.ano, mes);
    const w12 = pesos12m(d0.assistencia, d.assistenciaAnterior ?? [], d.ano, mes, d.eventoCelebracao, (c) => destino(c, p));
    const elegiveis = d.comunidades.filter((c) => !c.especial && comunidadeAtiva(c, p));
    const pesos = elegiveis.map((c) => w12.get(c.id) ?? 0);
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
    const w12 = pesos12m(d0.assistencia, d.assistenciaAnterior ?? [], d.ano, mes, d.eventoCelebracao, (c) => destino(c, p));
    for (const [c, w] of w12) if (mapa.has(c)) m(c, mes).adultosMedia12m = w;
    const elegiveis = d.comunidades.filter((c) => !c.especial && comunidadeAtiva(c, p) && (w12.get(c.id) ?? 0) > 0);
    const pesos = elegiveis.map((c) => w12.get(c.id)!);
    const somaW = pesos.reduce((s0, w) => s0 + w, 0);
    elegiveis.forEach((c, i) => { m(c.id, mes).pesoGeral = pesos[i] / somaW; });
    if (elegiveis.length && boloCfPrev[mes - 1]) repartir(boloCfPrev[mes - 1], pesos).forEach((q, i) => { const x = m(elegiveis[i].id, mes); x.cfGeralPrevisto = r2((x.cfGeralPrevisto ?? 0) + q); });
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
      if (regra) x.previsao = !fechado(x.mes);
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

/** Que meses estão fechados (valores reais) e abertos (só previsão dos custos fixos). */
export function estadoMeses(resumos: Pick<Resumo, 'meses'>[]): { regra: boolean; fechados: number[]; abertos: number[] } {
  const prev = new Map<number, boolean>();
  for (const r of resumos) for (const m of r.meses) if (typeof m.previsao === 'boolean') prev.set(m.mes, (prev.get(m.mes) ?? false) || m.previsao);
  if (!prev.size) return { regra: false, fechados: [], abertos: [] };
  const meses = [...prev.keys()].sort((a, b) => a - b);
  return { regra: true, fechados: meses.filter(m => !prev.get(m)), abertos: meses.filter(m => prev.get(m)) };
}

function intervalos(meses: number[]): string {
  const runs: [number, number][] = [];
  for (const m of meses) {
    const u = runs[runs.length - 1];
    if (u && u[1] === m - 1) u[1] = m; else runs.push([m, m]);
  }
  const partes = runs.map(([a, b]) => (a === b ? MESES[a - 1] : `${MESES[a - 1]} a ${MESES[b - 1]}`));
  return partes.length > 1 ? `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}` : partes[0] ?? '';
}

/** Frase clara para os gráficos: até onde há valores reais e o que é previsão. */
export function textoMeses(ano: number, e: ReturnType<typeof estadoMeses>): string {
  if (!e.regra) return '';
  if (!e.fechados.length) return `Ainda não há meses fechados em ${ano}: os valores são só a previsão dos custos fixos.`;
  const reais = `Valores reais: meses fechados (${intervalos(e.fechados)} de ${ano}).`;
  if (!e.abertos.length) return reais;
  const ab = intervalos(e.abertos);
  return `${reais} ${ab.charAt(0).toUpperCase()}${ab.slice(1)} (meses abertos): só a previsão dos custos fixos.`;
}

/** Componentes que o Painel pode ligar e desligar. */
export interface ComponentesPainel { contribuir: boolean; depositos: boolean; transferencias: boolean; custosFixos: boolean; despesas: boolean; gerais: boolean }
export const TODOS_COMPONENTES: ComponentesPainel = { contribuir: true, depositos: true, transferencias: true, custosFixos: true, despesas: true, gerais: true };

/**
 * Valores de um período só com os componentes ligados (Painel).
 * Entradas = Contribuir + depósitos de coletas + transferências e bolsa geral (o que foi cedido aos gerais já está descontado).
 * Saídas = custos fixos + despesas e reembolsos + parte dos gerais. Saldo = entradas ligadas − saídas ligadas.
 */
export function aplicarComponentes(t: Pick<ResumoMes, 'entradas' | 'contribuir' | 'coletas' | 'transferencias' | 'quotaBolsa' | 'geralEntradas' | 'custosFixos' | 'despesas' | 'saldo'> & Partial<Pick<ResumoMes, 'cedidoGeral' | 'geralSaidas'>>, c: ComponentesPainel) {
  const p = partesMes(t);
  const fora = (c.contribuir ? 0 : t.contribuir) + (c.depositos ? 0 : t.coletas) + (c.transferencias ? 0 : t.transferencias + t.quotaBolsa + (t.geralEntradas ?? 0));
  const entradas = r2(p.entradas - fora);
  const custosFixos = c.custosFixos ? p.custosFixos : 0;
  const despesas = c.despesas ? p.despesas : 0;
  const gerais = c.gerais ? p.gerais : 0;
  return {
    entradas, custosFixos, despesas, gerais,
    contribuir: c.contribuir ? t.contribuir : 0,
    coletas: c.depositos ? t.coletas : 0,
    transferencias: c.transferencias ? r2(t.transferencias + t.quotaBolsa) : 0,
    saldo: r2(entradas - custosFixos - despesas - gerais),
  };
}

/**
 * Resumos com a regra dos meses fechados (meses) e, à parte, os valores reais de todos os meses (mesesReais),
 * para o Painel poder mostrar o que já entrou e saiu mesmo antes de os meses fecharem.
 */
export function calcularResumosComReais(d: DadosCalculo): Resumo[] {
  const oficiais = calcularResumos(d);
  if (d.regraFechados === false) return oficiais;
  const reais = new Map(calcularResumos({ ...d, regraFechados: false }).map((r) => [r.id, r.meses]));
  return oficiais.map((r) => ({ ...r, mesesReais: reais.get(r.id) ?? r.meses }));
}

/** Como o Painel e as análises tratam os meses: valores reais de todos os meses, previsão nos abertos, ou só os fechados. */
export type ModoMeses = 'reais' | 'previsoes' | 'fechados';
export const MODOS_MESES: { valor: ModoMeses; nome: string }[] = [
  { valor: 'reais', nome: 'Valores reais até hoje (Jotform e bancos, todos os meses)' },
  { valor: 'previsoes', nome: 'Com previsões (meses abertos com a previsão dos custos fixos)' },
  { valor: 'fechados', nome: 'Só meses fechados (valores reais)' },
];

/**
 * Resumos no modo escolhido: "reais" troca os meses pelos mesesReais (resumos antigos sem eles ficam como estão);
 * "fechados" deixa os meses abertos a zero; "previsoes" é a regra oficial, tal como foi calculada.
 */
export function resumosNoModo(rs: Resumo[], modo: ModoMeses): Resumo[] {
  if (modo === 'reais') return rs.map((r) => (r.mesesReais ? { ...r, meses: r.mesesReais } : r));
  if (modo === 'fechados') return rs.map((r) => ({ ...r, meses: r.meses.map((m) => (m.previsao ? { ...vazio(m.mes), previsao: true } : m)) }));
  return rs;
}
