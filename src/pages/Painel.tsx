import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Estado, GraficoBarras, Kpi, useCarregar, useFiltros, mensagemErro, Frescura } from '../components/ui';
import { listarComunidades, listarResumos } from '../lib/db';
import { recalcularAno } from '../lib/recalcular';
import { somarMeses, partesMes, GERAIS_POR_REPARTIR, mesesDecorridos, estadoMeses } from '../lib/resumos';
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

  const nomes = new Map((comunidades.dados ?? []).map((c) => [c.id, c.nome]));
  const todos = r.dados ?? [];
  const selecionados = todos.filter((x) => (comunidade === 'todas' ? x.comunidadeId !== 'bolsa-geral' : x.comunidadeId === comunidade));
  const porMes = Array.from({ length: 12 }, (_, i) => somarMeses(selecionados.map((s) => s.meses[i])));
  const tot = somarMeses(porMes);
  const abertos = new Set(estadoMeses(selecionados).abertos);
  // Custos fixos previstos (tabela) do ano, com a parte dos custos fixos gerais repartida pela média proporcional de assistência.
  const cfProprio = r2(selecionados.reduce((s0, x) => s0 + x.meses.reduce((t, mm) => t + (mm.cfPrevisto ?? 0), 0), 0));
  const cfGeral = r2(selecionados.reduce((s0, x) => s0 + x.meses.reduce((t, mm) => t + (mm.cfGeralPrevisto ?? 0), 0), 0));
  const cfAnual = r2(cfProprio + cfGeral);
  const p = partesMes(tot); // custos e despesas que ficaram + parte dos gerais (somam ao saldo)
  const bolsa = todos.find((x) => x.comunidadeId === 'bolsa-geral');
  const bolsaTot = bolsa ? somarMeses(bolsa.meses) : null;
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
          <Kpi titulo="Entradas" valor={eur(tot.entradas)} sub={<>Contribuir {eur(tot.contribuir)} · coletas {eur(tot.coletas)}{tot.quotaBolsa ? ` · bolsa ${eur(tot.quotaBolsa)}` : ''}</>} />
          <Kpi titulo="Custos fixos anuais" valor={eur(cfAnual)} sub={`Previsão do ano · inclui ${eur(cfGeral)} da parte do geral`} />
          <Kpi titulo="Custos fixos mensais" valor={eur(r2(cfAnual / 12))} sub={`Média por mês · inclui ${eur(r2(cfGeral / 12))} da parte do geral`} />
          <Kpi titulo="Despesas e reembolsos" valor={eur(p.despesas)} />
          {!!p.gerais && <Kpi titulo="Parte dos gerais" valor={eur(p.gerais)} sub="Custos gerais repartidos por média proporcional de assistência" />}
          <Kpi titulo="Saldo" valor={eur(tot.saldo)} negativo={tot.saldo < 0} sub={tot.saldo < 0 ? 'Défice coberto pelo orçamento geral' : undefined} />
          <Kpi titulo="Cobertura dos custos fixos" valor={p.custosFixos ? pct(tot.entradas / p.custosFixos) : '—'} sub="Entradas ÷ custos fixos" />
        </div>

        <div className="sec card">
          <h2>Entradas e saídas por mês</h2>
          <GraficoBarras empilhado dados={porMes.map((m, i) => {
            const pm = partesMes(m);
            return { rotulo: MESES_CURTOS[i], _previsao: abertos.has(i + 1), Contribuir: m.contribuir, Coletas: m.coletas + m.transferencias + m.quotaBolsa, 'Custos fixos': pm.custosFixos, Despesas: pm.despesas, Gerais: pm.gerais };
          })} series={[
            { key: 'Contribuir', nome: 'Contribuir', stack: 'e', cor: 'entradas' },
            { key: 'Coletas', nome: 'Coletas, transferências e bolsa', stack: 'e', cor: 'entradas2' },
            { key: 'Custos fixos', nome: 'Custos fixos', stack: 's', cor: 'saidas' },
            { key: 'Despesas', nome: 'Despesas e reembolsos', stack: 's', cor: 'saidas2' },
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
                  {todos.filter((x) => x.comunidadeId !== 'bolsa-geral')
                    .sort((a, b) => (comunidades.dados?.find((c) => c.id === a.comunidadeId)?.ordem ?? 50) - (comunidades.dados?.find((c) => c.id === b.comunidadeId)?.ordem ?? 50))
                    .map((x) => { const t = partesMes(somarMeses(x.meses)); return (
                      <tr key={x.id}>
                        <td>{x.comunidadeId === GERAIS_POR_REPARTIR ? 'Gerais por repartir' : nomes.get(x.comunidadeId) ?? x.comunidadeId}</td>
                        <td className="num">{dec(t.entradas)}</td><td className="num">{dec(t.custosFixos)}</td><td className="num">{dec(t.despesas)}</td><td className="num">{dec(t.gerais)}</td>
                        <td className={'num' + (t.saldo < 0 ? ' neg' : '')}>{dec(t.saldo)}</td>
                        <td className="num">{t.custosFixos ? pct(t.entradas / t.custosFixos) : '—'}</td>
                      </tr>); })}
                </tbody>
                <tfoot><tr className="total-geral"><td>Total</td><td className="num">{dec(tot.entradas)}</td><td className="num">{dec(p.custosFixos)}</td><td className="num">{dec(p.despesas)}</td><td className="num">{dec(p.gerais)}</td><td className={'num' + (tot.saldo < 0 ? ' neg' : '')}>{dec(tot.saldo)}</td><td className="num">{p.custosFixos ? pct(tot.entradas / p.custosFixos) : '—'}</td></tr></tfoot>
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
          <Detalhe titulo="Despesas e reembolsos por categoria" dados={tot.despesasPorCategoria} />
          <Detalhe titulo="Custos fixos por rubrica" dados={tot.custosRubricas} nota="Vencimentos e Segurança Social são confidenciais: aparecem juntos em “Outros custos de funcionamento”." />
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
