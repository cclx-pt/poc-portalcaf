import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { LogoBanco } from '../components/LogoBanco';
import SaldosBancos from './SaldosBancos';
import { useAuth } from '../auth/AuthProvider';
import { Estado, Modal, mensagemErro, useCarregar, useFiltros } from '../components/ui';
import { apagarBancoLote, auditar, gravarBancoLote, listarBanco, listarCategorias, listarComunidades, listarContas, listarLotes } from '../lib/db';
import { lerFicheiro } from '../lib/ficheiros';
import { NOME_BANCO, bancoDaConta, maioresMovimentos, detetarBanco, dividirPorMes, mapaDoBanco, mapearExtrato, resumoMes, sugerir, sugerirMapaBanco, type Banco, type MapaBanco } from '../lib/banco';
import { eur, MESES, r2 } from '../lib/format';
import type { BancoLote, Conta, MovBanco } from '../lib/types';
import type { Linha } from '../lib/fontes';
import { comunidadeAtiva } from '../lib/resumos';

type Filtro = 'todos' | 'por-classificar' | 'bolsa' | 'contabilizados' | 'conciliados';
type MovVista = MovBanco & { loteId: string; contaId: string };

const dataPt = (d: string) => d.split('-').reverse().join('/');

export default function Bancos() {
  const { acesso } = useAuth();
  const { ano } = useFiltros();
  const contas = useCarregar(listarContas, []);
  const coms = useCarregar(listarComunidades, []);
  const cats = useCarregar(listarCategorias, []);
  const banco = useCarregar(() => listarBanco(ano), [ano]);
  const assist = useCarregar(() => listarLotes(acesso!, 'assistencia', ano), [ano]);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [alterados, setAlterados] = useState<Record<string, BancoLote>>({});
  const [importar, setImportar] = useState(false);
  const [limpar, setLimpar] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocultas, setOcultas] = useState<string[]>([]);
  const [vista, setVista] = useState<'mes' | 'saldos'>('mes');
  // Extratos sempre por mês: por omissão, o último mês com movimentos neste ano.
  const mesesComDados = [...new Set((banco.dados ?? []).map((l) => l.mes))].sort((a, b) => a - b);
  const [mesEscolhido, setMes] = useState<number | null>(null);
  const mes = mesEscolhido ?? (mesesComDados[mesesComDados.length - 1] ?? new Date().getMonth() + 1);

  const ativas = (contas.dados ?? []).filter((c) => c.ativo !== false);
  const bancoDe = new Map(ativas.map((c) => [c.id, bancoDaConta(c)]));
  const visiveis = ativas.filter((c) => !ocultas.includes(c.id));
  const lotesMes = useMemo(() => (banco.dados ?? []).filter((l) => l.mes === mes).map((l) => alterados[l.id] ?? l), [banco.dados, mes, alterados]);
  const porConta = new Map(ativas.map((c) => [c.id, lotesMes.filter((l) => l.contaId === c.id).flatMap((l) => l.registos)]));
  const movs: MovVista[] = lotesMes.filter((l) => !ocultas.includes(l.contaId))
    .flatMap((l) => l.registos.map((m) => ({ ...m, loteId: l.id, contaId: l.contaId })))
    .sort((a, b) => a.data.localeCompare(b.data) || a.contaId.localeCompare(b.contaId) || (a.ordem ?? 0) - (b.ordem ?? 0));
  const mostrar = movs.filter((m) =>
    filtro === 'todos' ? true
      : filtro === 'por-classificar' ? !m.conciliadoCom && !m.contabilizar && !m.categoria
        : filtro === 'bolsa' ? m.comunidadeId === 'bolsa-geral'
          : filtro === 'contabilizados' ? m.contabilizar
            : !!m.conciliadoCom);
  // Totais recalculados só com os bancos visíveis.
  const resumos = visiveis.map((c) => ({ c, r: resumoMes(porConta.get(c.id) ?? []) }));
  const soma = (k: 'entradas' | 'saidas') => r2(resumos.reduce((s, x) => s + x.r[k], 0));
  const somaSaldo = (k: 'saldoInicial' | 'saldoFinal') => { const v = resumos.filter((x) => x.r[k] != null); return v.length ? r2(v.reduce((s, x) => s + (x.r[k] as number), 0)) : null; };

  function alterar(loteId: string, id: string, patch: Partial<MovBanco>) {
    const base = alterados[loteId] ?? banco.dados!.find((l) => l.id === loteId)!;
    setAlterados({ ...alterados, [loteId]: { ...base, registos: base.registos.map((m) => (m.id === id ? { ...m, ...patch } : m)) } });
  }
  function marcarBolsa() {
    const novo = { ...alterados };
    for (const l of lotesMes) {
      if (ocultas.includes(l.contaId)) continue;
      const regs = l.registos.map((m) => (m.valor > 0 && !m.conciliadoCom && !m.comunidadeId && /bolsa geral/.test(m.sugestao ?? '')
        ? { ...m, comunidadeId: 'bolsa-geral', contabilizar: true, categoria: m.categoria ?? 'Ofertas' } : m));
      novo[l.id] = { ...l, registos: regs };
    }
    setAlterados(novo);
  }
  async function guardar() {
    setMsg(null);
    try {
      const ls = Object.values(alterados);
      for (const l of ls) await gravarBancoLote({ ...l, atualizadoEm: new Date().toISOString(), atualizadoPor: acesso!.email });
      await auditar(acesso!.email, 'classificar banco', `${ls.map((l) => `${l.contaId} ${l.periodo}`).join(', ')}`);
      setAlterados({}); await banco.recarregar(); setMsg('Classificação guardada. Recalcule os resumos no Painel para atualizar os totais.');
    } catch (e) { setMsg(mensagemErro(e)); }
  }
  const mudarMes = (m: number) => { if (Object.keys(alterados).length && !confirm('Há classificações por guardar. Mudar de mês e perdê-las?')) return; setAlterados({}); setMes(m); };

  // Pré-visualização da distribuição da bolsa geral pela assistência de adultos do mesmo mês.
  const bolsaPorMes = Array.from({ length: 12 }, (_, i) => r2((banco.dados ?? []).flatMap((l) => l.registos)
    .filter((m) => m.contabilizar && m.comunidadeId === 'bolsa-geral' && m.valor > 0 && Number(m.data.slice(5, 7)) === i + 1 && m.data.startsWith(String(ano)))
    .reduce((s, m) => s + m.valor, 0)));
  const distribuicao = bolsaPorMes.map((total, i) => {
    if (!total) return null;
    const p = `${ano}-${String(i + 1).padStart(2, '0')}`;
    const pesos = (coms.dados ?? []).filter((c) => !c.especial && comunidadeAtiva(c, p)).map((c) => {
      const regs = (assist.dados ?? []).filter((l) => l.comunidadeId === c.id && l.mes === i + 1).flatMap((l) => l.registos);
      return { c, media: regs.length ? regs.reduce((s, r) => s + r.valor, 0) / regs.length : 0 };
    });
    const soma = pesos.reduce((s, x) => s + x.media, 0);
    return { mes: i, total, linhas: pesos.filter((x) => x.media > 0).map((x) => ({ nome: x.c.nome, media: r2(x.media), pct: soma ? x.media / soma : 0, valor: soma ? r2((total * x.media) / soma) : 0 })), semAssistencia: !soma };
  }).filter(Boolean) as { mes: number; total: number; linhas: { nome: string; media: number; pct: number; valor: number }[]; semAssistencia: boolean }[];

  return (
    <>
      <div className="linha" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1>Bancos e bolsa geral {ano}</h1>
          <p className="muted">Extratos da CGD e do Santander, sempre por mês, numa vista conjunta. Os movimentos já registados no Jotform são conciliados e não contam duas vezes. As transferências de ofertas e dízimos sem comunidade entram na bolsa geral.</p>
        </div>
        <div className="acoes">
          <button onClick={() => setImportar(true)}>Importar extrato</button>
          <button className="sec" onClick={() => setLimpar(true)} disabled={!lotesMes.length}>Limpar extrato</button>
          <button className="sec" disabled={!Object.keys(alterados).length} onClick={guardar}>Guardar classificação</button>
        </div>
      </div>
      {msg && <div className="nota">{msg}</div>}

      <div className="abas" role="tablist">
        <button role="tab" aria-selected={vista === 'mes'} className={vista === 'mes' ? 'ativa' : ''} onClick={() => setVista('mes')}>Movimentos do mês</button>
        <button role="tab" aria-selected={vista === 'saldos'} className={vista === 'saldos' ? 'ativa' : ''} onClick={() => setVista('saldos')}>Saldos {ano}</button>
      </div>
      <div className="barra-bancos">
        {vista === 'mes' ? <div className="mes-nav" role="group" aria-label="Mês do extrato">
          <button className="sec" aria-label="Mês anterior" disabled={mes <= 1} onClick={() => mudarMes(mes - 1)}><ChevronLeft size={16} aria-hidden /></button>
          <select value={mes} onChange={(e) => mudarMes(Number(e.target.value))} aria-label="Mês">
            {MESES.map((m, i) => <option key={m} value={i + 1}>{`${m.charAt(0).toUpperCase() + m.slice(1)} ${ano}${mesesComDados.includes(i + 1) ? '' : ' (sem extrato)'}`}</option>)}
          </select>
          <button className="sec" aria-label="Mês seguinte" disabled={mes >= 12} onClick={() => mudarMes(mes + 1)}><ChevronRight size={16} aria-hidden /></button>
        </div> : <span className="small muted">Clique num mês para ver os movimentos.</span>}
        <div className="filtro-bancos" role="group" aria-label="Bancos visíveis">
          {ativas.map((c) => (
            <label key={c.id} className={`chip-banco${ocultas.includes(c.id) ? ' desligado' : ''}`}>
              <input type="checkbox" checked={!ocultas.includes(c.id)} onChange={() => setOcultas(ocultas.includes(c.id) ? ocultas.filter((x) => x !== c.id) : [...ocultas, c.id])} />
              <LogoBanco banco={bancoDe.get(c.id) ?? null} />
              <span>{c.nome}{c.tipo === 'investimentos' ? ' (investimentos)' : ''}</span>
              <span className="muted small">{(porConta.get(c.id) ?? []).length}</span>
            </label>
          ))}
        </div>
      </div>

      <Estado aCarregar={banco.aCarregar} erro={banco.erro} />
      {vista === 'saldos' && !banco.aCarregar && (
        <SaldosBancos contas={visiveis} lotes={(banco.dados ?? []).map((l) => alterados[l.id] ?? l)} ano={ano} aoAbrirMes={(m) => { mudarMes(m); setVista('mes'); }} />
      )}
      {vista === 'mes' && <>
      <div className="cards">
        {resumos.map(({ c, r }) => (
          <div key={c.id} className="kpi">
            <h3 className="kpi-banco"><LogoBanco banco={bancoDe.get(c.id) ?? null} tamanho={16} /> {c.nome}</h3>
            <div className="valor">{eur(r.saldoFinal)}</div>
            <div className="sub">Saldo final · inicial {eur(r.saldoInicial)}<br />Entradas {eur(r.entradas)} · Saídas {eur(r.saidas)}{!r.n && <><br />Sem extrato neste mês.</>}</div>
          </div>
        ))}
        <div className="kpi kpi-total">
          <h3>Total dos bancos visíveis</h3>
          <div className="valor">{eur(somaSaldo('saldoFinal'))}</div>
          <div className="sub">Saldo final · inicial {eur(somaSaldo('saldoInicial'))}<br />Entradas {eur(soma('entradas'))} · Saídas {eur(soma('saidas'))}<br />Movimento líquido {eur(r2(soma('entradas') - soma('saidas')))}</div>
        </div>
      </div>

      <div className="acoes">
        <label className="campo">Mostrar
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
            <option value="todos">Todos os movimentos</option>
            <option value="por-classificar">Por classificar</option>
            <option value="bolsa">Bolsa geral</option>
            <option value="contabilizados">A contabilizar</option>
            <option value="conciliados">Conciliados com o Jotform</option>
          </select>
        </label>
        <button className="sec" style={{ alignSelf: 'flex-end' }} onClick={marcarBolsa}>Marcar transferências sugeridas como bolsa geral</button>
      </div>
      <div className="tabela sec">
        <table className="tabela-bancos">
          <thead><tr><th>Banco</th><th>Data</th><th>Descrição</th><th className="num">Entrada</th><th className="num">Saída</th><th className="num">Saldo</th><th>Sugestão / conciliação</th><th>Comunidade</th><th>Categoria</th><th>Contabilizar</th></tr></thead>
          <tbody>
            {mostrar.slice(0, 600).map((m) => (
              <tr key={`${m.contaId}-${m.id}`}>
                <td><LogoBanco banco={bancoDe.get(m.contaId) ?? null} /></td>
                <td>{dataPt(m.data)}</td>
                <td className="small">{m.descricao}{m.estorno && <> <span className="etiqueta">Estorno</span></>}</td>
                <td className="num">{m.valor > 0 ? eur(m.valor) : ''}</td>
                <td className="num">{m.valor < 0 ? eur(-m.valor) : ''}</td>
                <td className="num small muted">{m.saldo != null ? eur(m.saldo) : ''}</td>
                <td className="small">{m.conciliadoCom ? <span className="etiqueta preta">Conciliado</span> : null} {m.sugestao}</td>
                <td>
                  <select value={m.comunidadeId ?? ''} onChange={(e) => alterar(m.loteId, m.id, { comunidadeId: e.target.value || undefined })}>
                    <option value="">—</option>
                    {(coms.dados ?? []).filter((c) => c.ativo !== false || c.id === m.comunidadeId).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </td>
                <td>
                  <select value={m.categoria ?? ''} onChange={(e) => alterar(m.loteId, m.id, { categoria: e.target.value || undefined })}>
                    <option value="">—</option>
                    {(cats.dados ?? []).filter((c) => (c.ativo !== false || c.nome === m.categoria) && (c.tipo === 'financeiro' || (m.valor > 0 ? c.tipo === 'entrada' : c.tipo === 'saida'))).map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                  </select>
                </td>
                <td><input type="checkbox" checked={m.contabilizar} disabled={!!m.conciliadoCom} onChange={(e) => alterar(m.loteId, m.id, { contabilizar: e.target.checked })} aria-label="Contabilizar movimento" /></td>
              </tr>
            ))}
            {!mostrar.length && <tr><td colSpan={10} className="muted">{lotesMes.length ? 'Sem movimentos neste filtro ou nos bancos visíveis.' : `Sem extratos de ${MESES[mes - 1]} ${ano}. Use Importar extrato.`}</td></tr>}
          </tbody>
          {mostrar.length > 0 && <tfoot><tr><td colSpan={3}>Total ({mostrar.length} movimentos)</td>
            <td className="num">{eur(r2(mostrar.filter((m) => m.valor > 0).reduce((s, m) => s + m.valor, 0)))}</td>
            <td className="num">{eur(r2(mostrar.filter((m) => m.valor < 0).reduce((s, m) => s - m.valor, 0)))}</td><td colSpan={5} /></tr></tfoot>}
        </table>
      </div>

      <details className="sec card maiores">
        <summary><h2 style={{ display: 'inline' }}>Maiores movimentos de {MESES[mes - 1]}</h2></summary>
        <div className="grid2" style={{ marginTop: 10 }}>
          {resumos.filter(({ c }) => (porConta.get(c.id) ?? []).length).map(({ c }) => {
            const mm = maioresMovimentos(porConta.get(c.id) ?? [], 5);
            return (
              <div key={c.id}>
                <h3 className="kpi-banco"><LogoBanco banco={bancoDe.get(c.id) ?? null} tamanho={16} /> {c.nome}</h3>
                <table><tbody>
                  {mm.entradas.map((m) => <tr key={m.id}><td>{dataPt(m.data)}</td><td className="small">{m.descricao}</td><td className="num">{eur(m.valor)}</td></tr>)}
                  {mm.saidas.map((m) => <tr key={m.id}><td>{dataPt(m.data)}</td><td className="small">{m.descricao}</td><td className="num">({eur(-m.valor)})</td></tr>)}
                </tbody></table>
              </div>
            );
          })}
        </div>
      </details>
      </>}

      <div className="sec">
        <h2>Distribuição da bolsa geral (pré-visualização)</h2>
        <p className="muted">Regra: cada mês, a bolsa geral é distribuída pela percentagem da média de assistência de adultos de cada comunidade nesse mesmo mês.</p>
        {!distribuicao.length && <p className="muted">Sem ofertas na bolsa geral neste ano.</p>}
        {distribuicao.map((d) => (
          <div key={d.mes} className="card" style={{ marginBottom: 10 }}>
            <b>{MESES[d.mes]}: {eur(d.total)}</b>
            {d.semAssistencia ? <p className="muted">Sem registos de assistência neste mês: fica por distribuir.</p> : (
              <table style={{ marginTop: 6 }}><thead><tr><th>Comunidade</th><th className="num">Média de adultos</th><th className="num">%</th><th className="num">Quota</th></tr></thead>
                <tbody>{d.linhas.map((x) => <tr key={x.nome}><td>{x.nome}</td><td className="num">{x.media}</td><td className="num">{(x.pct * 100).toFixed(1).replace('.', ',')}%</td><td className="num">{eur(x.valor)}</td></tr>)}</tbody></table>
            )}
          </div>
        ))}
      </div>
      {importar && <ImportarExtrato contas={ativas} onFechar={() => setImportar(false)} onFeito={() => void banco.recarregar()} />}
      {limpar && <LimparExtrato contas={ativas} lotes={(banco.dados ?? []).filter((l) => l.mes === mes)} mes={mes} ano={ano} onFechar={() => setLimpar(false)} onFeito={() => { setAlterados({}); void banco.recarregar(); }} />}
    </>
  );
}

const CAMPOS: [keyof MapaBanco, string][] = [['data', 'Data *'], ['descricao', 'Descrição'], ['valor', 'Montante (com sinal)'], ['debito', 'Débito'], ['credito', 'Crédito'], ['saldo', 'Saldo']];
const periodoPt = (p: string) => { const [a, m] = p.split('-'); return `${MESES[Number(m) - 1]} ${a}`; };

/** Importa um extrato da CGD ou do Santander: reconhece o banco, divide por mês e substitui os meses do ficheiro. */
function ImportarExtrato({ contas, onFechar, onFeito }: { contas: Conta[]; onFechar: () => void; onFeito: () => void }) {
  const { acesso } = useAuth();
  const [nome, setNome] = useState('');
  const [colunas, setColunas] = useState<string[]>([]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [mapa, setMapa] = useState<MapaBanco>({});
  const [bancoFicheiro, setBancoFicheiro] = useState<Banco | null>(null);
  const [contaId, setContaId] = useState('');
  const [existentes, setExistentes] = useState<BancoLote[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const res = useMemo(() => (linhas.length ? mapearExtrato(linhas, mapa) : null), [linhas, mapa]);
  const anos = useMemo(() => [...new Set((res?.movimentos ?? []).map((m) => Number(m.data.slice(0, 4))))].sort(), [res]);
  useEffect(() => {
    if (!anos.length) return;
    let vivo = true;
    void Promise.all(anos.map((a) => listarBanco(a))).then((x) => { if (vivo) setExistentes(x.flat()); }).catch((e) => setMsg(mensagemErro(e)));
    return () => { vivo = false; };
  }, [anos]);
  const previa = res && contaId && existentes ? dividirPorMes(contaId, res.movimentos, existentes, acesso!.email) : null;
  const opcoesConta = bancoFicheiro ? contas.filter((c) => bancoDaConta(c) === bancoFicheiro) : contas;

  async function ler(f: File) {
    setMsg(null); setExistentes(null);
    try {
      const t = await lerFicheiro(f);
      const b = detetarBanco(t.colunas);
      setNome(f.name); setColunas(t.colunas); setLinhas(t.linhas); setBancoFicheiro(b);
      setMapa(b ? mapaDoBanco(b, t.colunas) : sugerirMapaBanco(t.colunas));
      const sug = b ? contas.filter((c) => bancoDaConta(c) === b) : [];
      setContaId(sug.find((c) => c.tipo !== 'investimentos')?.id ?? sug[0]?.id ?? '');
      setMsg(b ? `Extrato ${NOME_BANCO[b]}: ${t.linhas.length} linhas lidas.` : `Formato não reconhecido: indique as colunas. ${t.linhas.length} linhas lidas.`);
    } catch (e) { setMsg(mensagemErro(e)); }
  }
  async function gravar() {
    if (!previa || !res) return;
    setOcupado(true);
    try {
      const [deps, desp] = await Promise.all([
        Promise.all(anos.map((a) => listarLotes(acesso!, 'depositos', a, true))).then((x) => x.flat()),
        Promise.all(anos.map((a) => listarLotes(acesso!, 'despesas', a, true))).then((x) => x.flat()),
      ]);
      const falhas: string[] = [];
      let conciliados = 0;
      for (const l of previa.lotes) {
        l.registos = sugerir(l.registos, deps, desp);
        conciliados += l.registos.filter((m) => m.conciliadoCom).length;
        try { await gravarBancoLote(l); } catch { falhas.push(periodoPt(l.periodo)); }
      }
      const conta = contas.find((c) => c.id === contaId)!;
      await auditar(acesso!.email, 'importar extrato', `${conta.nome} (${nome}): ${res.movimentos.length} movimentos em ${previa.lotes.length} meses${falhas.length ? `; não gravados (mês fechado?): ${falhas.join(', ')}` : ''}`);
      setMsg(`Gravados ${previa.lotes.length - falhas.length} meses de ${conta.nome}. ${conciliados} movimentos conciliados com o Jotform.${falhas.length ? ` Não gravados (mês fechado ou sem permissão): ${falhas.join(', ')}.` : ''}`);
      onFeito();
    } catch (e) { setMsg(mensagemErro(e)); } finally { setOcupado(false); }
  }
  return (
    <Modal titulo="Importar extrato" onFechar={onFechar}>
      <div className="nota">Exporte o extrato do homebanking da CGD ou do Santander (CSV ou Excel), tal como sai. O portal reconhece o banco, divide os movimentos por mês e <b>substitui</b> esses meses da conta, mantendo as classificações já feitas.</div>
      <input type="file" accept=".csv,.xlsx,.xls,.txt" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void ler(f); }} />
      {msg && <p className="small" style={{ marginTop: 8 }}>{bancoFicheiro && <LogoBanco banco={bancoFicheiro} tamanho={16} />} {msg}</p>}
      {!!colunas.length && (
        <label className="campo" style={{ marginTop: 10, maxWidth: 360 }}>Conta
          <select value={contaId} onChange={(e) => setContaId(e.target.value)}>
            <option value="">Escolha…</option>
            {opcoesConta.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
      )}
      {!!colunas.length && !bancoFicheiro && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginTop: 12 }}>
          {CAMPOS.map(([k, label]) => (
            <label key={k} className="campo">{label}
              <select value={mapa[k] ?? ''} onChange={(e) => setMapa({ ...mapa, [k]: e.target.value || undefined })}>
                <option value="">(não usar)</option>{colunas.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
      {res && <p className="small" style={{ marginTop: 10 }}>{res.movimentos.length} movimentos válidos{res.rejeitadas.length ? `, ${res.rejeitadas.length} linhas ignoradas` : ''}{res.movimentos.some((m) => m.estorno) ? `, ${res.movimentos.filter((m) => m.estorno).length} estornos` : ''}.</p>}
      {previa && (
        <>
          <div className="tabela" style={{ maxHeight: 300, marginTop: 8 }}><table>
            <thead><tr><th>Mês</th><th className="num">Movimentos</th><th className="num">Já gravados</th><th className="num">Classificações mantidas</th><th className="num">Saldo final</th></tr></thead>
            <tbody>{previa.lotes.map((l, i) => (
              <tr key={l.id}><td>{periodoPt(l.periodo)}</td><td className="num">{previa.meses[i].movimentos}</td>
                <td className="num">{previa.meses[i].antes ? `${previa.meses[i].antes} (substituídos)` : '—'}</td>
                <td className="num">{previa.meses[i].classificadosMantidos || '—'}</td><td className="num">{eur(resumoMes(l.registos).saldoFinal)}</td></tr>
            ))}</tbody>
          </table></div>
          <div className="acoes" style={{ marginTop: 10 }}>
            <button disabled={ocupado} onClick={() => void gravar()}>{ocupado ? 'A gravar…' : `Gravar ${previa.lotes.length} meses`}</button>
            <button className="sec" onClick={onFechar}>Fechar</button>
          </div>
        </>
      )}
      {res && !contaId && <p className="small muted">Escolha a conta para ver os meses a importar.</p>}
    </Modal>
  );
}

/** Limpa (apaga) o extrato de um mês de uma ou mais contas. Os meses fechados não se podem limpar. */
function LimparExtrato({ contas, lotes, mes, ano, onFechar, onFeito }: { contas: Conta[]; lotes: BancoLote[]; mes: number; ano: number; onFechar: () => void; onFeito: () => void }) {
  const { acesso } = useAuth();
  const comExtrato = contas.filter((c) => lotes.some((l) => l.contaId === c.id));
  const [escolhidas, setEscolhidas] = useState<string[]>(comExtrato.map((c) => c.id));
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const alvo = lotes.filter((l) => escolhidas.includes(l.contaId));
  const classificados = alvo.flatMap((l) => l.registos).filter((m) => m.categoria || m.comunidadeId || m.contabilizar || m.conciliadoCom).length;
  async function apagar() {
    if (!confirm(`Apagar ${alvo.reduce((s, l) => s + l.registos.length, 0)} movimentos de ${MESES[mes - 1]} ${ano}${classificados ? `, incluindo ${classificados} classificados` : ''}? Não se pode desfazer (pode voltar a importar o extrato).`)) return;
    setOcupado(true);
    const feitos: string[] = []; const falhas: string[] = [];
    for (const l of alvo) {
      const nome = contas.find((c) => c.id === l.contaId)?.nome ?? l.contaId;
      try { await apagarBancoLote(l.id); feitos.push(nome); } catch { falhas.push(nome); }
    }
    if (feitos.length) await auditar(acesso!.email, 'limpar extrato', `${MESES[mes - 1]} ${ano}: ${feitos.join(', ')}`);
    setOcupado(false);
    if (falhas.length) setMsg(`Não foi possível limpar: ${falhas.join(', ')} (mês fechado ou sem permissão).`);
    onFeito();
    if (!falhas.length) onFechar();
  }
  return (
    <Modal titulo={`Limpar extrato: ${MESES[mes - 1]} ${ano}`} onFechar={onFechar}>
      <p className="small">Apaga os movimentos importados deste mês das contas escolhidas, para voltar a importar o extrato. As classificações desses movimentos perdem-se. Os meses fechados não se podem limpar.</p>
      {msg && <div className="aviso">{msg}</div>}
      {comExtrato.map((c) => {
        const l = lotes.find((x) => x.contaId === c.id)!;
        return (
          <label key={c.id} className="opcao" style={{ display: 'flex' }}>
            <input type="checkbox" checked={escolhidas.includes(c.id)} onChange={() => setEscolhidas(escolhidas.includes(c.id) ? escolhidas.filter((x) => x !== c.id) : [...escolhidas, c.id])} />
            <LogoBanco banco={bancoDaConta(c)} /> {c.nome} · {l.registos.length} movimentos
          </label>
        );
      })}
      <div className="acoes" style={{ marginTop: 12 }}>
        <button disabled={!alvo.length || ocupado} onClick={() => void apagar()}>{ocupado ? 'A limpar…' : 'Limpar extrato'}</button>
        <button className="sec" onClick={onFechar}>Cancelar</button>
      </div>
    </Modal>
  );
}
