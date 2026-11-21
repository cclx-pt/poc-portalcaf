import { useAuth } from '../auth/AuthProvider';
import { Estado, GraficoBarras, Kpi, useCarregar, useFiltros, Frescura } from '../components/ui';
import { lerConfigAssistencia, listarComunidades, listarCustosFixos, listarExcecoes, listarLotes, listarResumos } from '../lib/db';
import { contaParaMedia, domingosEmFalta } from '../lib/domingos';
import { dec, eur, hoje, MESES, MESES_CURTOS, num, pct, r2 } from '../lib/format';
import { mesesDoRelatorio, resumoAnual, type ResumoAnual } from '../lib/relatorio';
import { estadoMeses, mesesDecorridos } from '../lib/resumos';
import type { Lote, Resumo } from '../lib/types';

const BASE = import.meta.env.BASE_URL;

/** Média total de pessoas (todas as idades) por celebração, por mês, somando as comunidades. */
function pessoasPorMes(lotes: Lote[], tipo: string | null): (number | null)[] {
  return Array.from({ length: 12 }, (_, i) => {
    const porCom = new Map<string, { soma: number; n: number }>();
    for (const l of lotes) {
      if (l.mes !== i + 1) continue;
      for (const r of l.registos) {
        if (!contaParaMedia(r, tipo)) continue;
        const x = (k: string) => Number(r.extra?.[k] ?? 0) || 0;
        const a = porCom.get(l.comunidadeId) ?? { soma: 0, n: 0 };
        a.soma += r.valor + x('jump') + x('criancas') + x('connects'); a.n++;
        porCom.set(l.comunidadeId, a);
      }
    }
    return porCom.size ? r2([...porCom.values()].reduce((t, a) => t + a.soma / a.n, 0)) : null;
  });
}

const variacao = (atual: number | null, antes: number | null) => (atual != null && antes ? (atual - antes) / Math.abs(antes) : null);

