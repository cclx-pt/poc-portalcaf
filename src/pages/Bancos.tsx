import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { LogoBanco, LogoConta } from '../components/LogoBanco';
import SaldosBancos from './SaldosBancos';
import { useAuth } from '../auth/AuthProvider';
import { Estado, Modal, mensagemErro, useCarregar, useFiltros } from '../components/ui';
import { apagarBancoLote, auditar, gravar, gravarBancoLote, listarBanco, listarComunidades, listarContas, listarFechos } from '../lib/db';
import { AmostraExtrato, CamposExtrato, limparMapa } from '../components/MapaExtratoEditor';
import { lerFicheiro } from '../lib/ficheiros';
import { NOME_BANCO, bancoDaConta, maioresMovimentos, detetarBanco, dividirPorMes, escolherMapa, melhorColunaData, verificarExtratos, mesesParaLimpar, mapaCompleto, mapaDoBanco, mapasDasContas, mapearExtrato, resumoMes, sugerirMapaBanco, type Banco, type MapaBanco } from '../lib/banco';
import { eur, MESES, r2 } from '../lib/format';
import type { BancoLote, Conta, EstadoMov, MovBanco } from '../lib/types';
import type { Linha } from '../lib/fontes';

type Filtro = 'todos' | EstadoMov;
const ESTADO: Record<EstadoMov, string> = { 'por-classificar': 'Por classificar', proposto: 'Proposto', validado: 'Validado', rever: 'Rever' };
/** Estado de um movimento (os antigos, sem estado, contam como validados se já estavam classificados). */
const estadoDe = (m: MovBanco): EstadoMov => m.estado ?? (m.contabilizar || m.conciliadoCom ? 'validado' : 'por-classificar');
type MovVista = MovBanco & { loteId: string; contaId: string };

const dataPt = (d: string) => d.split('-').reverse().join('/');

