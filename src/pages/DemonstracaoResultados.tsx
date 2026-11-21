import { Fragment, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Estado, useCarregar, useFiltros, Frescura, SeletorMeses, useModoMeses } from '../components/ui';
import { listarCategorias, listarComunidades, listarResumos } from '../lib/db';
import { linhasDR, type LinhaDR } from '../lib/analise';
import { eurContab, MESES, MESES_CURTOS, pct, r2, XLSX_EUR, hoje } from '../lib/format';
import { OUTROS_FUNCIONAMENTO, classificador } from '../lib/rubricas';
import { GERAIS_POR_REPARTIR, mesesDecorridos, resumosNoModo } from '../lib/resumos';

type Colunas = 'comunidades' | 'meses';
/** Vencimentos são confidenciais: entram em "Outros custos de funcionamento"; estas linhas só aparecem com valor. */
const ESCONDER_A_ZERO = ['Vencimentos e encargos', '01 Pessoal', OUTROS_FUNCIONAMENTO];
interface Coluna { id: string; nome: string }

/** Demonstração de resultados por rubrica: colunas por comunidade (+ CCLX) ou por mês. */
export default function DemonstracaoResultados() {
  const { acesso } = useAuth();
  const { ano, comunidade } = useFiltros();
  const resumos = useCarregar(() => listarResumos(acesso!, ano), [ano, acesso?.email]);
  const coms = useCarregar(listarComunidades, []);
  const cats = useCarregar(listarCategorias, []);
  const [colunas, setColunas] = useState<Colunas>('comunidades');
  const [de, setDe] = useState(1);
  const [ate, setAte] = useState(12);
  const [separar, setSeparar] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);

  const nomes = new Map((coms.dados ?? []).map((c) => [c.id, c.nome]));
  nomes.set(GERAIS_POR_REPARTIR, 'Gerais por repartir');
  nomes.set('bolsa-geral', 'Geral (por distribuir)');
  const ordem = new Map((coms.dados ?? []).map((c) => [c.id, c.ordem]));
  const [modoMeses, setModoMeses] = useModoMeses();
  const todos = useMemo(() => resumosNoModo(resumos.dados ?? [], modoMeses), [resumos.dados, modoMeses]);
  const sel = comunidade === 'todas' ? todos : todos.filter((r) => r.comunidadeId === comunidade);

  // Colunas e linhas
  const { cols, linhas } = useMemo(() => {
    if (colunas === 'comunidades') {
      const ls = linhasDR(sel, de, ate, separar);
      const temValor = (id: string) => ls.some((l) => l.valores[id]);
      const cs: Coluna[] = sel
        .filter((r) => (r.comunidadeId !== 'bolsa-geral' && r.comunidadeId !== GERAIS_POR_REPARTIR) || temValor(r.comunidadeId))
        .sort((a, b) => (ordem.get(a.comunidadeId) ?? 90) - (ordem.get(b.comunidadeId) ?? 90))
        .map((r) => ({ id: r.comunidadeId, nome: nomes.get(r.comunidadeId) ?? r.comunidadeId }));
      return { cols: [...cs, { id: 'cclx', nome: comunidade === 'todas' ? 'CCLX' : 'Total' }], linhas: ls };
    }
    // Colunas = meses: uma coluna por mês do período, mais o total.
    const meses = Array.from({ length: ate - de + 1 }, (_, i) => de + i);
    const base = linhasDR(sel, de, ate, separar);
    const porMes = meses.map((m) => linhasDR(sel, m, m, separar));
    const ls: LinhaDR[] = base.map((l, i) => ({
      ...l,
      valores: { ...Object.fromEntries(meses.map((m, j) => [String(m), porMes[j][i].valores.cclx])), cclx: l.valores.cclx },
    }));
    return { cols: [...meses.map((m) => ({ id: String(m), nome: MESES_CURTOS[m - 1] })), { id: 'cclx', nome: 'Total' }], linhas: ls };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos, comunidade, colunas, de, ate, separar, coms.dados]);

  const total = (tipo: 'entrada' | 'saida') => Object.fromEntries(cols.map((c) => [c.id, r2(linhas.filter((l) => l.tipo === tipo).reduce((s, l) => s + (l.valores[c.id] ?? 0), 0))]));
  const tE = total('entrada');
  const tS = total('saida');

  // Detalhe de uma rubrica por categoria (valores registados, antes da repartição).
  const classificar = classificador(cats.dados ?? []);
  function detalhe(tipo: 'entrada' | 'saida', rubrica: string): { nome: string; valores: Record<string, number> }[] {
    const acc = new Map<string, Record<string, number>>();
    const juntar = (cat: string, col: string, v: number) => {
      const o = acc.get(cat) ?? {};
      o[col] = r2((o[col] ?? 0) + v); o.cclx = r2((o.cclx ?? 0) + v);
      acc.set(cat, o);
    };
    for (const r of sel) for (const x of r.meses) {
      if (x.mes < de || x.mes > ate) continue;
      const col = colunas === 'comunidades' ? r.comunidadeId : String(x.mes);
      const fontes: [string, number][] = tipo === 'entrada'
        ? Object.entries(x.entradasPorCategoria ?? {})
        : [...Object.entries(x.despesasPorCategoria ?? {}), ...Object.entries(x.custosRubricas ?? {})];
      for (const [cat, v] of fontes) {
        const k = cat === OUTROS_FUNCIONAMENTO ? { rubrica: OUTROS_FUNCIONAMENTO, confidencial: true } : classificar(cat, tipo);
        const rb = k.confidencial ? OUTROS_FUNCIONAMENTO : k.rubrica;
        if (rb === rubrica) juntar(k.confidencial ? OUTROS_FUNCIONAMENTO : cat, col, v);
      }
    }
    return [...acc.entries()].map(([nome, valores]) => ({ nome, valores })).sort((a, b) => (b.valores.cclx ?? 0) - (a.valores.cclx ?? 0));
  }

  async function exportar() {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Demonstração de resultados');
    ws.addRow([`Demonstração de resultados ${ano} (${MESES[de - 1]} a ${MESES[ate - 1]})`]).font = { bold: true, name: 'Montserrat' };
    ws.addRow(['Rubrica', ...cols.map((c) => c.nome)]).font = { bold: true, name: 'Montserrat' };
    const linha = (rot: string, v: Record<string, number>) => ws.addRow([rot, ...cols.map((c) => v[c.id] ?? 0)]);
    for (const tipo of ['entrada', 'saida'] as const) {
      ws.addRow([tipo === 'entrada' ? 'RENDIMENTOS' : 'GASTOS']).font = { bold: true };
      for (const l of linhas.filter((x) => x.tipo === tipo)) linha(l.rubrica + (l.parte ? (l.parte === 'local' ? ' (local)' : ' (parte dos gerais)') : ''), l.valores);
      linha(tipo === 'entrada' ? 'Total de rendimentos' : 'Total de gastos', tipo === 'entrada' ? tE : tS).font = { bold: true };
    }
    linha('RESULTADO', Object.fromEntries(cols.map((c) => [c.id, r2(tE[c.id] - tS[c.id])]))).font = { bold: true };
    ws.getColumn(1).width = 40;
    cols.forEach((_, i) => { ws.getColumn(i + 2).width = 16; ws.getColumn(i + 2).numFmt = XLSX_EUR; });
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = `demonstracao-resultados-${ano}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // "0,00" = zero real; "—" = sem dados. Negativos entre parênteses (formato contabilístico).
  const celula = (v: number | undefined, forte = false) => (
    <td className={'num' + ((v ?? 0) < 0 ? ' neg' : '') + (v === 0 ? ' muted' : '')} style={forte ? { fontWeight: 700 } : undefined}>{eurContab(v)}</td>
  );
  const aCarregar = resumos.aCarregar || coms.aCarregar;

  return (
    <>
      <h1>Demonstração de resultados {ano}</h1>
      <Frescura ano={ano} ate={mesesDecorridos(ano, hoje())} calculadoEm={todos[0]?.calculadoEm} resumos={sel} />
      <p className="muted">Rendimentos e gastos por rubrica. Os custos e proveitos <b>gerais</b> são repartidos pelas comunidades conforme a média de jovens e adultos dos últimos 12 meses. Vencimentos e Segurança Social aparecem agregados em "{OUTROS_FUNCIONAMENTO}".</p>

      <div className="card sec">
        <div className="filtros" style={{ alignItems: 'flex-end' }}>
          <SeletorMeses modo={modoMeses} aoMudar={setModoMeses} resumos={resumos.dados ?? []} />
          <label className="campo">Colunas
            <select value={colunas} onChange={(e) => setColunas(e.target.value as Colunas)}>
              <option value="comunidades">Comunidades</option><option value="meses">Meses</option>
            </select>
          </label>
          <label className="campo">De
            <select value={de} onChange={(e) => { const v = Number(e.target.value); setDe(v); if (v > ate) setAte(v); }}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
          </label>
          <label className="campo">Até
            <select value={ate} onChange={(e) => { const v = Number(e.target.value); setAte(v); if (v < de) setDe(v); }}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
          </label>
          <label className="small" style={{ paddingBottom: 6 }}><input type="checkbox" checked={separar} onChange={(e) => setSeparar(e.target.checked)} /> Separar local e parte dos gerais</label>
          <button className="sec" onClick={() => void exportar()} disabled={!linhas.length}>Exportar para Excel</button>
        </div>
        {colunas === 'meses' && <p className="muted small" style={{ marginTop: 8 }}>{comunidade === 'todas' ? 'Total da CCLX.' : `Comunidade: ${nomes.get(comunidade) ?? comunidade}.`} A comunidade escolhe-se no topo.</p>}
      </div>

      <Estado aCarregar={aCarregar} erro={resumos.erro || coms.erro} vazio={!sel.length} />
      {!aCarregar && !!sel.length && (<>
        <p className="muted small">Valores em euros (€). Negativos entre parênteses; "0,00" é zero e "—" é sem dados.</p>
        <div className="tabela"><table>
          <thead><tr><th>Rubrica</th>{cols.map((c) => <th key={c.id} className="num">{c.nome}</th>)}</tr></thead>
          <tbody>
            {(['entrada', 'saida'] as const).map((tipo) => (
              <Fragment key={tipo}>
                <tr><td colSpan={cols.length + 1} style={{ fontWeight: 700, background: 'var(--cinza-claro, #E6E6E6)' }}>{tipo === 'entrada' ? 'RENDIMENTOS' : 'GASTOS'}</td></tr>
                {linhas.filter((l) => l.tipo === tipo).filter((l) => !(ESCONDER_A_ZERO.includes(l.rubrica) && !l.valores.cclx)).map((l) => {
                  const chave = `${l.tipo}|${l.rubrica}|${l.parte ?? ''}`;
                  const aberto = aberta === `${l.tipo}|${l.rubrica}` && !l.parte;
                  return (
                    <Fragment key={chave}>
                      <tr className={l.valores.cclx ? '' : 'muted'}>
                        <td>
                          {!l.parte && l.valores.cclx ? (
                            <button className="link" onClick={() => setAberta(aberto ? null : `${l.tipo}|${l.rubrica}`)} aria-expanded={aberto}>{aberto ? '▾' : '▸'} {l.rubrica}</button>
                          ) : <span style={{ paddingLeft: l.parte ? 18 : 0 }}>{l.parte ? (l.parte === 'local' ? `${l.rubrica} · local` : `${l.rubrica} · parte dos gerais`) : l.rubrica}</span>}
                        </td>
                        {cols.map((c) => <Fragment key={c.id}>{celula(l.valores[c.id], c.id === 'cclx')}</Fragment>)}
                      </tr>
                      {aberto && detalhe(l.tipo, l.rubrica).map((d) => (
                        <tr key={d.nome} className="small"><td style={{ paddingLeft: 28 }} className="muted">{d.nome}</td>{cols.map((c) => <td key={c.id} className="num muted">{d.valores[c.id] ? eurContab(d.valores[c.id]) : ''}</td>)}</tr>
                      ))}
                      {aberto && <tr className="small"><td colSpan={cols.length + 1} className="muted" style={{ paddingLeft: 28 }}>Valores registados por categoria, antes da repartição dos gerais.</td></tr>}
                    </Fragment>
                  );
                })}
                <tr><td style={{ fontWeight: 700 }}>{tipo === 'entrada' ? 'Total de rendimentos' : 'Total de gastos'}</td>{cols.map((c) => <Fragment key={c.id}>{celula((tipo === 'entrada' ? tE : tS)[c.id], true)}</Fragment>)}</tr>
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="total-geral"><td>RESULTADO</td>{cols.map((c) => { const v = r2(tE[c.id] - tS[c.id]); return <td key={c.id} className={'num' + (v < 0 ? ' neg' : '')}>{eurContab(v)}</td>; })}</tr>
            <tr><td>Margem (resultado / rendimentos)</td>{cols.map((c) => <td key={c.id} className="num">{tE[c.id] ? pct((tE[c.id] - tS[c.id]) / tE[c.id]) : '—'}</td>)}</tr>
            <tr><td>Autossuficiência (rendimentos / gastos)</td>{cols.map((c) => <td key={c.id} className="num">{tS[c.id] ? pct(tE[c.id] / tS[c.id]) : '—'}</td>)}</tr>
          </tfoot>
        </table></div>
      </>)}
    </>
  );
}

