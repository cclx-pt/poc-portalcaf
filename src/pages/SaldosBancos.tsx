import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { bancoDaConta, estatisticasSaldos, previsaoSaldos, saldosMensais, verificarExtratos } from '../lib/banco';
import { CATEGORICAS, CORES } from '../lib/cores';
import { eur, eurK, MESES, MESES_CURTOS, XLSX_EUR } from '../lib/format';
import type { BancoLote, Conta } from '../lib/types';
import { LogoBanco } from '../components/LogoBanco';

const pctTxt = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

/**
 * Vista de saldos dos bancos: saldos mensais por conta e total, gráfico com previsão,
 * médias e extremos, verificação dos extratos, classificação por mês e exportação para Excel.
 */
export default function SaldosBancos({ contas, lotes, ano, aoAbrirMes }: { contas: Conta[]; lotes: BancoLote[]; ano: number; aoAbrirMes: (mes: number) => void }) {
  const ids = contas.map((c) => c.id);
  const s = saldosMensais(lotes, ids);
  const est = estatisticasSaldos(s);
  const avisos = verificarExtratos(lotes, ids);
  const prev = previsaoSaldos(s);
  const ultimo = [...s].reverse().find((x) => x.total?.saldoFinal != null);
  const nome = (id: string) => contas.find((c) => c.id === id)?.nome ?? id;

  const dados = s.map((x) => ({
    mes: MESES_CURTOS[x.mes - 1],
    ...Object.fromEntries(ids.map((id) => [id, x.contas[id]?.saldoFinal ?? null])),
    total: x.total?.saldoFinal ?? null,
    previsto: prev.find((p) => p.mes === x.mes)?.saldo ?? (ultimo && x.mes === ultimo.mes ? ultimo.total!.saldoFinal : null),
  }));

  async function exportar() {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`Saldos ${ano}`);
    const cab = ['Mês'];
    for (const id of ids) cab.push(`${nome(id)}: saldo inicial`, `${nome(id)}: entradas`, `${nome(id)}: saídas`, `${nome(id)}: saldo final`);
    cab.push('Total: saldo inicial', 'Total: entradas', 'Total: saídas', 'Total: saldo final');
    ws.addRow(cab).font = { bold: true, name: 'Montserrat' };
    for (const x of s) {
      const linha: (string | number | null)[] = [MESES[x.mes - 1]];
      for (const id of ids) { const c = x.contas[id]; linha.push(c?.saldoInicial ?? null, c?.entradas ?? null, c?.saidas ?? null, c?.saldoFinal ?? null); }
      linha.push(x.total?.saldoInicial ?? null, x.total?.entradas ?? null, x.total?.saidas ?? null, x.total?.saldoFinal ?? null);
      ws.addRow(linha);
    }
    ws.columns.forEach((c, i) => { c.width = i ? 18 : 12; if (i) c.numFmt = XLSX_EUR; });
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = `saldos-bancos-${ano}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!est.meses) return <p className="muted">Ainda não há extratos de {ano} nas contas visíveis.</p>;
  const mesNome = (m?: { mes: number } | null) => (m ? MESES[m.mes - 1] : '—');
  return (
    <>
      <div className="cards">
        <div className="kpi kpi-total"><h3>Saldo atual</h3><div className="valor">{eur(ultimo?.total?.saldoFinal)}</div><div className="sub">no fim de {mesNome(ultimo)} · contas visíveis</div></div>
        <div className="kpi"><h3>Saldo médio</h3><div className="valor">{eur(est.saldoMedio)}</div><div className="sub">{est.meses} meses com extrato</div></div>
        <div className="kpi"><h3>Saldo mínimo</h3><div className="valor">{eur(est.saldoMinimo?.valor)}</div><div className="sub">{mesNome(est.saldoMinimo)} · máximo {eur(est.saldoMaximo?.valor)} em {mesNome(est.saldoMaximo)}</div></div>
        <div className="kpi"><h3>Média mensal</h3><div className="valor">{eur(est.entradasMedia)}</div><div className="sub">de entradas · {eur(est.saidasMedia)} de saídas</div></div>
        <div className="kpi"><h3>Mês com mais saídas</h3><div className="valor">{eur(est.maisSaidas?.valor)}</div><div className="sub">{mesNome(est.maisSaidas)}</div></div>
      </div>

      <div className="sec card">
        <h2>Verificação dos extratos</h2>
        {avisos.length ? (
          <ul className="avisos-extrato">
            {avisos.map((a) => (
              <li key={`${a.contaId}-${a.tipo}-${a.mes}`}><LogoBanco banco={bancoDaConta(contas.find((c) => c.id === a.contaId) ?? { id: a.contaId })} tamanho={16} /> <b>{nome(a.contaId)}:</b> {a.texto}</li>
            ))}
          </ul>
        ) : <p className="small">✓ Extratos sem meses em falta e com os saldos encadeados de mês para mês e dentro de cada mês.</p>}
      </div>

      <div className="sec card">
        <div className="linha" style={{ justifyContent: 'space-between' }}>
          <h2>Saldo no fim de cada mês</h2>
          <span className="small muted">Linha tracejada: saldo previsto até dezembro (média do movimento líquido dos últimos 3 meses).</span>
        </div>
        <div style={{ height: 300 }}>
          <ResponsiveContainer>
            <LineChart data={dados} margin={{ top: 10, right: 20, bottom: 0, left: 10 }}>
              <CartesianGrid stroke={CORES.grelha} vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 12, fill: CORES.eixo }} />
              <YAxis tickFormatter={(v) => eurK(Number(v))} tick={{ fontSize: 12, fill: CORES.eixo }} width={90} />
              <Tooltip formatter={(v: number, n: string) => [eur(v), n]} />
              <Legend />
              {ids.map((id, i) => <Line key={id} dataKey={id} name={nome(id)} stroke={CATEGORICAS[i % CATEGORICAS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />)}
              <Line dataKey="total" name="Total" stroke={CORES.texto} strokeWidth={2.5} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
              {prev.length > 0 && <Line dataKey="previsto" name="Previsto" stroke={CORES.texto} strokeDasharray="5 5" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="linha" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Saldos mensais</h2>
        <button className="sec" onClick={() => void exportar()}>Exportar para Excel</button>
      </div>
      <div className="tabela sec">
        <table className="tabela-saldos">
          <thead>
            <tr><th>Mês</th>{ids.map((id) => <th key={id} className="num"><LogoBanco banco={bancoDaConta(contas.find((c) => c.id === id)!)} tamanho={14} /> {nome(id)}</th>)}
              <th className="num">Saldo inicial</th><th className="num">Entradas</th><th className="num">Saídas</th><th className="num">Saldo final</th><th className="num">Classificados</th><th className="num">Conciliados</th><th /></tr>
          </thead>
          <tbody>
            {s.map((x) => {
              const n = ids.reduce((a, id) => a + (x.contas[id]?.n ?? 0), 0);
              const cl = ids.reduce((a, id) => a + (x.contas[id]?.classificados ?? 0), 0);
              const co = ids.reduce((a, id) => a + (x.contas[id]?.conciliados ?? 0), 0);
              const p = prev.find((y) => y.mes === x.mes);
              return (
                <tr key={x.mes} className={x.total ? 'clicavel' : 'sem-extrato'} onClick={() => x.total && aoAbrirMes(x.mes)}>
                  <td>{MESES[x.mes - 1].charAt(0).toUpperCase() + MESES[x.mes - 1].slice(1)}</td>
                  {ids.map((id) => <td key={id} className="num">{x.contas[id] ? eur(x.contas[id]!.saldoFinal) : '—'}</td>)}
                  {x.total ? <>
                    <td className="num">{eur(x.total.saldoInicial)}</td><td className="num">{eur(x.total.entradas)}</td><td className="num">{eur(x.total.saidas)}</td>
                    <td className="num"><b>{eur(x.total.saldoFinal)}</b></td><td className="num">{pctTxt(cl, n)}</td><td className="num">{pctTxt(co, n)}</td>
                    <td><button className="link" onClick={(e) => { e.stopPropagation(); aoAbrirMes(x.mes); }}>Ver mês</button></td>
                  </> : <td colSpan={7} className="muted small">{p ? `Sem extrato · previsto ${eur(p.saldo)}` : 'Sem extrato'}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">O total soma as contas visíveis com extrato nesse mês. "Classificados" inclui os movimentos com categoria, comunidade, a contabilizar ou conciliados; "Conciliados" são os que correspondem a registos do Jotform.</p>
    </>
  );
}