export default function Bancos() {
  const { ano } = useFiltros();
  const contas = useCarregar(listarContas, []);
  const coms = useCarregar(listarComunidades, []);
  const banco = useCarregar(() => listarBanco(ano), [ano]);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [importar, setImportar] = useState(false);
  const [limpar, setLimpar] = useState(false);
  const [ocultas, setOcultas] = useState<string[]>([]);
  const [vista, setVista] = useState<'mes' | 'saldos'>('mes');
  // Extratos sempre por mês: por omissão, o último mês com movimentos neste ano.
  const mesesComDados = [...new Set((banco.dados ?? []).map((l) => l.mes))].sort((a, b) => a - b);
  const [mesEscolhido, setMes] = useState<number | null>(null);
  const mes = mesEscolhido ?? (mesesComDados[mesesComDados.length - 1] ?? new Date().getMonth() + 1);

  const ativas = (contas.dados ?? []).filter((c) => c.ativo !== false);
  const contaDe = new Map(ativas.map((c) => [c.id, c]));
  const visiveis = ativas.filter((c) => !ocultas.includes(c.id));
  const lotesMes = useMemo(() => (banco.dados ?? []).filter((l) => l.mes === mes), [banco.dados, mes]);
  const porConta = new Map(ativas.map((c) => [c.id, lotesMes.filter((l) => l.contaId === c.id).flatMap((l) => l.registos)]));
  const movs: MovVista[] = lotesMes.filter((l) => !ocultas.includes(l.contaId))
    .flatMap((l) => l.registos.map((m) => ({ ...m, loteId: l.id, contaId: l.contaId })))
    .sort((a, b) => a.data.localeCompare(b.data) || a.contaId.localeCompare(b.contaId) || (a.ordem ?? 0) - (b.ordem ?? 0));
  const mostrar = movs.filter((m) => filtro === 'todos' || estadoDe(m) === filtro);
  const contagem = (e: EstadoMov) => movs.filter((m) => estadoDe(m) === e).length;
  // Totais recalculados só com os bancos visíveis.
  const resumos = visiveis.map((c) => ({ c, r: resumoMes(porConta.get(c.id) ?? []) }));
  const soma = (k: 'entradas' | 'saidas') => r2(resumos.reduce((s, x) => s + x.r[k], 0));
  const somaSaldo = (k: 'saldoInicial' | 'saldoFinal') => { const v = resumos.filter((x) => x.r[k] != null); return v.length ? r2(v.reduce((s, x) => s + (x.r[k] as number), 0)) : null; };

  const mudarMes = (m: number) => setMes(m);
  const nomeCom = (id?: string) => (id ? (coms.dados ?? []).find((c) => c.id === id)?.nome ?? id : undefined);

  return (
    <>
      <div className="linha" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1>Bancos {ano}</h1>
          <p className="muted">Extratos da CGD e do Santander, sempre por mês, numa vista conjunta, e análise dos saldos. A classificação, a conciliação com o Jotform e a distribuição pelas comunidades fazem-se na <Link to="/reconciliacao">Reconciliação bancária</Link>.</p>
        </div>
        <div className="acoes">
          <button onClick={() => setImportar(true)}>Importar extrato</button>
          <button className="sec" onClick={() => setLimpar(true)} disabled={!(banco.dados ?? []).some((l) => l.registos.length)}>Limpar extrato…</button>
        </div>
      </div>

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
              <LogoConta conta={c} />
              <span>{c.nome}{c.tipo === 'investimentos' ? ' (investimentos)' : ''}</span>
              <span className="muted small">{(porConta.get(c.id) ?? []).length}</span>
            </label>
          ))}
        </div>
      </div>

      <Estado aCarregar={banco.aCarregar} erro={banco.erro} />
      {vista === 'saldos' && !banco.aCarregar && (
        <SaldosBancos contas={visiveis} lotes={banco.dados ?? []} ano={ano} aoAbrirMes={(m) => { mudarMes(m); setVista('mes'); }} />
      )}
      {vista === 'mes' && <>
      <div className="cards">
        {resumos.map(({ c, r }) => (
          <div key={c.id} className="kpi">
            <h3 className="kpi-banco"><LogoConta conta={c} tamanho={16} /> {c.nome}</h3>
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
            <option value="todos">{`Todos os movimentos (${movs.length})`}</option>
            <option value="por-classificar">{`Por classificar (${contagem('por-classificar')})`}</option>
            <option value="proposto">{`Propostos (${contagem('proposto')})`}</option>
            <option value="rever">{`Para rever (${contagem('rever')})`}</option>
            <option value="validado">{`Validados (${contagem('validado')})`}</option>
          </select>
        </label>
        <Link className="botao sec" style={{ alignSelf: 'flex-end' }} to="/reconciliacao">Reconciliar este mês</Link>
      </div>
      <div className="tabela sec">
        <table className="tabela-bancos">
          <thead><tr><th>Banco</th><th>Data</th><th>Descrição</th><th className="num">Entrada</th><th className="num">Saída</th><th className="num">Saldo</th><th>Estado</th><th>Classificação</th></tr></thead>
          <tbody>
            {mostrar.slice(0, 600).map((m) => (
              <tr key={`${m.contaId}-${m.id}`}>
                <td><LogoConta conta={contaDe.get(m.contaId)} /></td>
                <td>{dataPt(m.data)}</td>
                <td className="small">{m.descricao}{m.estorno && <> <span className="etiqueta">Estorno</span></>}</td>
                <td className="num">{m.valor > 0 ? eur(m.valor) : ''}</td>
                <td className="num">{m.valor < 0 ? eur(-m.valor) : ''}</td>
                <td className="num small muted">{m.saldo != null ? eur(m.saldo) : ''}</td>
                <td><span className={'etiqueta' + (estadoDe(m) === 'validado' ? ' preta' : '')}>{ESTADO[estadoDe(m)]}</span></td>
                <td className="small">{[m.categoria, m.partes?.length ? `repartido (${m.partes.length})` : nomeCom(m.comunidadeId)].filter(Boolean).join(' · ') || <span className="muted">—</span>}</td>
              </tr>
            ))}
            {!mostrar.length && <tr><td colSpan={8} className="muted">{lotesMes.length ? 'Sem movimentos neste filtro ou nos bancos visíveis.' : `Sem extratos de ${MESES[mes - 1]} ${ano}. Use Importar extrato.`}</td></tr>}
          </tbody>
          {mostrar.length > 0 && <tfoot><tr><td colSpan={3}>Total ({mostrar.length} movimentos)</td>
            <td className="num">{eur(r2(mostrar.filter((m) => m.valor > 0).reduce((s, m) => s + m.valor, 0)))}</td>
            <td className="num">{eur(r2(mostrar.filter((m) => m.valor < 0).reduce((s, m) => s - m.valor, 0)))}</td><td colSpan={3} /></tr></tfoot>}
        </table>
      </div>

      <details className="sec card maiores">
        <summary><h2 style={{ display: 'inline' }}>Maiores movimentos de {MESES[mes - 1]}</h2></summary>
        <div className="grid2" style={{ marginTop: 10 }}>
          {resumos.filter(({ c }) => (porConta.get(c.id) ?? []).length).map(({ c }) => {
            const mm = maioresMovimentos(porConta.get(c.id) ?? [], 5);
            return (
              <div key={c.id}>
                <h3 className="kpi-banco"><LogoConta conta={c} tamanho={16} /> {c.nome}</h3>
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

      {importar && <ImportarExtrato contas={ativas} onFechar={() => setImportar(false)} onFeito={() => void banco.recarregar()} />}
      {limpar && <LimparExtrato contas={ativas} lotes={banco.dados ?? []} mes={mes} ano={ano} onFechar={() => setLimpar(false)} onFeito={() => void banco.recarregar()} />}
    </>
  );
}

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
  const [ajustar, setAjustar] = useState(false);
  const [daConta, setDaConta] = useState(false);
  const res = useMemo(() => (linhas.length && mapaCompleto(mapa) ? mapearExtrato(linhas, mapa) : null), [linhas, mapa]);
  const anos = useMemo(() => [...new Set((res?.movimentos ?? []).map((m) => Number(m.data.slice(0, 4))))].sort(), [res]);
  useEffect(() => {
    if (!anos.length) return;
    let vivo = true;
    void Promise.all(anos.map((a) => listarBanco(a))).then((x) => { if (vivo) setExistentes(x.flat()); }).catch((e) => setMsg(mensagemErro(e)));
    return () => { vivo = false; };
  }, [anos]);
  const previa = res && contaId && existentes ? dividirPorMes(contaId, res.movimentos, existentes, acesso!.email) : null;
  // Meses a importar: por omissão todos os abertos; os fechados não se podem escolher.
  const fechosImp = useCarregar(listarFechos, []);
  const fechadosImp = new Set((fechosImp.dados ?? []).filter((f) => f.estado === 'fechado').map((f) => f.periodo));
  const [mesesSel, setMesesSel] = useState<string[] | null>(null);
  const escolhidosImp = previa ? previa.lotes.filter((l) => !fechadosImp.has(l.periodo) && (mesesSel ?? previa.lotes.map((x) => x.id)).includes(l.id)) : [];
  // Verificação antes de gravar: os saldos encadeiam (no ficheiro e com os meses já importados desta conta)?
  const sugestaoData = useMemo(() => (linhas.length && mapaCompleto(mapa) ? melhorColunaData(linhas, mapa, colunas) : null), [linhas, mapa, colunas]);
  const avisosPrevia = previa ? verificarExtratos([...(existentes ?? []).filter((e) => e.contaId === contaId && !previa.lotes.some((l) => l.id === e.id)), ...previa.lotes], [contaId]) : [];
  const opcoesConta = bancoFicheiro ? contas.filter((c) => bancoDaConta(c) === bancoFicheiro) : contas;

  async function ler(f: File) {
    setMsg(null); setExistentes(null);
    try {
      const t = await lerFicheiro(f);
      // 1.º o mapeamento de uma conta (Configuração); 2.º os formatos conhecidos (CGD, Santander); 3.º indicar as colunas.
      const g = escolherMapa(t.colunas, mapasDasContas(contas));
      const contaG = g ? contas.find((c) => c.id === g.contaId) : undefined;
      const b = contaG ? bancoDaConta(contaG) : detetarBanco(t.colunas);
      setNome(f.name); setColunas(t.colunas); setLinhas(t.linhas); setBancoFicheiro(contaG ? null : b); setDaConta(!!g); setMesesSel(null);
      setMapa(g ? g.campos : b ? mapaDoBanco(b, t.colunas) : sugerirMapaBanco(t.colunas));
      setAjustar(!g && !b);
      const sug = b ? contas.filter((c) => bancoDaConta(c) === b) : [];
      setContaId(contaG?.id ?? (sug.find((c) => c.tipo !== 'investimentos')?.id ?? sug[0]?.id ?? ''));
      setMsg(contaG ? `Extrato de ${contaG.nome} (colunas definidas na conta): ${t.linhas.length} linhas lidas.`
        : b ? `Extrato ${NOME_BANCO[b]}: ${t.linhas.length} linhas lidas.`
        : `Formato não reconhecido: escolha a conta e indique as colunas (pode guardá-las na conta para a próxima vez). ${t.linhas.length} linhas lidas.`);
    } catch (e) { setMsg(mensagemErro(e)); }
  }
  /** Escolher a conta aplica as colunas dessa conta, se servirem a este ficheiro. */
  function escolherConta(id: string) {
    setContaId(id);
    const c = contas.find((x) => x.id === id);
    const g = c ? escolherMapa(colunas, mapasDasContas([c])) : null;
    if (g) { setMapa(g.campos); setDaConta(true); setAjustar(false); }
  }
  async function guardarNaConta() {
    const c = contas.find((x) => x.id === contaId);
    if (!c || !mapaCompleto(mapa)) return;
    try {
      await gravar('contas', { ...c, mapa: limparMapa(mapa), mapaColunas: colunas });
      await auditar(acesso!.email, 'conta: extrato e logótipo', `${c.nome}: mapeamento guardado ao importar`);
      setDaConta(true); setAjustar(false);
      setMsg(`Colunas guardadas na conta ${c.nome}: da próxima vez são aplicadas sozinhas. Pode alterá-las em Configuração.`);
    } catch (e) { setMsg(mensagemErro(e)); }
  }
  async function gravarMeses() {
    if (!previa || !res || !escolhidosImp.length) return;
    setOcupado(true);
    try {
      const falhas: string[] = [];
      for (const l of escolhidosImp) {
        try { await gravarBancoLote(l); } catch { falhas.push(periodoPt(l.periodo)); }
      }
      const conta = contas.find((c) => c.id === contaId)!;
      const nMov = escolhidosImp.reduce((s0, l) => s0 + l.registos.length, 0);
      await auditar(acesso!.email, 'importar extrato', `${conta.nome} (${nome}): ${nMov} movimentos em ${escolhidosImp.length} meses (${escolhidosImp.map((l) => periodoPt(l.periodo)).join(', ')})${falhas.length ? `; não gravados (mês fechado?): ${falhas.join(', ')}` : ''}`);
      setMsg(`Gravados ${escolhidosImp.length - falhas.length} meses de ${conta.nome}. Use Propor classificação em cada mês para conciliar com o Jotform e classificar.${falhas.length ? ` Não gravados (mês fechado ou sem permissão): ${falhas.join(', ')}.` : ''}`);
      onFeito();
    } catch (e) { setMsg(mensagemErro(e)); } finally { setOcupado(false); }
  }
  return (
    <Modal titulo="Importar extrato" onFechar={onFechar}>
      <div className="nota">Exporte o extrato do homebanking da CGD ou do Santander (CSV ou Excel), tal como sai. O portal reconhece o banco, divide os movimentos por mês e <b>substitui</b> esses meses da conta, mantendo as classificações já feitas.</div>
      <input type="file" accept=".csv,.xlsx,.xls,.txt" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void ler(f); }} />
      {msg && <p className="small" style={{ marginTop: 8 }}>{contaId ? <LogoConta conta={contas.find((c) => c.id === contaId)} tamanho={16} /> : bancoFicheiro && <LogoBanco banco={bancoFicheiro} tamanho={16} />} {msg}</p>}
      {!!colunas.length && (
        <label className="campo" style={{ marginTop: 10, maxWidth: 360 }}>Conta
          <select value={contaId} onChange={(e) => escolherConta(e.target.value)}>
            <option value="">Escolha…</option>
            {opcoesConta.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
      )}
      <AmostraExtrato colunas={colunas} linhas={linhas} mapa={mapa} />
      {!!colunas.length && !ajustar && <p className="small"><button className="link" onClick={() => setAjustar(true)}>Ajustar as colunas</button></p>}
      {!!colunas.length && ajustar && (
        <div style={{ marginTop: 12 }}>
          <CamposExtrato colunas={colunas} mapa={mapa} onChange={setMapa} />
          <div className="linha" style={{ marginTop: 8, gap: 8 }}>
            <button className="sec" disabled={!contaId || !mapaCompleto(mapa)} onClick={() => void guardarNaConta()}>{daConta ? 'Atualizar as colunas da conta' : 'Guardar as colunas na conta'}</button>
            {!contaId && <span className="small muted">Escolha a conta para guardar.</span>}
          </div>
        </div>
      )}
      {res && <p className="small" style={{ marginTop: 10 }}>{res.movimentos.length} movimentos válidos{res.rejeitadas.length ? `, ${res.rejeitadas.length} linhas ignoradas` : ''}{res.movimentos.some((m) => m.estorno) ? `, ${res.movimentos.filter((m) => m.estorno).length} estornos` : ''}.</p>}
      {sugestaoData && (
        <div className="aviso" style={{ marginTop: 8 }}>
          Com a coluna da data "{mapa.data}", {sugestaoData.quebrasAtual} movimentos têm um saldo que não bate com o anterior; com "{sugestaoData.coluna}" são {sugestaoData.quebras}.
          Use a <b>data do movimento</b>, não a data valor. <button className="link" onClick={() => setMapa({ ...mapa, data: sugestaoData.coluna })}>Usar "{sugestaoData.coluna}"</button>
        </div>
      )}
      {previa && !!avisosPrevia.length && (
        <div className="aviso" style={{ marginTop: 8 }}>
          <b>Antes de gravar, confirme a conta e as colunas</b> (os saldos não encadeiam{(existentes ?? []).some((e) => e.contaId === contaId && !previa.lotes.some((l) => l.id === e.id)) ? ' com o ficheiro ou com os meses já importados desta conta' : ''}):
          <ul style={{ margin: '4px 0 0' }}>{avisosPrevia.slice(0, 6).map((a, i) => <li key={i} className="small">{a.texto}</li>)}{avisosPrevia.length > 6 && <li className="small">… e mais {avisosPrevia.length - 6}.</li>}</ul>
        </div>
      )}
      {previa && (
        <>
          <div className="tabela" style={{ maxHeight: 300, marginTop: 8 }}><table>
            <thead><tr><th><input type="checkbox" aria-label="Todos os meses abertos" checked={escolhidosImp.length === previa.lotes.filter((l) => !fechadosImp.has(l.periodo)).length && escolhidosImp.length > 0}
              onChange={(e) => setMesesSel(e.target.checked ? previa.lotes.map((l) => l.id) : [])} /></th><th>Mês</th><th className="num">Movimentos</th><th className="num">Já gravados</th><th className="num">Classificações mantidas</th><th className="num">Saldo final</th></tr></thead>
            <tbody>{previa.lotes.map((l, i) => (
              <tr key={l.id} className={fechadosImp.has(l.periodo) ? 'muted' : ''}>
                <td><input type="checkbox" disabled={fechadosImp.has(l.periodo)} aria-label={`Importar ${periodoPt(l.periodo)}`} checked={escolhidosImp.some((x) => x.id === l.id)}
                  onChange={() => { const atual = mesesSel ?? previa.lotes.map((x) => x.id); setMesesSel(atual.includes(l.id) ? atual.filter((x) => x !== l.id) : [...atual, l.id]); }} /></td>
                <td>{periodoPt(l.periodo)}{fechadosImp.has(l.periodo) && <> <span className="etiqueta preta">Fechado</span></>}</td><td className="num">{previa.meses[i].movimentos}</td>
                <td className="num">{previa.meses[i].antes ? `${previa.meses[i].antes} (substituídos)` : '—'}</td>
                <td className="num">{previa.meses[i].classificadosMantidos || '—'}</td><td className="num">{eur(resumoMes(l.registos).saldoFinal)}</td></tr>
            ))}</tbody>
          </table></div>
          <div className="acoes" style={{ marginTop: 10 }}>
            <button disabled={ocupado || !escolhidosImp.length} onClick={() => void gravarMeses()}>{ocupado ? 'A gravar…' : `Importar ${escolhidosImp.length} ${escolhidosImp.length === 1 ? 'mês' : 'meses'}`}</button>
            <span className="small muted" style={{ alignSelf: 'center' }}>Escolha os meses a importar; os outros meses da conta não mudam. Os meses fechados não se podem importar.</span>
            <button className="sec" onClick={onFechar}>Fechar</button>
          </div>
        </>
      )}
      {res && !contaId && <p className="small muted">Escolha a conta para ver os meses a importar.</p>}
    </Modal>
  );
}

/** Limpa (apaga) o extrato dos meses abertos escolhidos, de uma ou mais contas. Os meses fechados não se podem limpar. */
function LimparExtrato({ contas, lotes, mes, ano, onFechar, onFeito }: { contas: Conta[]; lotes: BancoLote[]; mes: number; ano: number; onFechar: () => void; onFeito: () => void }) {
  const { acesso } = useAuth();
  const fechos = useCarregar(listarFechos, []);
  const fechados = new Set((fechos.dados ?? []).filter((f) => f.estado === 'fechado').map((f) => f.periodo));
  const meses = mesesParaLimpar(lotes, fechados);
  const abertos = meses.filter((m) => !m.fechado);
  const comExtrato = contas.filter((c) => lotes.some((l) => l.contaId === c.id && l.registos.length));
  const [escolhidos, setEscolhidos] = useState<number[] | null>(null);
  const [escolhidas, setEscolhidas] = useState<string[]>(comExtrato.map((c) => c.id));
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // Por omissão: o mês que está a ver, se estiver aberto (só depois de saber que meses estão fechados).
  const mesesSel = escolhidos ?? (fechos.dados ? abertos.filter((m) => m.mes === mes).map((m) => m.mes) : []);
  const alvo = lotes.filter((l) => mesesSel.includes(l.mes) && !fechados.has(l.periodo) && escolhidas.includes(l.contaId) && l.registos.length);
  const nMov = alvo.reduce((s0, l) => s0 + l.registos.length, 0);
  const classificados = alvo.flatMap((l) => l.registos).filter((m) => m.categoria || m.comunidadeId || m.contabilizar || m.conciliadoCom).length;
  const nomesMeses = [...new Set(alvo.map((l) => l.mes))].sort((a, b) => a - b).map((m) => MESES[m - 1]).join(', ');
  const alternar = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

  async function apagar() {
    if (!confirm(`Apagar ${nMov} movimentos de ${nomesMeses} de ${ano}${classificados ? `, incluindo ${classificados} classificados` : ''}? Não se pode desfazer (pode voltar a importar o extrato).`)) return;
    setOcupado(true);
    const feitos: string[] = []; const falhas: string[] = [];
    for (const l of alvo) {
      const nome = `${contas.find((c) => c.id === l.contaId)?.nome ?? l.contaId} (${MESES[l.mes - 1]})`;
      try { await apagarBancoLote(l.id); feitos.push(nome); } catch { falhas.push(nome); }
    }
    if (feitos.length) await auditar(acesso!.email, 'limpar extrato', `${ano}: ${feitos.join(', ')}`);
    setOcupado(false);
    if (falhas.length) setMsg(`Não foi possível limpar: ${falhas.join(', ')} (mês fechado ou sem permissão).`);
    onFeito();
    if (!falhas.length) onFechar();
  }
  return (
    <Modal titulo={`Limpar extrato · ${ano}`} onFechar={onFechar}>
      <p className="small">Apaga os movimentos importados dos meses e contas escolhidos, para voltar a importar o extrato. As classificações desses movimentos perdem-se. Só os meses abertos se podem limpar: para limpar um mês fechado, reabra-o primeiro no Fecho mensal.</p>
      {msg && <div className="aviso">{msg}</div>}
      <Estado aCarregar={fechos.aCarregar} erro={fechos.erro} vazio={!meses.length} />
      {!!meses.length && !fechos.aCarregar && <>
        <div className="linha" style={{ justifyContent: 'space-between', marginTop: 8 }}>
          <h3 style={{ margin: 0 }}>Meses</h3>
          {abertos.length > 1 && <span className="small">
            <button className="link" onClick={() => setEscolhidos(abertos.map((m) => m.mes))}>Todos os abertos</button> · <button className="link" onClick={() => setEscolhidos([])}>Nenhum</button>
          </span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 4 }}>
          {meses.map((m) => (
            <label key={m.mes} className="opcao" style={{ display: 'flex', opacity: m.fechado ? 0.55 : 1 }} title={m.fechado ? 'Mês fechado: reabra-o no Fecho mensal para o poder limpar' : undefined}>
              <input type="checkbox" disabled={m.fechado} checked={!m.fechado && mesesSel.includes(m.mes)} onChange={() => setEscolhidos(alternar(mesesSel, m.mes))} />
              {MESES[m.mes - 1]} · {m.movimentos} mov.{m.fechado && <> <span className="etiqueta preta">Fechado</span></>}
            </label>
          ))}
        </div>
        {!abertos.length && <p className="small muted">Todos os meses com extrato estão fechados.</p>}
        <h3 style={{ marginTop: 12 }}>Contas</h3>
        {comExtrato.map((c) => (
          <label key={c.id} className="opcao" style={{ display: 'flex' }}>
            <input type="checkbox" checked={escolhidas.includes(c.id)} onChange={() => setEscolhidas(alternar(escolhidas, c.id))} />
            <LogoConta conta={c} /> {c.nome}
          </label>
        ))}
      </>}
      <p className="small" style={{ marginTop: 10 }}>{alvo.length ? `Vai limpar ${nMov} movimentos (${nomesMeses}).` : 'Escolha pelo menos um mês aberto e uma conta.'}</p>
      <div className="acoes" style={{ marginTop: 8 }}>
        <button disabled={!alvo.length || ocupado} onClick={() => void apagar()}>{ocupado ? 'A limpar…' : 'Limpar extrato'}</button>
        <button className="sec" onClick={onFechar}>Cancelar</button>
      </div>
    </Modal>
  );
}


