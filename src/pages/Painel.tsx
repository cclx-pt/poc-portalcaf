import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Estado, GraficoBarras, Kpi, useCarregar, useFiltros, mensagemErro, Frescura, useModoMeses, SeletorMeses } from '../components/ui';
import { listarComunidades, listarResumos } from '../lib/db';
import { recalcularAno } from '../lib/recalcular';
import { somarMeses, GERAIS_POR_REPARTIR, mesesDecorridos, estadoMeses, aplicarComponentes, TODOS_COMPONENTES, type ComponentesPainel } from '../lib/resumos';
import type { Resumo } from '../lib/types';
import { dec, eur, MESES_CURTOS, pct, hoje, r2 } from '../lib/format';
import Publico from './Publico';

export default function Painel() {
  const { acesso, pode, temNivel } = useAuth();
  if (!temNivel('privado')) return <Publico embutido />;
  return <PainelPrivado podeRecalcular={pode('publicar')} acessoEmail={acesso!.email} />;
}

function PainelPrivado({ podeRecalcular }: { podeRecalcular: boolean; acessoEmail: string }) {
  const { acesso } = useAuth();
  const { ano, comunidade } = useFiltros();
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const comunidades = useCarregar(listarComunidades, []);
  const r = useCarregar(() => listarResumos(acesso!, ano), [ano, acesso?.email]);
  // "Com previsões": meses abertos com a previsão dos custos fixos. "Só meses fechados": os meses abertos ficam de fora.
  const [modoMeses, mudarModo] = useModoMeses();
  // Componentes ligados (Contribuir, depósitos, reembolsos, custos fixos…), guardados neste browser.
  const [comp, setComp] = useState<ComponentesPainel>(() => {
    try { return { ...TODOS_COMPONENTES, ...JSON.parse(localStorage.getItem('caf-portal:painel-componentes') ?? '{}') }; } catch { return TODOS_COMPONENTES; }
  });
  const alternarComp = (k: keyof ComponentesPainel) => setComp((c) => {
    const n = { ...c, [k]: !c[k] };
    try { localStorage.setItem('caf-portal:painel-componentes', JSON.stringify(n)); } catch { /* sem armazenamento */ }
    return n;
  });

  const nomes = new Map((comunidades.dados ?? []).map((c) => [c.id, c.nome]));
  const todos = r.dados ?? [];
  const reais = modoMeses === 'reais';
  // Em "Valores reais", cada resumo usa os meses reais (resumos antigos, sem eles: os meses oficiais).
  const comMeses = (x: Resumo): Resumo => (reais && x.mesesReais ? { ...x, meses: x.mesesReais } : x);
  const selecionados = todos.filter((x) => (comunidade === 'todas' ? x.comunidadeId !== 'bolsa-geral' : x.comunidadeId === comunidade)).map(comMeses);
  const abertos = new Set(reais ? [] : estadoMeses(selecionados).abertos);
  const soFechados = modoMeses === 'fechados';
  /** Meses que entram nos totais: todos, ou só os fechados. */
  const conta = (mes: number) => !soFechados || !abertos.has(mes);
  const porMes = Array.from({ length: 12 }, (_, i) => somarMeses(conta(i + 1) ? selecionados.map((s) => s.meses[i]) : []));
  const tot = somarMeses(porMes);
  const nFechados = Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => !abertos.has(m)).length;
  // Custos fixos previstos (tabela) do ano, com a parte dos custos fixos gerais repartida pela média proporcional de assistência.
  const cfProprio = r2(selecionados.reduce((s0, x) => s0 + x.meses.reduce((t, mm) => t + (mm.cfPrevisto ?? 0), 0), 0));
  const cfGeral = r2(selecionados.reduce((s0, x) => s0 + x.meses.reduce((t, mm) => t + (mm.cfGeralPrevisto ?? 0), 0), 0));
  const cfAnual = r2(cfProprio + cfGeral);
  const p = aplicarComponentes(tot, comp); // só os componentes ligados; custos e despesas que ficaram + parte dos gerais
  const bolsa = todos.map(comMeses).find((x) => x.comunidadeId === 'bolsa-geral');
  const bolsaTot = bolsa ? somarMeses(bolsa.meses.filter((m) => conta(m.mes))) : null;
  const calculado = todos[0]?.calculadoEm;

  async function recalcular() {
    setOcupado(true); setMsg(null);
    try { await recalcularAno(acesso!, ano); await r.recarregar(); setMsg('Resumos recalculados.'); }
    catch (e) { setMsg(mensagemErro(e)); } finally { setOcupado(false); }
  }

  const titulo = comunidade === 'todas' ? 'CCLX consolidado' : nomes.get(comunidade) ?? comunidade;
  return (
    <>
      <div className="linha" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1>{titulo}: custos x entradas {ano}</h1>
          <div className="linha" style={{ margin: '4px 0 8px' }}>
            <SeletorMeses modo={modoMeses} aoMudar={mudarModo} resumos={todos} />
            <div className="campo" role="group" aria-label="Componentes incluídos">
              <span>Incluir</span>
              <span className="linha" style={{ gap: 12 }}>
                {([['contribuir', 'Contribuir'], ['depositos', 'Depósitos'], ['transferencias', 'Transferências e bolsa'], ['despesas', 'Reembolsos e despesas'], ['custosFixos', 'Custos fixos'], ['gerais', 'Parte dos gerais']] as [keyof ComponentesPainel, string][]).map(([k, rot]) => (
                  <label key={k} className="opcao"><input type="checkbox" checked={comp[k]} onChange={() => alternarComp(k)} />{rot}</label>
                ))}
              </span>
            </div>
            {soFechados && <span className="small muted">{abertos.size ? `${nFechados} ${nFechados === 1 ? 'mês fechado' : 'meses fechados'}; os meses abertos não entram nos totais nem no gráfico.` : 'Todos os meses com dados estão fechados.'}</span>}
          </div>
          <p className="muted">
            {calculado ? `Resumos calculados em ${new Date(calculado).toLocaleString('pt-PT')}.` : 'Ainda não há resumos calculados para este ano.'}{' '}
            Entradas = Contribuir + coletas + transferências atribuídas + quota da bolsa geral. Saídas = custos fixos + despesas e reembolsos + parte dos custos gerais (repartidos por média proporcional de assistência).
          </p>
        </div>
        {podeRecalcular && <button disabled={ocupado} onClick={recalcular}>{ocupado ? 'A recalcular…' : 'Recalcular resumos'}</button>}
      </div>
      <Frescura ano={ano} ate={mesesDecorridos(ano, hoje())} calculadoEm={calculado} resumos={selecionados} />
      {msg && <div className="nota">{msg}</div>}
      <Estado aCarregar={r.aCarregar} erro={r.erro} vazio={!todos.length} />
      {!!todos.length && <>
        <div className="cards">
          <Kpi titulo="Entradas" valor={eur(p.entradas)} sub={<>{comp.contribuir && <>Contribuir {eur(tot.contribuir)}</>}{comp.depositos && <> · coletas {eur(tot.coletas)}</>}{comp.transferencias && !!tot.quotaBolsa && <> · bolsa {eur(tot.quotaBolsa)}</>}</>} />
          {comp.custosFixos && <Kpi titulo="Custos fixos anuais" valor={eur(cfAnual)} sub={`Previsão do ano · inclui ${eur(cfGeral)} da parte do geral`} />}
          {comp.custosFixos && <Kpi titulo="Custos fixos mensais" valor={eur(r2(cfAnual / 12))} sub={`Média por mês · inclui ${eur(r2(cfGeral / 12))} da parte do geral`} />}
          {comp.despesas && <Kpi titulo="Despesas e reembolsos" valor={eur(p.despesas)} />}
          {!!p.gerais && <Kpi titulo="Parte dos gerais" valor={eur(p.gerais)} sub="Custos gerais repartidos por média proporcional de assistência" />}
          <Kpi titulo="Saldo" valor={eur(p.saldo)} negativo={p.saldo < 0} sub={p.saldo < 0 ? 'Défice coberto pelo orçamento geral' : undefined} />
          {comp.custosFixos && <Kpi titulo="Cobertura dos custos fixos" valor={p.custosFixos ? pct(p.entradas / p.custosFixos) : '—'} sub="Entradas ÷ custos fixos" />}
        </div>

        <div className="sec card">
          <h2>Entradas e saídas por mês</h2>
          <GraficoBarras empilhado dados={porMes.map((m, i) => {
            const pm = aplicarComponentes(m, comp);
            return { rotulo: MESES_CURTOS[i], _previsao: abertos.has(i + 1), Contribuir: pm.contribuir, Coletas: r2(pm.entradas - pm.contribuir), 'Custos fixos': pm.custosFixos, Despesas: pm.despesas, Gerais: pm.gerais };
          })} series={[
            ...(comp.contribuir ? [{ key: 'Contribuir', nome: 'Contribuir', stack: 'e', cor: 'entradas' as const }] : []),
            ...(comp.depositos || comp.transferencias ? [{ key: 'Coletas', nome: comp.depositos && comp.transferencias ? 'Coletas, transferências e bolsa' : comp.depositos ? 'Depósitos de coletas' : 'Transferências e bolsa', stack: 'e', cor: 'entradas2' as const }] : []),
            ...(comp.custosFixos ? [{ key: 'Custos fixos', nome: 'Custos fixos', stack: 's', cor: 'saidas' as const }] : []),
            ...(comp.despesas ? [{ key: 'Despesas', nome: 'Despesas e reembolsos', stack: 's', cor: 'saidas2' as const }] : []),
            ...(p.gerais ? [{ key: 'Gerais', nome: 'Parte dos gerais', stack: 's', cor: 'saidas3' as const }] : []),
          ]} />
        </div>

        {comunidade === 'todas' && (
          <div className="sec">
            <h2>Por comunidade</h2>
            <div className="tabela">
              <table>
                <thead><tr><th>Comunidade</th><th className="num">Entradas (€)</th><th className="num">Custos fixos (€)</th><th className="num">Despesas (€)</th><th className="num">Parte dos gerais (€)</th><th className="num">Saldo (€)</th><th className="num">Cobertura</th></tr></thead>
                <tbody>
                  {todos.map(comMeses).filter((x) => x.comunidadeId !== 'bolsa-geral')
                    .sort((a, b) => (comunidades.dados?.find((c) => c.id === a.comunidadeId)?.ordem ?? 50) - (comunidades.dados?.find((c) => c.id === b.comunidadeId)?.ordem ?? 50))
                    .map((x) => { const t = aplicarComponentes(somarMeses(x.meses.filter((m) => conta(m.mes))), comp); return (
                      <tr key={x.id}>
                        <td>{x.comunidadeId === GERAIS_POR_REPARTIR ? 'Gerais por repartir' : nomes.get(x.comunidadeId) ?? x.comunidadeId}</td>
                        <td className="num">{dec(t.entradas)}</td><td className="num">{dec(t.custosFixos)}</td><td className="num">{dec(t.despesas)}</td><td className="num">{dec(t.gerais)}</td>
                        <td className={'num' + (t.saldo < 0 ? ' neg' : '')}>{dec(t.saldo)}</td>
                        <td className="num">{t.custosFixos ? pct(t.entradas / t.custosFixos) : '—'}</td>
                      </tr>); })}
                </tbody>
                <tfoot><tr className="total-geral"><td>Total</td><td className="num">{dec(p.entradas)}</td><td className="num">{dec(p.custosFixos)}</td><td className="num">{dec(p.despesas)}</td><td className="num">{dec(p.gerais)}</td><td className={'num' + (p.saldo < 0 ? ' neg' : '')}>{dec(p.saldo)}</td><td className="num">{p.custosFixos ? pct(p.entradas / p.custosFixos) : '—'}</td></tr></tfoot>
              </table>
            </div>
            {bolsaTot && (bolsaTot.contribuir + bolsaTot.coletas + bolsaTot.transferencias) > 0 && (
              <p className="muted" style={{ marginTop: 8 }}>
                Bolsa geral (ofertas sem comunidade): {eur(bolsaTot.contribuir + bolsaTot.coletas + bolsaTot.transferencias)} recebidos,
                {' '}{eur(-bolsaTot.quotaBolsa)} distribuídos, cada mês, pela percentagem da média de assistência de adultos de cada comunidade nos últimos 12 meses. O restante fica por distribuir (sem registos de assistência nesses 12 meses).
              </p>
            )}
          </div>
        )}

        <div className="grid2">
          <Detalhe titulo="Entradas por categoria" dados={tot.entradasPorCategoria} />
          {comp.despesas && <Detalhe titulo="Despesas e reembolsos por categoria" dados={tot.despesasPorCategoria} />}
          {comp.custosFixos && <Detalhe titulo="Custos fixos por rubrica" dados={tot.custosRubricas} nota="Vencimentos e Segurança Social são confidenciais: aparecem juntos em “Outros custos de funcionamento”." />}
        </div>
      </>}
    </>
  );
}

function Detalhe({ titulo, dados, nota }: { titulo: string; dados: Record<string, number>; nota?: string }) {
  const linhas = Object.entries(dados).sort((a, b) => b[1] - a[1]);
  const total = linhas.reduce((s, [, v]) => s + v, 0);
  return (
    <div className="sec">
      <h2>{titulo}</h2>
      {nota && <p className="muted">{nota}</p>}
      <div className="tabela">
        <table>
          <thead><tr><th>Categoria</th><th className="num">Valor</th><th className="num">Peso</th></tr></thead>
          <tbody>
            {linhas.length ? linhas.map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{eur(v)}</td><td className="num">{total ? pct(v / total) : '—'}</td></tr>)
              : <tr><td colSpan={3} className="muted">Sem registos.</td></tr>}
          </tbody>
          {!!linhas.length && <tfoot><tr><td>Total</td><td className="num">{eur(total)}</td><td /></tr></tfoot>}
        </table>
      </div>
    </div>
  );
}
