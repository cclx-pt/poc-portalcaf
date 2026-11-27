import { useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Estado, mensagemErro, useCarregar, useFiltros, useFocarErro } from '../components/ui';
import { useAvisoSaida } from '../components/SaidaSemGravar';
import { auditar, lerConfigAssistencia, listarComunidades, listarLotes } from '../lib/db';
import { MESES, MESES_CURTOS, num } from '../lib/format';
import { fecharEm100, folhaPesosGravados, gravarPesosMes, gravarPesosVarios, listarPesos, NOME_METODO, pesosValidos, somaPesos, textoPeso, textoProposta, type MetodoPeso, type PesosMes, type VistaPesos } from '../lib/pesos';
import { recalcularAno } from '../lib/recalcular';
import { comunidadeAtiva, destinoFusao, propostaPesos } from '../lib/resumos';
import type { Comunidade } from '../lib/types';

const pctTxt = (v: number | undefined) => (v == null ? '—' : `${num(Math.round(v), 0)}%`);
const periodoDe = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, '0')}`;

/**
 * Administração › Peso das comunidades (ADM-05): o peso de cada comunidade na repartição dos gerais e da bolsa geral,
 * gravado por mês. Proposta pela média ou pela mediana de jovens e adultos por celebração nos últimos 12 meses;
 * o administrador pode alterar e gravar; a proposta original e o método ficam guardados.
 */
export default function Pesos() {
  const { acesso, pode } = useAuth();
  const { ano } = useFiltros();
  const coms = useCarregar(listarComunidades, []);
  const ass = useCarregar(async () => {
    const [atual, antes, cfg] = await Promise.all([listarLotes(acesso!, 'assistencia', ano), listarLotes(acesso!, 'assistencia', ano - 1), lerConfigAssistencia()]);
    return { atual, antes, evento: cfg.eventoCelebracao ?? null };
  }, [ano, acesso?.email]);
  const gravados = useCarregar(() => listarPesos(ano), [ano]);
  const [metodo, setMetodo] = useState<MetodoPeso>('media');
  const [vista, setVista] = useState<VistaPesos>('pct');
  // Valores da tabela anual: os gravados ou a proposta pela média ou pela mediana (calculadas sempre, para todos os meses).
  const [fonteTabela, setFonteTabela] = useState<'gravado' | MetodoPeso>('gravado');
  const [mes, setMes] = useState<number>(() => (ano === new Date().getFullYear() ? new Date().getMonth() + 1 : 12));
  const [edicao, setEdicao] = useState<Record<string, string> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  useFocarErro(erro, raiz);

  const comunidades = (coms.dados ?? []).filter((c) => !c.especial);
  const nomes = new Map(comunidades.map((c) => [c.id, c.nome]));
  const destino = useMemo(() => destinoFusao(coms.dados ?? []), [coms.dados]);
  const elegiveisDe = (m: number) => comunidades.filter((c: Comunidade) => comunidadeAtiva(c, periodoDe(ano, m))).map((c) => c.id);

  /** Proposta (média e mediana) de um mês, com as fusões aplicadas. */
  const propostaDe = (m: number) => {
    const p = periodoDe(ano, m);
    return propostaPesos(ass.dados?.atual ?? [], ass.dados?.antes ?? [], ano, m, elegiveisDe(m), ass.dados?.evento, (c) => destino(c, p));
  };
  const porMes = new Map((gravados.dados ?? []).map((g) => [g.mes, g]));
  const gravadoMes = porMes.get(mes);
  const proposta = ass.dados ? propostaDe(mes) : null;
  const propostasAno = useMemo(() => Array.from({ length: 12 }, (_, i) => (ass.dados ? propostaDe(i + 1) : null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ass.dados, coms.dados, ano, destino]);
  const elegiveis = elegiveisDe(mes);

  // Valores no editor: o que está a ser editado, senão o gravado, senão a proposta do método escolhido.
  // Percentagens sempre inteiras: um mês gravado antes com decimais aparece já arredondado (soma 100).
  const base: Record<string, number> = gravadoMes ? fecharEm100(gravadoMes.pesos) : Object.fromEntries(elegiveis.map((c) => [c, proposta?.[metodo][c]?.pct ?? 0]));
  const valores: Record<string, number> = edicao ? Object.fromEntries(Object.entries(edicao).map(([c, v]) => [c, Number(v.replace(',', '.')) || 0])) : base;
  const sujo = !!edicao;
  const soma = somaPesos(Object.fromEntries(elegiveis.map((c) => [c, valores[c] ?? 0])));

  function usar(m: MetodoPeso) {
    if (!proposta) return;
    setMetodo(m);
    setEdicao(Object.fromEntries(elegiveis.map((c) => [c, String(proposta[m][c]?.pct ?? 0)])));
  }

  function novoRegisto(m: number, pesos: Record<string, number>, met: MetodoPeso, manual: boolean, prop = propostaDe(m)): PesosMes {
    const agora = new Date().toISOString();
    return { id: periodoDe(ano, m), ano, mes: m, metodo: met, pesos, proposta: prop, manual, calculadoEm: agora, gravadoPor: acesso!.email, gravadoEm: agora };
  }

  /** Descarrega "Pesos gravados por mês" em Excel: folha em % (inteiras, soma 100) e folha em pessoas. */
  async function descarregarExcel() {
    setErro(null);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      for (const [vistaFolha, nomeFolha, fmt] of [['pct', 'Pesos (%)', '0"%"'], ['pessoas', 'Pessoas', '0.0']] as const) {
        const f = folhaPesosGravados(gravados.dados ?? [], comunidades, vistaFolha);
        const ws = wb.addWorksheet(nomeFolha);
        ws.addRow([`Peso das comunidades ${ano}: ${vistaFolha === 'pct' ? '% do peso gravado de cada comunidade' : 'jovens e adultos por celebração (12 meses, método do mês)'}`]).font = { bold: true, name: 'Arial', size: 12 };
        ws.addRow(f.cabecalho).font = { bold: true, name: 'Arial' };
        for (const l of f.linhas) ws.addRow(l).font = { name: 'Arial' };
        if (f.total) ws.addRow(f.total).font = { bold: true, name: 'Arial' };
        ws.addRow(f.metodo).font = { italic: true, name: 'Arial' };
        ws.addRow([]);
        ws.addRow(['Vazio: mês sem pesos gravados (usa a média automática dos 12 meses). À mão: peso alterado pelo administrador.']).font = { italic: true, name: 'Arial', size: 9 };
        ws.columns.forEach((c, i) => { c.width = i ? 9 : 22; if (i) { c.numFmt = fmt; c.alignment = { horizontal: 'right' }; } });
        ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];
      }
      const buf = await wb.xlsx.writeBuffer();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      a.download = `pesos-comunidades-${ano}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { setErro(mensagemErro(e)); }
  }

  async function gravarMes(): Promise<boolean> {
    setErro(null); setMsg(null);
    const pesos = Object.fromEntries(elegiveis.map((c) => [c, valores[c] ?? 0]));
    if (Object.values(pesos).some((v) => !Number.isInteger(v))) { setErro(`Os pesos de ${MESES[mes - 1]} têm de ser percentagens inteiras, sem decimais.`); return false; }
    if (!pesosValidos(pesos)) { setErro(`Os pesos de ${MESES[mes - 1]} somam ${num(somaPesos(pesos), 0)}%: têm de somar 100%.`); return false; }
    const prop = propostaDe(mes);
    const igualProposta = elegiveis.every((c) => (prop[metodo][c]?.pct ?? 0) === pesos[c]);
    setOcupado(true);
    try {
      await gravarPesosMes(novoRegisto(mes, pesos, metodo, !igualProposta, prop));
      await auditar(acesso!.email, 'Peso das comunidades', `${periodoDe(ano, mes)}: ${igualProposta ? `proposta (${NOME_METODO[metodo]})` : 'alterado à mão'}: ${elegiveis.map((c) => `${nomes.get(c) ?? c} ${num(pesos[c], 0)}%`).join(', ')}`);
      setEdicao(null);
      await gravados.recarregar();
      setMsg(`Pesos de ${MESES[mes - 1]} gravados. Carregue em "Recalcular dados e distribuições" para os aplicar nos resumos.`);
      return true;
    } catch (e) { setErro(mensagemErro(e)); return false; } finally { setOcupado(false); }
  }
  useAvisoSaida(sujo, gravarMes);

  /** Gera e grava a proposta de todos os meses do ano com o método escolhido; os meses alterados à mão mantêm o peso. */
  async function recalcularPesos() {
    if (!ass.dados) return;
    if (!confirm(`Recalcular os pesos de ${ano} pela ${NOME_METODO[metodo].toLowerCase()}? Os meses alterados à mão mantêm o peso (só a proposta é atualizada).`)) return;
    setErro(null); setMsg(null); setOcupado(true);
    try {
      const novos = Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
        const prop = propostaDe(m);
        const antigo = porMes.get(m);
        if (antigo?.manual) return { ...antigo, pesos: fecharEm100(antigo.pesos), proposta: prop, calculadoEm: new Date().toISOString() };
        const pesos = fecharEm100(Object.fromEntries(elegiveisDe(m).map((c) => [c, prop[metodo][c]?.pct ?? 0])));
        return novoRegisto(m, pesos, metodo, false, prop);
      }).filter((x) => somaPesos(x.pesos) > 0);
      await gravarPesosVarios(novos);
      await auditar(acesso!.email, 'recalcular pesos', `Peso das comunidades (ADM-05) › Recalcular pesos de assistência: ${ano} (${NOME_METODO[metodo]}); ${novos.filter((x) => x.manual).length} meses alterados à mão mantidos`);
      setEdicao(null);
      await gravados.recarregar();
      setMsg(`Pesos de ${ano} recalculados pela ${NOME_METODO[metodo].toLowerCase()} (${novos.length} meses com assistência). Carregue em "Recalcular dados e distribuições" para os aplicar.`);
    } catch (e) {
      setErro(mensagemErro(e));
      await auditar(acesso!.email, 'recalcular pesos (falhou)', `Peso das comunidades (ADM-05): ${ano}: ${mensagemErro(e)}`);
    } finally { setOcupado(false); }
  }

  async function recalcularDados() {
    setErro(null); setMsg(null); setOcupado(true);
    try { await recalcularAno(acesso!, ano, 'Peso das comunidades (ADM-05) › Recalcular dados e distribuições'); setMsg(`Resumos e distribuições de ${ano} recalculados com os pesos gravados.`); }
    catch (e) { setErro(mensagemErro(e)); } finally { setOcupado(false); }
  }

  const aCarregar = coms.aCarregar || ass.aCarregar || gravados.aCarregar;
  return (
    <div ref={raiz}>
      <h1>Peso das comunidades {ano}</h1>
      <p className="muted">Peso de cada comunidade na repartição dos custos e proveitos gerais e da bolsa geral, gravado por mês. A proposta usa os jovens e adultos por celebração nos últimos 12 meses, pela média ou pela mediana; pode alterar e gravar. Meses sem pesos gravados usam a média automática. A proposta original e o método ficam guardados com o mês.</p>
      {erro && <div className="aviso">{erro}</div>}
      {msg && <div className="nota">{msg}</div>}

      <div className="acoes" style={{ alignItems: 'flex-end' }}>
        <label className="campo">Método da proposta
          <select value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPeso)}>
            <option value="media">Média</option>
            <option value="mediana">Mediana</option>
          </select>
        </label>
        {pode('recalcular') && <>
          <button disabled={ocupado || !ass.dados} onClick={() => void recalcularPesos()}>Recalcular pesos de assistência</button>
          <button className="sec" disabled={ocupado} onClick={() => void recalcularDados()}>Recalcular dados e distribuições</button>
        </>}
      </div>

      <Estado aCarregar={aCarregar} erro={coms.erro || ass.erro || gravados.erro} />
      {!aCarregar && <>
        <div className="sec">
          <div className="linha" style={{ justifyContent: 'space-between' }}>
            <h2>Pesos gravados por mês</h2>
            <div className="linha" style={{ gap: 8 }}>
              <div className="abas" role="tablist" aria-label="Valores">
                {([['gravado', 'Gravado'], ['media', 'Média'], ['mediana', 'Mediana']] as const).map(([k, rot]) => (
                  <button key={k} role="tab" aria-selected={fonteTabela === k} className={fonteTabela === k ? 'ativa' : ''} onClick={() => setFonteTabela(k)}>{rot}</button>
                ))}
              </div>
              <div className="abas" role="tablist" aria-label="Mostrar em">
                {([['pct', '%'], ['pessoas', 'Pessoas']] as const).map(([k, rot]) => (
                  <button key={k} role="tab" aria-selected={vista === k} className={vista === k ? 'ativa' : ''} onClick={() => setVista(k)}>{rot}</button>
                ))}
              </div>
              <button className="sec" disabled={!(gravados.dados ?? []).length} title={(gravados.dados ?? []).length ? undefined : `Sem pesos gravados em ${ano}`} onClick={() => void descarregarExcel()}>Descarregar Excel</button>
            </div>
          </div>
          <div className="tabela"><table>
            <thead><tr><th>Comunidade</th>{MESES_CURTOS.map((m, i) => <th key={m} className="num"><button className="link" onClick={() => { if (!sujo || confirm('Há alterações por gravar neste mês. Mudar de mês e perdê-las?')) { setEdicao(null); setMes(i + 1); } }}>{m}</button></th>)}</tr></thead>
            <tbody>{comunidades.map((c) => (
              <tr key={c.id}><td>{c.nome}</td>{MESES_CURTOS.map((m, i) => {
                const g = porMes.get(i + 1);
                const t = fonteTabela === 'gravado' ? textoPeso(g, c.id, vista) : textoProposta(propostasAno[i], fonteTabela, c.id, vista);
                return <td key={m} className={`num${i + 1 === mes ? ' mes-escolhido' : ''}`}>{t != null ? <>{t}{fonteTabela === 'gravado' && g?.manual && vista === 'pct' ? <sup title="Alterado à mão"> ✎</sup> : null}</> : <span className="muted">—</span>}</td>;
              })}</tr>
            ))}</tbody>
            {fonteTabela === 'gravado' && <tfoot><tr><td>Método</td>{MESES_CURTOS.map((m, i) => { const g = porMes.get(i + 1); return <td key={m} className="num small">{g ? (g.manual ? 'À mão' : NOME_METODO[g.metodo]) : 'Auto'}</td>; })}</tr></tfoot>}
          </table></div>
          <p className="muted small">{fonteTabela === 'gravado'
            ? `${vista === 'pct' ? '% do peso gravado de cada comunidade.' : 'Pessoas: jovens e adultos por celebração nos últimos 12 meses, pelo método do mês.'} "—": sem pesos gravados (usa a média automática dos 12 meses). ✎: alterado à mão.`
            : `${vista === 'pct' ? '% do peso' : 'Pessoas (jovens e adultos por celebração)'} pela ${fonteTabela === 'media' ? 'média' : 'mediana'} dos últimos 12 meses, calculada para todos os meses.`} Todos os valores sem decimais. Clique num mês para ver a simulação e editar.</p>
        </div>

        <div className="sec card">
          <h2>{`${MESES[mes - 1]} ${ano}: simulação e pesos`}</h2>
          <p className="small muted" style={{ marginTop: 0 }}>
            {gravadoMes ? `Gravado por ${gravadoMes.gravadoPor} em ${new Date(gravadoMes.gravadoEm).toLocaleString('pt-PT')} · proposta original pela ${NOME_METODO[gravadoMes.metodo].toLowerCase()}${gravadoMes.manual ? ' · alterado à mão' : ''}.` : 'Sem pesos gravados neste mês: os valores abaixo são a proposta pelo método escolhido.'}
          </p>
          <div className="tabela"><table>
            <thead><tr><th>Comunidade</th><th className="num">Média 12m (pessoas)</th><th className="num">% média</th><th className="num">Mediana 12m (pessoas)</th><th className="num">% mediana</th><th className="num">Peso a usar (%)</th><th className="num">Diferença da proposta</th></tr></thead>
            <tbody>{elegiveis.map((c) => {
              const pm = proposta?.media[c]; const pd = proposta?.mediana[c];
              const prop = Math.round((gravadoMes ? gravadoMes.proposta[gravadoMes.metodo]?.[c]?.pct : proposta?.[metodo][c]?.pct) ?? 0);
              const v = valores[c] ?? 0;
              return (
                <tr key={c}>
                  <td>{nomes.get(c) ?? c}</td>
                  <td className="num">{pm ? num(pm.valor, 1) : '—'}</td><td className="num">{pctTxt(pm?.pct)}</td>
                  <td className="num">{pd ? num(pd.valor, 1) : '—'}</td><td className="num">{pctTxt(pd?.pct)}</td>
                  <td className="num"><input inputMode="numeric" style={{ width: 90 }} aria-label={`Peso de ${nomes.get(c) ?? c}`} aria-invalid={!!erro && (soma !== 100 || !Number.isInteger(v))}
                    value={edicao ? edicao[c] ?? '' : String(v)} onChange={(e) => setEdicao({ ...Object.fromEntries(elegiveis.map((x) => [x, String(valores[x] ?? 0)])), [c]: e.target.value })} /></td>
                  <td className="num">{v === prop ? '—' : `${v - prop > 0 ? '+' : ''}${num(v - prop, Number.isInteger(v) ? 0 : 2)} p.p.`}</td>
                </tr>
              );
            })}</tbody>
            <tfoot><tr className="total-geral"><td>Total</td><td /><td className="num">100%</td><td /><td className="num">100%</td><td className={`num${soma !== 100 ? ' neg' : ''}`}>{num(soma, Number.isInteger(soma) ? 0 : 2)}%</td><td /></tr></tfoot>
          </table></div>
          <div className="acoes" style={{ marginTop: 12 }}>
            <button className="sec" disabled={!proposta} onClick={() => usar('media')}>Usar a média</button>
            <button className="sec" disabled={!proposta} onClick={() => usar('mediana')}>Usar a mediana</button>
            <button disabled={ocupado} onClick={() => void gravarMes()}>{`Gravar pesos de ${MESES[mes - 1]}`}</button>
            {sujo && <button className="sec" onClick={() => setEdicao(null)}>Cancelar alterações</button>}
          </div>
        </div>
      </>}
    </div>
  );
}