/** Relatório custos x entradas com assistência, no modelo do relatório de Caldas da Rainha. */
export default function Relatorio() {
  const { acesso } = useAuth();
  const { ano, comunidade } = useFiltros();
  const coms = useCarregar(listarComunidades, []);
  const rAtual = useCarregar(() => listarResumos(acesso!, ano), [ano, acesso?.email]);
  const rAntes = useCarregar(() => listarResumos(acesso!, ano - 1), [ano, acesso?.email]);
  const ass = useCarregar(() => listarLotes(acesso!, 'assistencia', ano, false), [ano, acesso?.email]);
  const exc = useCarregar(listarExcecoes, []);
  const cfs = useCarregar(() => listarCustosFixos(acesso!), [acesso?.email]);
  const cfgAss = useCarregar(lerConfigAssistencia, []);
  const tipo = cfgAss.dados?.eventoCelebracao ?? null;

  const daqui = (rs: Resumo[] | null) => (rs ?? []).filter((r) => (comunidade === 'todas' ? r.comunidadeId !== 'bolsa-geral' : r.comunidadeId === comunidade));
  const atual = daqui(rAtual.dados);
  const antes = daqui(rAntes.dados);
  const nomeCom = comunidade === 'todas' ? 'CCLX' : coms.dados?.find((c) => c.id === comunidade)?.nome ?? comunidade;
  const ate = mesesDecorridos(ano, hoje());
  const A: ResumoAnual = resumoAnual(atual, ate);
  const P: ResumoAnual | null = antes.length ? resumoAnual(antes, 12) : null;
  const meses = mesesDoRelatorio(atual, ate);
  const abertosRel = new Set(estadoMeses(atual).abertos);
  const lotesAss = (ass.dados ?? []).filter((l) => comunidade === 'todas' || l.comunidadeId === comunidade);
  const pessoas = pessoasPorMes(lotesAss, tipo);
  const dom = domingosEmFalta({
    ano, hoje: hoje(), assistencia: lotesAss, excecoes: exc.dados ?? [], evento: tipo,
    comunidades: (coms.dados ?? []).filter((c) => (c.ativo ?? true) && (comunidade === 'todas' || c.id === comunidade)),
  });
  const domEsperados = dom.reduce((t, d) => t + d.esperados, 0);
  const domComRegisto = dom.reduce((t, d) => t + d.comRegisto, 0);

  // Custos fixos por rubrica no período (confidenciais já agregados nos resumos).
  const rubricas = new Map<string, number>();
  for (const r of atual) for (const x of r.meses.slice(0, ate)) for (const [k, v] of Object.entries(x.custosRubricas ?? {})) rubricas.set(k, r2((rubricas.get(k) ?? 0) + v));
  const rubLista = [...rubricas.entries()].sort((a, b) => b[1] - a[1]);
  const pendentes = (cfs.dados ?? []).filter((c) => (comunidade === 'todas' || c.comunidadeId === comunidade) && /pendente/i.test(c.notas ?? ''));

  const porPessoa = (v: number, a: number | null) => (a ? r2(v / a) : null);
  const linhasResumo: { rot: string; f: (x: ResumoAnual) => number | null; fmt: (v: number | null) => string }[] = [
    { rot: 'Meses considerados', f: (x) => x.meses, fmt: (v) => num(v) },
    { rot: 'Entradas', f: (x) => x.entradas, fmt: eur },
    { rot: '· contribuir.cclx.pt (só pagas)', f: (x) => x.contribuir, fmt: eur },
    { rot: '· coletas em dinheiro (depósitos)', f: (x) => x.coletas, fmt: eur },
    { rot: '· outras (bolsa geral, transferências, gerais)', f: (x) => x.outrasEntradas, fmt: eur },
    { rot: 'Custos fixos', f: (x) => x.custosFixos, fmt: eur },
    { rot: 'Despesas e reembolsos', f: (x) => x.despesas, fmt: eur },
    { rot: 'Parte dos custos gerais', f: (x) => x.gerais, fmt: eur },
    { rot: 'Saídas', f: (x) => x.saidas, fmt: eur },
    { rot: 'Resultado', f: (x) => x.resultado, fmt: eur },
    { rot: 'Cobertura (entradas ÷ saídas)', f: (x) => x.cobertura, fmt: pct },
    { rot: 'Entradas médias por mês', f: (x) => x.mediaMensalEntradas, fmt: eur },
    { rot: 'Média de jovens e adultos (domingo)', f: (x) => x.adultosMedia, fmt: (v) => num(v, 1) },
    { rot: 'Entradas por pessoa e por mês', f: (x) => (x.meses ? porPessoa(x.entradas / x.meses, x.adultosMedia) : null), fmt: eur },
    { rot: 'Custo por pessoa e por mês', f: (x) => (x.meses ? porPessoa(x.saidas / x.meses, x.adultosMedia) : null), fmt: eur },
  ];

  const aCarregar = rAtual.aCarregar || rAntes.aCarregar || coms.aCarregar || ass.aCarregar;
  const periodo = ate ? `janeiro a ${MESES[ate - 1]}, ${ate} ${ate === 1 ? 'mês' : 'meses'}` : 'sem meses decorridos';
  const varAss = variacao(A.adultosMedia, P?.adultosMedia ?? null);

  return (
    <div className="relatorio">
      <div className="linha nao-imprimir" style={{ justifyContent: 'flex-end', marginBottom: 8 }}>
        <button onClick={() => window.print()}>Imprimir / PDF</button>
      </div>
      <div className="so-imprimir" style={{ borderBottom: '2px solid #000', paddingBottom: 10, marginBottom: 14 }}>
        <img src={`${BASE}caf-logo.png`} alt="CAF, Conselho Administrativo e Financeiro, CCLX" style={{ height: 54 }} />
      </div>
      <div className="kicker" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: 'var(--cinza)' }}>{`RELATÓRIO FINANCEIRO · ${nomeCom.toUpperCase()}`}</div>
      <h1>Custos x entradas e assistência {ano}</h1>
      <Frescura ano={ano} ate={ate} calculadoEm={rAtual.dados?.[0]?.calculadoEm} resumos={atual} />

      <Estado aCarregar={aCarregar} erro={rAtual.erro || ass.erro} vazio={!atual.length} />
      {!aCarregar && !!atual.length && <>
        <p>
          Em {ano} ({periodo}), as entradas cobriram <b>{pct(A.cobertura)}</b> das saídas, com um resultado de <b>{eur(A.resultado)}</b>
          {A.resultado < 0 ? ' (défice coberto pelo orçamento geral)' : ''}.
          {A.adultosMedia != null && <> A média foi de <b>{num(A.adultosMedia, 1)}</b> jovens e adultos por domingo{varAss != null ? ` (${varAss >= 0 ? '+' : ''}${pct(varAss)} face a ${ano - 1})` : ''}.</>}
          {domEsperados > 0 && <> Houve registo de assistência em {domComRegisto} de {domEsperados} domingos esperados.</>}
        </p>

        <div className="cards">
          <Kpi titulo="Entradas" valor={eur(A.entradas)} sub={`${eur(A.mediaMensalEntradas)} por mês`} />
          <Kpi titulo="Saídas" valor={eur(A.saidas)} sub="Custos fixos, despesas e gerais" />
          <Kpi titulo="Resultado" valor={eur(A.resultado)} negativo={A.resultado < 0} />
          <Kpi titulo="Cobertura" valor={pct(A.cobertura)} sub="Entradas ÷ saídas" />
          <Kpi titulo="Jovens e adultos" valor={num(A.adultosMedia, 1)} sub={varAss != null ? `${varAss >= 0 ? '+' : ''}${pct(varAss)} face a ${ano - 1}` : 'Média por domingo'} />
        </div>

        <div className="duas-colunas sec">
          <div className="card">
            <h2>Médias mensais por ano</h2>
            <GraficoBarras altura={220} dados={[P ? { r: P, a: ano - 1 } : null, { r: A, a: ano }].filter(Boolean).map((x) => ({
              rotulo: String(x!.a), Entradas: x!.r.meses ? r2(x!.r.entradas / x!.r.meses) : 0, Saídas: x!.r.meses ? r2(x!.r.saidas / x!.r.meses) : 0,
            }))} series={[{ key: 'Entradas', nome: 'Entradas', cor: 'entradas' }, { key: 'Saídas', nome: 'Saídas', cor: 'saidas' }]} />
          </div>
          <div className="card">
            <h2>Composição dos custos fixos ({ano})</h2>
            <GraficoBarras altura={220} dados={rubLista.map(([k, v]) => ({ rotulo: k, Total: v }))} series={[{ key: 'Total', nome: 'Custos fixos no período', cor: 'saidas' }]} />
          </div>
        </div>

        <div className="card sec">
          <h2>Entradas e saídas por mês ({ano})</h2>
          <GraficoBarras altura={230} dados={meses.map((m) => ({ rotulo: MESES_CURTOS[m.mes - 1], _previsao: abertosRel.has(m.mes), Entradas: m.entradas, Saídas: m.saidas }))} series={[{ key: 'Entradas', nome: 'Entradas', cor: 'entradas' }, { key: 'Saídas', nome: 'Saídas', cor: 'saidas' }]} />
        </div>

        <div className="sec quebra-antes">
          <h2>Resumo anual</h2>
          <div className="tabela"><table>
            <thead><tr><th />{P && <th className="num">{ano - 1}</th>}<th className="num">{ano}</th>{P && <th className="num">Variação</th>}</tr></thead>
            <tbody>{linhasResumo.map((l) => {
              const va = l.f(A); const vp = P ? l.f(P) : null;
              return <tr key={l.rot}><td>{l.rot}</td>{P && <td className="num">{l.fmt(vp)}</td>}<td className="num">{l.fmt(va)}</td>{P && <td className="num">{l.rot === 'Meses considerados' ? '' : pct(variacao(va, vp))}</td>}</tr>;
            })}</tbody>
          </table></div>
          {P && <p className="muted small">{ano - 1}: 12 meses. Para comparar anos com número de meses diferente, use as médias mensais e os valores por pessoa.</p>}
        </div>

        <div className="sec">
          <h2>Mês a mês ({ano})</h2>
          <div className="tabela"><table>
            <thead><tr><th>Mês</th><th className="num">Entradas (€)</th><th className="num">Custos fixos (€)</th><th className="num">Despesas (€)</th><th className="num">Gerais (€)</th><th className="num">Saldo (€)</th><th className="num">Saldo acumulado (€)</th><th className="num">Jovens e adultos</th><th className="num">Total de pessoas</th></tr></thead>
            <tbody>{meses.map((m) => (
              <tr key={m.mes}>
                <td>{MESES[m.mes - 1]}</td><td className="num">{dec(m.entradas)}</td><td className="num">{dec(m.custosFixos)}</td><td className="num">{dec(m.despesas)}</td>
                <td className="num">{dec(m.gerais)}</td>
                <td className={'num' + (m.saldo < 0 ? ' neg' : '')}>{dec(m.saldo)}</td><td className={'num' + (m.saldoAcumulado < 0 ? ' neg' : '')}>{dec(m.saldoAcumulado)}</td>
                <td className="num">{num(m.adultosMedia, 1)}</td><td className="num">{num(pessoas[m.mes - 1], 1)}</td>
              </tr>
            ))}</tbody>
            <tfoot><tr className="total-geral"><td>Total</td><td className="num">{dec(A.entradas)}</td><td className="num">{dec(A.custosFixos)}</td><td className="num">{dec(A.despesas)}</td><td className="num">{dec(A.gerais)}</td><td className={'num' + (A.resultado < 0 ? ' neg' : '')}>{dec(A.resultado)}</td><td /><td className="num">{num(A.adultosMedia, 1)}</td><td /></tr></tfoot>
          </table></div>
          <p className="muted small">Assistência: média por domingo (celebrações). "Total de pessoas" inclui jovens e adultos, Jump, crianças e Connect's.</p>
        </div>

        {!!rubLista.length && (
          <div className="sec">
            <h2>Custos fixos por rubrica</h2>
            <div className="tabela"><table>
              <thead><tr><th>Rubrica</th><th className="num">Média mensal</th><th className="num">Total no período</th></tr></thead>
              <tbody>{rubLista.map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{eur(ate ? r2(v / ate) : 0)}</td><td className="num">{eur(v)}</td></tr>)}</tbody>
            </table></div>
          </div>
        )}

        <div className="sec">
          <h2>Pressupostos e notas</h2>
          <ul>
            <li>Período: {periodo}. Os meses fechados contam os dados fotografados no fecho mensal, sem previsão dos custos fixos; os meses abertos são provisórios (Contribuir, Depósitos, Reembolsos e banco já registados, mais a previsão dos custos fixos por pagar) e aparecem em tom claro nos gráficos.</li>
            <li>Entradas do contribuir.cclx.pt só com o campo Pago preenchido ("PAGO"); coletas em dinheiro pelos depósitos registados.</li>
            <li>Os custos e proveitos gerais da CCLX são repartidos pelas comunidades conforme a média de jovens e adultos dos últimos 12 meses.</li>
            <li>Vencimentos e Segurança Social aparecem agregados em "Outros custos de funcionamento".</li>
            <li>A assistência conta só {tipo ? `os registos do tipo "${tipo}"` : 'os registos de domingo'}; os domingos do quadro de exceções não são esperados.</li>
            {!!pendentes.length && <li><b>Pendente de confirmação:</b> {pendentes.map((c) => `${c.rubrica}: ${c.notas}`).join(' ')}</li>}
          </ul>
          <p className="muted small">Fonte: Portal CAF (Jotform e tabela de custos fixos). Valores em euros, com duas casas decimais. Gerado em {new Date().toLocaleString('pt-PT')}.</p>
        </div>
      </>}
    </div>
  );
}
