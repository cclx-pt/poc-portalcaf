import { useMemo, useState } from 'react';
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, LabelList } from 'recharts';
import { useAuth } from '../auth/AuthProvider';
import { Estado, GraficoBarras, useCarregar, useFiltros, Frescura } from '../components/ui';
import { listarComunidades, listarResumos } from '../lib/db';
import { totaisPeriodo } from '../lib/analise';
import { dec, eur, eurK, MESES, MESES_CURTOS, num, pct, r2, hoje } from '../lib/format';
import { GERAIS_POR_REPARTIR, mesesDecorridos } from '../lib/resumos';
import { CORES, corDivergente } from '../lib/cores';

interface Linha {
  id: string;
  nome: string;
  entradas: number;
  saidas: number;
  resultado: number;
  autossuf: number | null;
  defice: number;
  adultos: number | null;
  entradasPessoa: number | null;
  custoPessoa: number | null;
  pctDizimos: number | null;
}
type Chave = keyof Omit<Linha, 'id' | 'nome'>;

const COLUNAS: { k: Chave; rot: string; fmt: (v: number | null) => string }[] = [
  { k: 'entradas', rot: 'Entradas (€)', fmt: dec },
  { k: 'saidas', rot: 'Saídas (€)', fmt: dec },
  { k: 'resultado', rot: 'Resultado (€)', fmt: dec },
  { k: 'autossuf', rot: 'Autossuficiência', fmt: (v) => pct(v) },
  { k: 'defice', rot: 'Défice coberto (€)', fmt: dec },
  { k: 'adultos', rot: 'Média jovens e adultos', fmt: (v) => num(v, 1) },
  { k: 'entradasPessoa', rot: 'Entradas por pessoa (€)', fmt: dec },
  { k: 'custoPessoa', rot: 'Custo por pessoa (€)', fmt: dec },
  { k: 'pctDizimos', rot: '% das entradas em dízimos', fmt: (v) => pct(v) },
];

function linha(id: string, nome: string, entradas: number, saidas: number, adultos: number | null, dizimos: number): Linha {
  const porPessoa = (v: number) => (adultos ? r2(v / adultos) : null);
  return {
    id, nome, entradas, saidas, resultado: r2(entradas - saidas),
    autossuf: saidas ? entradas / saidas : null,
    defice: r2(Math.max(0, saidas - entradas)),
    adultos, entradasPessoa: porPessoa(entradas), custoPessoa: porPessoa(saidas),
    pctDizimos: entradas ? dizimos / entradas : null,
  };
}

/** Comparação entre comunidades: indicadores, barras, quadrantes e mapa de calor do resultado. */
export default function Comparacao() {
  const { acesso } = useAuth();
  const { ano } = useFiltros();
  const resumos = useCarregar(() => listarResumos(acesso!, ano), [ano, acesso?.email]);
  const coms = useCarregar(listarComunidades, []);
  const [de, setDe] = useState(1);
  const [ate, setAte] = useState(12);
  const [gerais, setGerais] = useState(true);
  const [ordem, setOrdem] = useState<{ k: Chave; desc: boolean }>({ k: 'resultado', desc: true });

  const nomes = new Map((coms.dados ?? []).map((c) => [c.id, c.nome]));
  nomes.set(GERAIS_POR_REPARTIR, 'Gerais por repartir');

  const { linhas, cclx, porRepartir } = useMemo(() => {
    const ls: Linha[] = [];
    let pr: Linha | null = null;
    let tE = 0, tS = 0, tD = 0, tA = 0, temA = false;
    for (const r of resumos.dados ?? []) {
      if (r.comunidadeId === 'bolsa-geral') continue;
      const t = totaisPeriodo(r, de, ate);
      const e = r2(t.entradas - (gerais ? 0 : t.geralEntradas));
      const s = r2(t.saidas - (gerais ? 0 : t.geralSaidas));
      tE += t.entradas; tS += t.saidas; tD += t.dizimos;
      if (t.adultosMedia) { tA += t.adultosMedia; temA = true; }
      if (r.comunidadeId === GERAIS_POR_REPARTIR) { if (gerais && (e || s)) pr = linha(r.comunidadeId, 'Gerais por repartir', e, s, null, 0); continue; }
      if (!e && !s && !t.adultosMedia) continue;
      ls.push(linha(r.comunidadeId, nomes.get(r.comunidadeId) ?? r.comunidadeId, e, s, t.adultosMedia, t.dizimos));
    }
    const total = linha('cclx', 'CCLX', r2(tE), r2(tS), temA ? r2(tA) : null, r2(tD));
    return { linhas: ls, cclx: total, porRepartir: pr };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumos.dados, coms.dados, de, ate, gerais]);

  const ordenadas = [...linhas].sort((a, b) => {
    const va = a[ordem.k] ?? -Infinity, vb = b[ordem.k] ?? -Infinity;
    return ordem.desc ? Number(vb) - Number(va) : Number(va) - Number(vb);
  });

  // Mapa de calor: resultado por mês e comunidade.
  const meses = Array.from({ length: ate - de + 1 }, (_, i) => de + i);
  const calor = ordenadas.map((l) => {
    const r = (resumos.dados ?? []).find((x) => x.comunidadeId === l.id)!;
    return { l, vals: meses.map((m) => { const x = r.meses[m - 1]; return r2(x.entradas - x.saidas - (gerais ? 0 : (x.geralEntradas ?? 0) - (x.geralSaidas ?? 0))); }) };
  });
  const maxAbs = Math.max(1, ...calor.flatMap((c) => c.vals.map(Math.abs)));

  const quadrantes = linhas.filter((l) => l.entradasPessoa != null && l.custoPessoa != null).map((l) => ({ x: l.entradasPessoa!, y: l.custoPessoa!, nome: l.nome }));
  const limite = Math.max(1, ...quadrantes.flatMap((q) => [q.x, q.y])) * 1.1;
  const aCarregar = resumos.aCarregar || coms.aCarregar;

  return (
    <>
      <h1>Comparação entre comunidades {ano}</h1>
      <Frescura ano={ano} ate={mesesDecorridos(ano, hoje())} calculadoEm={resumos.dados?.[0]?.calculadoEm} resumos={resumos.dados ?? []} />
      <p className="muted">Entradas e saídas de cada comunidade, já com a parte dos custos e proveitos gerais (repartidos pela média de jovens e adultos dos últimos 12 meses). "Por pessoa" divide pelo número médio de jovens e adultos por registo de assistência no período.</p>

      <div className="card sec">
        <div className="filtros" style={{ alignItems: 'flex-end' }}>
          <label className="campo">De
            <select value={de} onChange={(e) => { const v = Number(e.target.value); setDe(v); if (v > ate) setAte(v); }}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
          </label>
          <label className="campo">Até
            <select value={ate} onChange={(e) => { const v = Number(e.target.value); setAte(v); if (v < de) setDe(v); }}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
          </label>
          <label className="small" style={{ paddingBottom: 6 }}><input type="checkbox" checked={gerais} onChange={(e) => setGerais(e.target.checked)} /> Incluir parte dos gerais</label>
        </div>
      </div>

      <Estado aCarregar={aCarregar} erro={resumos.erro || coms.erro} vazio={!linhas.length} />
      {!aCarregar && !!linhas.length && <>
        <div className="sec">
          <h2>Indicadores</h2>
          <div className="tabela"><table>
            <thead><tr>
              <th>Comunidade</th>
              {COLUNAS.map((c) => (
                <th key={c.k} className="num">
                  <button className="link" style={{ color: 'inherit', fontWeight: 700 }} onClick={() => setOrdem({ k: c.k, desc: ordem.k === c.k ? !ordem.desc : true })}
                    aria-sort={ordem.k === c.k ? (ordem.desc ? 'descending' : 'ascending') : 'none'}>
                    {c.rot}{ordem.k === c.k ? (ordem.desc ? ' ▾' : ' ▴') : ''}
                  </button>
                </th>
              ))}
            </tr></thead>
            <tbody>
              {ordenadas.map((l) => (
                <tr key={l.id}><td>{l.nome}</td>{COLUNAS.map((c) => <td key={c.k} className={'num' + (c.k === 'resultado' && l.resultado < 0 ? ' neg' : '')}>{c.fmt(l[c.k] as number | null)}</td>)}</tr>
              ))}
              {porRepartir && <tr className="muted"><td>{porRepartir.nome}</td>{COLUNAS.map((c) => <td key={c.k} className="num">{c.fmt(porRepartir[c.k] as number | null)}</td>)}</tr>}
            </tbody>
            <tfoot><tr className="total-geral"><td>CCLX</td>{COLUNAS.map((c) => <td key={c.k} className="num">{c.fmt(cclx[c.k] as number | null)}</td>)}</tr></tfoot>
          </table></div>
          <p className="muted small">Autossuficiência = entradas a dividir pelas saídas. Défice coberto = parte das saídas que as entradas da comunidade não cobrem e que vem do orçamento geral.{gerais ? '' : ' Sem a parte dos gerais, o total CCLX continua a incluí-los.'}</p>
        </div>

        <div className="card sec">
          <h2>Entradas e saídas por comunidade</h2>
          <GraficoBarras dados={ordenadas.map((l) => ({ rotulo: l.nome, Entradas: l.entradas, Saídas: l.saidas }))} series={[{ key: 'Entradas', nome: 'Entradas', cor: 'entradas' }, { key: 'Saídas', nome: 'Saídas', cor: 'saidas' }]} altura={260} />
        </div>

        <div className="card sec">
          <h2>Entradas por pessoa vs custo por pessoa</h2>
          <p className="muted small">Abaixo da diagonal, a comunidade cobre os seus custos; acima, precisa do apoio do orçamento geral.</p>
          {quadrantes.length ? (
            <div role="img" aria-label="Gráfico de quadrantes: entradas por pessoa contra custo por pessoa" style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                  <CartesianGrid stroke="#e6e6e6" />
                  <XAxis type="number" dataKey="x" name="Entradas por pessoa" domain={[0, limite]} tickFormatter={(v) => eurK(Number(v))} tick={{ fontSize: 11, fill: '#333' }} label={{ value: 'Entradas por pessoa', position: 'insideBottom', offset: -10, fontSize: 11 }} />
                  <YAxis type="number" dataKey="y" name="Custo por pessoa" domain={[0, limite]} tickFormatter={(v) => eurK(Number(v))} tick={{ fontSize: 11, fill: '#333' }} width={80} />
                  <ZAxis range={[80, 80]} />
                  <ReferenceLine segment={[{ x: 0, y: 0 }, { x: limite, y: limite }]} stroke={CORES.eixo} strokeDasharray="4 4" />
                  <Tooltip formatter={(v) => eur(Number(v))} contentStyle={{ border: '1px solid #333', borderRadius: 0, fontSize: 12 }} />
                  <Scatter data={quadrantes} fill={CORES.entradas} isAnimationActive={false}><LabelList dataKey="nome" position="top" style={{ fontSize: 11, fill: '#333' }} /></Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="muted">Sem registos de assistência no período.</p>}
        </div>

        <div className="sec">
          <h2>Resultado por mês</h2>
          <div className="tabela"><table>
            <thead><tr><th>Comunidade</th>{meses.map((m) => <th key={m} className="num">{MESES_CURTOS[m - 1]}</th>)}</tr></thead>
            <tbody>{calor.map(({ l, vals }) => (
              <tr key={l.id}><td>{l.nome}</td>{vals.map((v, i) => {
                const c = corDivergente(v, maxAbs);
                return (
                  <td key={i} className="num" title={eur(v)}
                    style={{ background: v ? c.fundo : undefined, color: v ? c.tinta : undefined, fontWeight: v < 0 ? 700 : undefined }}>
                    {v ? eurK(v) : '—'}
                  </td>
                );
              })}</tr>
            ))}</tbody>
          </table></div>
          <p className="muted small">Azul = resultado positivo, vermelho = défice; quanto mais forte a cor, maior o valor. "—" = sem movimentos.</p>
        </div>
      </>}
    </>
  );
}
