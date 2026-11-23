import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { LogoBanco } from '../components/LogoBanco';
import { useAuth } from '../auth/AuthProvider';
import { Estado, Modal, mensagemErro, useCarregar, useFiltros } from '../components/ui';
import { useAvisoSaida } from '../components/SaidaSemGravar';
import { auditar, gravar, gravarBancoLote, listarBanco, listarCategorias, listarComunidades, listarContas, listarCustosFixos, listarDimensoes, listarLotes, listarRegrasBanco, lerConfigAssistencia } from '../lib/db';
import { type RegraBanco, REGRAS_INICIAIS, aceitarPropostas, controloMes, proporClassificacao, relatorioExtratos, repartirPorPrevisao, resolverPartes, sugerirPadrao, candidatosReembolso, registosConciliados, consolidacaoMes, type RegistoJotform, temPalavra, validar, descricaoContem, type DimensaoRelatorio } from '../lib/classificacaoBanco';
import { bancoDaConta } from '../lib/banco';
import { dataPT, eur, MESES, r2 } from '../lib/format';
import type { BancoLote, Categoria, Comunidade, Dimensao, EstadoMov, MovBanco, ParteMov } from '../lib/types';
import { comunidadeAtiva, destinoFusao, pesos12m } from '../lib/resumos';

type Filtro = 'todos' | EstadoMov | 'bolsa' | 'conciliados';
const ESTADO: Record<EstadoMov, string> = { 'por-classificar': 'Por classificar', proposto: 'Proposto', validado: 'Validado', rever: 'Rever' };
/** Estado de um movimento (os antigos, sem estado, contam como validados se já estavam classificados). */
const estadoDe = (m: MovBanco): EstadoMov => m.estado ?? (m.contabilizar || m.conciliadoCom ? 'validado' : 'por-classificar');
type MovVista = MovBanco & { loteId: string; contaId: string };

const dataPt = (d: string) => d.split('-').reverse().join('/');

export default function Reconciliacao() {
  const { acesso } = useAuth();
  const { ano } = useFiltros();
  const contas = useCarregar(listarContas, []);
  const coms = useCarregar(listarComunidades, []);
  const cats = useCarregar(listarCategorias, []);
  const banco = useCarregar(() => listarBanco(ano), [ano]);
  const assist = useCarregar(async () => {
    const [atual, antes, cfg] = await Promise.all([listarLotes(acesso!, 'assistencia', ano), listarLotes(acesso!, 'assistencia', ano - 1), lerConfigAssistencia()]);
    return { atual, antes, evento: cfg.eventoCelebracao };
  }, [ano]);
  const dims = useCarregar(listarDimensoes, []);
  const regras = useCarregar(listarRegrasBanco, []);
  // Registos do Jotform para cruzar à mão e para ver os dados dos movimentos conciliados.
  const jot = useCarregar(async () => {
    const [depositos, desp, despAntes, contribuir] = await Promise.all([listarLotes(acesso!, 'depositos', ano), listarLotes(acesso!, 'despesas', ano), listarLotes(acesso!, 'despesas', ano - 1), listarLotes(acesso!, 'contribuir', ano)]);
    return { depositos, despesas: [...despAntes, ...desp], contribuir };
  }, [ano, acesso?.email]);
  const cfixos = useCarregar(() => listarCustosFixos(acesso!), [acesso?.email]);
  const [detalhe, setDetalhe] = useState<MovVista | null>(null);
  const [relDim, setRelDim] = useState<DimensaoRelatorio>('rubrica');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [texto, setTexto] = useState('');
  const [alterados, setAlterados] = useState<Record<string, BancoLote>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [ocultas, setOcultas] = useState<string[]>([]);
  const [vista, setVista] = useState<'mes' | 'relatorio'>('mes');
  // Extratos sempre por mês: por omissão, o último mês com movimentos neste ano.
  const mesesComDados = [...new Set((banco.dados ?? []).map((l) => l.mes))].sort((a, b) => a - b);
  const [mesEscolhido, setMes] = useState<number | null>(null);
  const mes = mesEscolhido ?? (mesesComDados[mesesComDados.length - 1] ?? new Date().getMonth() + 1);

  const ativas = (contas.dados ?? []).filter((c) => c.ativo !== false);
  const bancoDe = new Map(ativas.map((c) => [c.id, bancoDaConta(c)]));
  const lotesMes = useMemo(() => (banco.dados ?? []).filter((l) => l.mes === mes).map((l) => alterados[l.id] ?? l), [banco.dados, mes, alterados]);
  const porConta = new Map(ativas.map((c) => [c.id, lotesMes.filter((l) => l.contaId === c.id).flatMap((l) => l.registos)]));
  const movs: MovVista[] = lotesMes.filter((l) => !ocultas.includes(l.contaId))
    .flatMap((l) => l.registos.map((m) => ({ ...m, loteId: l.id, contaId: l.contaId })))
    .sort((a, b) => a.data.localeCompare(b.data) || a.contaId.localeCompare(b.contaId) || (a.ordem ?? 0) - (b.ordem ?? 0));
  const mostrar = movs.filter((m) => (!texto.trim() || descricaoContem(`${m.descricao} ${(m.partes ?? []).map((p) => p.descricao ?? '').join(' ')}`, texto)) && (
    filtro === 'todos' ? true
      : filtro === 'bolsa' ? m.comunidadeId === 'bolsa-geral'
        : filtro === 'conciliados' ? !!m.conciliadoCom
          : estadoDe(m) === filtro));
  const contagem = (e: EstadoMov) => movs.filter((m) => estadoDe(m) === e).length;

  function alterar(loteId: string, id: string, patch: Partial<MovBanco>) {
    const base = alterados[loteId] ?? banco.dados!.find((l) => l.id === loteId)!;
    setAlterados({ ...alterados, [loteId]: { ...base, registos: base.registos.map((m) => (m.id === id ? { ...m, ...patch } : m)) } });
  }
  /** Propõe a classificação dos movimentos do mês (bancos visíveis) com o plano financeiro. */
  async function propor() {
    setMsg('A preparar a proposta…');
    try {
      // Reembolsos pagos em janeiro podem ter a fatura (e o registo) do ano anterior.
      const [deps, desp, despAntes, contrib] = await Promise.all([listarLotes(acesso!, 'depositos', ano), listarLotes(acesso!, 'despesas', ano), listarLotes(acesso!, 'despesas', ano - 1), listarLotes(acesso!, 'contribuir', ano)]);
      const ctx = {
        categorias: cats.dados ?? [], regras: regras.dados?.length ? regras.dados : REGRAS_INICIAIS, depositos: deps, despesas: [...despAntes, ...desp], contribuir: contrib,
        historico: (banco.dados ?? []).flatMap((l) => (alterados[l.id] ?? l).registos), custosFixos: cfixos.dados ?? [],
      };
      const novo = { ...alterados };
      for (const l of lotesMes) if (!ocultas.includes(l.contaId)) novo[l.id] = { ...l, registos: proporClassificacao(l.registos, ctx) };
      setAlterados(novo);
      const todos = Object.values(novo).filter((l) => l.mes === mes).flatMap((l) => l.registos);
      setMsg(`Proposta pronta: ${todos.filter((m) => m.estado === 'proposto').length} propostos, ${todos.filter((m) => m.estado === 'rever').length} para rever, ${todos.filter((m) => m.estado === 'por-classificar').length} por classificar. Reveja e use Aceitar propostas; depois Guardar classificação.`);
    } catch (e) { setMsg(mensagemErro(e)); }
  }
  function aceitar() {
    const novo = { ...alterados };
    for (const l of lotesMes) if (!ocultas.includes(l.contaId)) novo[l.id] = { ...l, registos: aceitarPropostas(l.registos, cats.dados ?? []) };
    setAlterados(novo);
  }
  async function guardar(): Promise<boolean> {
    setMsg(null);
    try {
      const ls = Object.values(alterados);
      for (const l of ls) await gravarBancoLote({ ...l, atualizadoEm: new Date().toISOString(), atualizadoPor: acesso!.email });
      await auditar(acesso!.email, 'classificar banco', `${ls.map((l) => `${l.contaId} ${l.periodo}`).join(', ')}`);
      setAlterados({}); await banco.recarregar(); setMsg('Classificação guardada. Recalcule os resumos no Painel para atualizar os totais.');
      return true;
    } catch (e) { setMsg(mensagemErro(e)); return false; }
  }
  // Sair do ecrã com classificações por guardar: pergunta (gravar e sair, sair sem gravar, ficar).
  useAvisoSaida(Object.keys(alterados).length > 0, guardar);
  const mudarMes = (m: number) => { if (Object.keys(alterados).length && !confirm('Há classificações por guardar. Mudar de mês e perdê-las?')) return; setAlterados({}); setMes(m); };

  // Pré-visualização da distribuição da bolsa geral pela média de adultos dos últimos 12 meses (a mesma regra dos resumos).
  const bolsaPorMes = Array.from({ length: 12 }, (_, i) => r2((banco.dados ?? []).flatMap((l) => l.registos)
    .filter((m) => m.contabilizar && m.comunidadeId === 'bolsa-geral' && m.valor > 0 && Number(m.data.slice(5, 7)) === i + 1 && m.data.startsWith(String(ano)))
    .reduce((s, m) => s + m.valor, 0)));
  const distribuicao = bolsaPorMes.map((total, i) => {
    if (!total) return null;
    const p = `${ano}-${String(i + 1).padStart(2, '0')}`;
    const destino = destinoFusao(coms.dados ?? []);
    const w12 = pesos12m(assist.dados?.atual ?? [], assist.dados?.antes ?? [], ano, i + 1, assist.dados?.evento, (c) => destino(c, p));
    const pesos = (coms.dados ?? []).filter((c) => !c.especial && comunidadeAtiva(c, p)).map((c) => ({ c, media: w12.get(c.id) ?? 0 }));
    const soma = pesos.reduce((s, x) => s + x.media, 0);
    return { mes: i, total, linhas: pesos.filter((x) => x.media > 0).map((x) => ({ nome: x.c.nome, media: r2(x.media), pct: soma ? x.media / soma : 0, valor: soma ? r2((total * x.media) / soma) : 0 })), semAssistencia: !soma };
  }).filter(Boolean) as { mes: number; total: number; linhas: { nome: string; media: number; pct: number; valor: number }[]; semAssistencia: boolean }[];

  return (
    <>
      <div className="linha" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1>Reconciliação bancária {ano}</h1>
          <p className="muted">Trabalho mensal: classificar os movimentos dos extratos com o plano financeiro, conciliar com o Jotform (depósitos, reembolsos, Contribuir) e repartir pelas comunidades. Cada euro conta uma só vez; os movimentos conciliados e os financeiros não entram nos resultados.</p>
        </div>
        <div className="acoes">
          <button disabled={!Object.keys(alterados).length} onClick={() => void guardar()}>Guardar classificação</button>
        </div>
      </div>
      {msg && <div className="nota">{msg}</div>}

      <div className="abas" role="tablist">
        <button role="tab" aria-selected={vista === 'mes'} className={vista === 'mes' ? 'ativa' : ''} onClick={() => setVista('mes')}>Reconciliação do mês</button>
        <button role="tab" aria-selected={vista === 'relatorio'} className={vista === 'relatorio' ? 'ativa' : ''} onClick={() => setVista('relatorio')}>Relatório {ano}</button>
      </div>
      <div className="barra-bancos">
        {vista === 'mes' ? <div className="mes-nav" role="group" aria-label="Mês do extrato">
          <button className="sec" aria-label="Mês anterior" disabled={mes <= 1} onClick={() => mudarMes(mes - 1)}><ChevronLeft size={16} aria-hidden /></button>
          <select value={mes} onChange={(e) => mudarMes(Number(e.target.value))} aria-label="Mês">
            {MESES.map((m, i) => <option key={m} value={i + 1}>{`${m.charAt(0).toUpperCase() + m.slice(1)} ${ano}${mesesComDados.includes(i + 1) ? '' : ' (sem extrato)'}`}</option>)}
          </select>
          <button className="sec" aria-label="Mês seguinte" disabled={mes >= 12} onClick={() => mudarMes(mes + 1)}><ChevronRight size={16} aria-hidden /></button>
        </div> : <span className="small muted">Movimentos validados que contam nos resultados.</span>}
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
      {vista === 'relatorio' && !banco.aCarregar && (() => {
        const todos = (banco.dados ?? []).map((l) => alterados[l.id] ?? l).filter((l) => !ocultas.includes(l.contaId)).flatMap((l) => l.registos);
        const rel = relatorioExtratos(todos, cats.dados ?? [], relDim, 1, 12);
        const nomeCom = (id: string) => (coms.dados ?? []).find((c) => c.id === id)?.nome ?? id;
        const nomeCC = (cod: string) => { const d = (dims.dados ?? []).find((x) => x.tipo === 'centro' && x.codigo === cod); return d ? `${d.codigo} ${d.nome}` : cod; };
        const rot = (k: string) => (relDim === 'comunidade' ? nomeCom(k) : relDim === 'centroCusto' ? nomeCC(k) : k);
        return (
          <div className="sec">
            <div className="acoes">
              <label className="campo">Agrupar por
                <select value={relDim} onChange={(e) => setRelDim(e.target.value as DimensaoRelatorio)}>
                  <option value="rubrica">Rubrica</option><option value="categoria">Categoria</option><option value="comunidade">Comunidade</option>
                  <option value="centroCusto">Centro de custo</option><option value="fornecedor">Fornecedor</option><option value="projeto">Projeto ou evento</option>
                </select></label>
            </div>
            <div className="tabela"><table>
              <thead><tr><th>{relDim === 'centroCusto' ? 'Centro de custo' : relDim.charAt(0).toUpperCase() + relDim.slice(1)}</th><th className="num">Receitas</th><th className="num">Despesas</th><th className="num">Saldo</th><th className="num">Movimentos</th></tr></thead>
              <tbody>{rel.linhas.map((l) => <tr key={l.chave}><td>{rot(l.chave)}</td><td className="num">{eur(l.receitas)}</td><td className="num">{eur(l.despesas)}</td><td className="num">{eur(r2(l.receitas - l.despesas))}</td><td className="num">{l.n}</td></tr>)}
                {!rel.linhas.length && <tr><td colSpan={5} className="muted">Sem movimentos validados neste ano.</td></tr>}</tbody>
              {rel.linhas.length > 0 && <tfoot><tr><td>Total</td><td className="num">{eur(r2(rel.linhas.reduce((s0, l) => s0 + l.receitas, 0)))}</td><td className="num">{eur(r2(rel.linhas.reduce((s0, l) => s0 + l.despesas, 0)))}</td><td className="num">{eur(r2(rel.linhas.reduce((s0, l) => s0 + l.receitas - l.despesas, 0)))}</td><td /></tr></tfoot>}
            </table></div>
            <p className="small muted">{`Fora dos resultados (financeiros e conciliados com o Jotform): ${eur(rel.foraDosResultados.valor)} em ${rel.foraDosResultados.n} movimentos. Por validar: ${rel.porValidar} movimentos.`}</p>
          </div>
        );
      })()}
      {vista === 'mes' && <>
      {(() => {
        const c = controloMes(movs);
        const nomeMes = `${MESES[mes - 1].charAt(0).toUpperCase()}${MESES[mes - 1].slice(1)} ${ano}`;
        const card = (t: string, v: number, sub: string, preta = false) => <div className={'kpi' + (preta ? ' kpi-total' : '')}><h3>{t}</h3><div className="valor">{eur(v)}</div><div className="sub">{sub}</div></div>;
        return <>
          <div className="cards">
            {card('Movimentado no mês', c.total, `${movs.length} movimentos dos bancos visíveis`, true)}
            {card('Contabilizado', c.contabilizado, 'Conta nos resultados')}
            {card('Conciliado com o Jotform', c.conciliado, 'Contado pelo Jotform')}
            {card('Financeiro', c.financeiro, 'Depósitos, transferências internas…')}
            {card('Por resolver', r2(c.rever + c.proposto + c.porClassificar), `Rever ${eur(c.rever)} · propostos ${eur(c.proposto)} · por classificar ${eur(c.porClassificar)}`)}
          </div>
          <div className={c.fechado ? 'nota' : 'aviso'}>{c.fechado ? `${nomeMes} reconciliado: todos os movimentos estão contabilizados, conciliados ou são financeiros.` : movs.length ? `${nomeMes} por reconciliar: ${eur(r2(c.rever + c.proposto + c.porClassificar))} ainda por resolver.` : `Sem extratos de ${nomeMes}. Importe-os em Bancos.`}</div>
        </>;
      })()}

      <div className="acoes">
        <label className="campo">Mostrar
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
            <option value="todos">{`Todos os movimentos (${movs.length})`}</option>
            <option value="por-classificar">{`Por classificar (${contagem('por-classificar')})`}</option>
            <option value="proposto">{`Propostos (${contagem('proposto')})`}</option>
            <option value="rever">{`Para rever (${contagem('rever')})`}</option>
            <option value="validado">{`Validados (${contagem('validado')})`}</option>
            <option value="conciliados">Conciliados com o Jotform</option>
            <option value="bolsa">Comunidade Geral</option>
          </select>
        </label>
        <label className="campo">Descrição contém
          <input type="search" value={texto} placeholder="Ex.: EDP, MB WAY, R2026" onChange={(e) => setTexto(e.target.value)} />
        </label>
        <button className="sec" style={{ alignSelf: 'flex-end' }} disabled={!movs.length || !(cats.dados ?? []).some((c) => c.codigo)} onClick={() => void propor()} title="Conciliação com o Jotform, vencimentos previstos, memória, regras e transferências para a Geral">Propor classificação</button>
        <button className="sec" style={{ alignSelf: 'flex-end' }} disabled={!contagem('proposto')} onClick={aceitar} title="Valida as propostas completas (com categoria e comunidade)">Aceitar propostas</button>
      </div>
      {!(cats.dados ?? []).some((c) => c.codigo) && <div className="aviso">O plano financeiro ainda não está carregado (Configuração → Carregar plano financeiro).</div>}
      <div className="tabela sec">
        <table className="tabela-bancos">
          <thead><tr><th>Banco</th><th>Data</th><th>Descrição</th><th className="num">Entrada</th><th className="num">Saída</th><th>Estado</th><th>Categoria</th><th>Comunidade</th><th /></tr></thead>
          <tbody>
            {mostrar.slice(0, 600).map((m) => (
              <tr key={`${m.contaId}-${m.id}`}>
                <td><LogoBanco banco={bancoDe.get(m.contaId) ?? null} /></td>
                <td>{dataPt(m.data)}</td>
                <td className="small">{m.descricao}{m.estorno && <> <span className="etiqueta">Estorno</span></>}{m.nota && <div className={estadoDe(m) === 'rever' ? '' : 'muted'}>{m.nota}</div>}</td>
                <td className="num">{m.valor > 0 ? eur(m.valor) : ''}</td>
                <td className="num">{m.valor < 0 ? eur(-m.valor) : ''}</td>
                <td><span className={'etiqueta' + (estadoDe(m) === 'validado' ? ' preta' : '')}>{ESTADO[estadoDe(m)]}</span>{m.conciliadoCom && <div className="small muted">Conciliado</div>}</td>
                <td>
                  {itemizado(m) ? <button className="link small" onClick={() => setDetalhe(m)}>{`Itemizado (${m.partes!.length} linhas)`}</button> :
                  <select value={m.categoria ?? ''} disabled={!!m.conciliadoCom} onChange={(e) => alterar(m.loteId, m.id, { categoria: e.target.value || undefined, estado: 'proposto', contabilizar: false })}>
                    <option value="">—</option>
                    {(cats.dados ?? []).filter((c) => (c.ativo !== false || c.nome === m.categoria) && (c.tipo === 'financeiro' || (m.valor > 0 ? c.tipo === 'entrada' : c.tipo === 'saida'))).map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                  </select>}
                </td>
                <td>
                  {m.partes?.length ? <span className="small">{`Repartido (${m.partes.length})`}</span> : (
                    <select value={m.comunidadeId ?? ''} disabled={!!m.conciliadoCom} onChange={(e) => alterar(m.loteId, m.id, { comunidadeId: e.target.value || undefined, estado: 'proposto', contabilizar: false })}>
                      <option value="">—</option>
                      {(coms.dados ?? []).filter((c) => c.ativo !== false || c.id === m.comunidadeId).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>)}
                </td>
                <td><button className="link" onClick={() => setDetalhe(m)}>{m.conciliadoCom ? 'Detalhe' : 'Detalhe ou dividir'}</button></td>
              </tr>
            ))}
            {!mostrar.length && <tr><td colSpan={9} className="muted">{lotesMes.length ? 'Sem movimentos neste filtro ou nos bancos visíveis.' : `Sem extratos de ${MESES[mes - 1]} ${ano}. Importe-os em Bancos.`}</td></tr>}
          </tbody>
          {mostrar.length > 0 && <tfoot><tr><td colSpan={3}>Total ({mostrar.length} movimentos)</td>
            <td className="num">{eur(r2(mostrar.filter((m) => m.valor > 0).reduce((s, m) => s + m.valor, 0)))}</td>
            <td className="num">{eur(r2(mostrar.filter((m) => m.valor < 0).reduce((s, m) => s - m.valor, 0)))}</td><td colSpan={4} /></tr></tfoot>}
        </table>
      </div>

      </>}

      {vista === 'mes' && jot.dados && (() => {
        // Contribuir e reembolsos do Jotform são definitivos; o extrato só confirma (decisão do CAF, 23/11/2026).
        const bancoAno = (banco.dados ?? []).map((l) => alterados[l.id] ?? l).flatMap((l) => l.registos);
        const c = consolidacaoMes(ano, mes, { ...jot.dados, banco: bancoAno });
        const nomeCom = (id: string) => (coms.dados ?? []).find((x) => x.id === id)?.nome ?? id;
        const estado = (ok: boolean) => <span className={ok ? 'etiqueta' : 'etiqueta neg'}>{ok ? 'Confere' : 'Por confirmar'}</span>;
        return (
          <div className="sec card">
            <h2>{`Consolidação Jotform e extratos · ${MESES[mes - 1]} ${ano}`}</h2>
            <p className="muted small">O Contribuir e os reembolsos do Jotform são definitivos e já contam nos resultados; o extrato confirma. Os depósitos do Jotform confirmam-se com o banco, e os depósitos que só estão no banco ficam para escolher a comunidade (ou registar no Jotform).</p>
            <div className="tabela"><table>
              <thead><tr><th>Origem</th><th className="num">Registos</th><th className="num">Jotform (€)</th><th className="num">Banco (€)</th><th>Estado</th></tr></thead>
              <tbody>
                <tr><td>Contribuir (líquido) ↔ lotes IFTHENPAY</td><td className="num">{c.contribuir.n}</td><td className="num">{eur(c.contribuir.liquido)}</td><td className="num">{eur(c.contribuir.ifthenpay)}</td>
                  <td>{estado(Math.abs(c.contribuir.diferenca) < 0.005)}{Math.abs(c.contribuir.diferenca) >= 0.005 && <span className="small"> diferença {eur(c.contribuir.diferenca)} (lotes de fim de mês podem cair no mês seguinte)</span>}</td></tr>
                <tr><td>Reembolsos ↔ saídas CGD/Santander</td><td className="num">{`${c.reembolsos.confirmados}/${c.reembolsos.n}`}</td><td className="num">{eur(c.reembolsos.valor)}</td><td className="num">{eur(r2(c.reembolsos.valor - c.reembolsos.porConfirmar.reduce((t, x) => t + x.valor, 0)))}</td>
                  <td>{estado(!c.reembolsos.porConfirmar.length)}{c.reembolsos.porConfirmar.length > 0 && <span className="small"> {c.reembolsos.porConfirmar.length} sem saída no banco</span>}</td></tr>
                <tr><td>Depósitos ↔ banco</td><td className="num">{`${c.depositos.confirmados}/${c.depositos.n}`}</td><td className="num">{eur(c.depositos.valor)}</td><td className="num">{eur(r2(c.depositos.valor - c.depositos.semExtrato.reduce((t, x) => t + x.valor, 0)))}</td>
                  <td>{estado(!c.depositos.semExtrato.length && !c.depositos.bancoSemJotform.length)}{c.depositos.bancoSemJotform.length > 0 && <span className="small"> {c.depositos.bancoSemJotform.length} no banco sem registo no Jotform</span>}</td></tr>
              </tbody>
            </table></div>
            {(c.reembolsos.porConfirmar.length > 0 || c.depositos.semExtrato.length > 0 || c.depositos.bancoSemJotform.length > 0) && (
              <details style={{ marginTop: 10 }}>
                <summary>Ver os registos por confirmar</summary>
                <div className="tabela" style={{ marginTop: 8 }}><table>
                  <thead><tr><th>Tipo</th><th>Data</th><th>Referência</th><th>Comunidade</th><th className="num">Valor (€)</th></tr></thead>
                  <tbody>
                    {c.reembolsos.porConfirmar.map((x) => <tr key={`r${x.id}`}><td>Reembolso sem saída no banco</td><td>{dataPT(x.data)}</td><td>{x.codigo ?? x.descricao ?? '—'}</td><td>{nomeCom(x.comunidadeId)}</td><td className="num">{eur(x.valor)}</td></tr>)}
                    {c.depositos.semExtrato.map((x) => <tr key={`d${x.id}`}><td>Depósito do Jotform sem movimento no banco</td><td>{dataPT(x.data)}</td><td>{x.descricao ?? '—'}</td><td>{nomeCom(x.comunidadeId)}</td><td className="num">{eur(x.valor)}</td></tr>)}
                    {c.depositos.bancoSemJotform.map((x) => <tr key={`b${x.id}`}><td>Depósito no banco sem registo no Jotform</td><td>{dataPT(x.data)}</td><td>{x.descricao}</td><td>{x.comunidadeId ? nomeCom(x.comunidadeId) : '— (escolher)'}</td><td className="num">{eur(x.valor)}</td></tr>)}
                  </tbody>
                </table></div>
              </details>
            )}
          </div>
        );
      })()}

      {vista === 'mes' && (() => {
        const dist = relatorioExtratos(movs, cats.dados ?? [], 'comunidade', mes, mes);
        const nomeCom = (id: string) => (coms.dados ?? []).find((c) => c.id === id)?.nome ?? id;
        return (
          <div className="sec">
            <h2>{`Distribuição de ${MESES[mes - 1]} por comunidade`}</h2>
            <p className="muted">Entradas e despesas validadas que contam nos resultados (com as partes dos movimentos repartidos). A comunidade Geral é distribuída depois pela assistência.</p>
            <div className="tabela"><table>
              <thead><tr><th>Comunidade</th><th className="num">Entradas</th><th className="num">Despesas</th><th className="num">Saldo</th><th className="num">Movimentos</th></tr></thead>
              <tbody>{dist.linhas.map((l) => <tr key={l.chave}><td>{nomeCom(l.chave)}</td><td className="num">{eur(l.receitas)}</td><td className="num">{eur(l.despesas)}</td><td className="num">{eur(r2(l.receitas - l.despesas))}</td><td className="num">{l.n}</td></tr>)}
                {!dist.linhas.length && <tr><td colSpan={5} className="muted">Ainda sem movimentos validados neste mês.</td></tr>}</tbody>
            </table></div>
          </div>
        );
      })()}

      <div className="sec">
        <h2>Distribuição da bolsa geral (pré-visualização)</h2>
        <p className="muted">Regra: cada mês, a bolsa geral é distribuída pela percentagem da média de assistência de adultos de cada comunidade nos últimos 12 meses.</p>
        {!distribuicao.length && <p className="muted">Sem ofertas na bolsa geral neste ano.</p>}
        {distribuicao.filter((d) => vista !== 'mes' || d.mes === mes - 1).map((d) => (
          <div key={d.mes} className="card" style={{ marginBottom: 10 }}>
            <b>{MESES[d.mes]}: {eur(d.total)}</b>
            {d.semAssistencia ? <p className="muted">Sem registos de assistência nos últimos 12 meses: fica por distribuir.</p> : (
              <table style={{ marginTop: 6 }}><thead><tr><th>Comunidade</th><th className="num">Média de adultos (12 meses)</th><th className="num">%</th><th className="num">Quota</th></tr></thead>
                <tbody>{d.linhas.map((x) => <tr key={x.nome}><td>{x.nome}</td><td className="num">{x.media}</td><td className="num">{(x.pct * 100).toFixed(1).replace('.', ',')}%</td><td className="num">{eur(x.valor)}</td></tr>)}</tbody></table>
            )}
          </div>
        ))}
      </div>
      {detalhe && <DetalheMovimento m={detalhe} categorias={cats.dados ?? []} dimensoes={dims.dados ?? []} comunidades={coms.dados ?? []} custosFixos={cfixos.dados ?? []}
        movsMes={movs} regras={regras.dados ?? []} jotform={jot.dados ?? null}
        usados={new Set((banco.dados ?? []).flatMap((l) => (alterados[l.id] ?? l).registos).filter((x) => x.id !== detalhe.id && x.conciliadoCom?.startsWith('despesas:')).flatMap((x) => x.conciliadoCom!.slice(9).split(',')))} email={acesso!.email} onRegra={() => void regras.recarregar()}
        onFechar={() => setDetalhe(null)} onAplicar={(patch) => { alterar(detalhe.loteId, detalhe.id, patch); setDetalhe(null); }} />}
    </>
  );
}

/** Classificação completa de um movimento: dimensões do plano, documento e repartição por comunidades. */
/** Movimento dividido em linhas com categorias diferentes. */
const itemizado = (m: MovBanco) => !!m.partes?.length && new Set(m.partes.map((p) => p.categoria ?? m.categoria)).size > 1;

function DetalheMovimento({ m, categorias, dimensoes, comunidades, custosFixos, movsMes, regras, jotform, usados, email, onRegra, onFechar, onAplicar }: {
  m: MovBanco; categorias: Categoria[]; dimensoes: Dimensao[]; comunidades: Comunidade[]; custosFixos: import('../lib/types').CustoFixo[];
  movsMes: MovBanco[]; regras: RegraBanco[]; email: string; onRegra: () => void;
  jotform: { despesas: import('../lib/types').Lote[]; depositos: import('../lib/types').Lote[]; contribuir: import('../lib/types').Lote[] } | null; usados: Set<string>;
  onFechar: () => void; onAplicar: (patch: Partial<MovBanco>) => void;
}) {
  const [v, setV] = useState<MovBanco>(m);
  const [repartir, setRepartir] = useState(!!m.partes?.length);
  const dims = (t: Dimensao['tipo']) => dimensoes.filter((d) => d.tipo === t && d.ativo !== false);
  const cat = categorias.find((c) => c.nome === v.categoria);
  const partes = v.partes ?? [];
  const somaPartes = r2(partes.reduce((s, p) => s + p.valor, 0));
  const ativas = comunidades.filter((c) => !c.especial && c.ativo !== false);
  // As linhas em percentagem recalculam-se sempre (percentagem do que sobra depois das linhas de valor fixo).
  const setPartes = (ps: ParteMov[]) => {
    if (!ps.some((x) => x.pct != null)) { setV({ ...v, partes: ps }); return; }
    const vals = resolverPartes(m.valor, ps.map((x) => (x.pct != null ? { pct: x.pct } : { valor: x.valor })));
    setV({ ...v, partes: ps.map((x, i) => (x.pct != null ? { ...x, valor: vals[i] } : x)) });
  };
  const iguais = () => { const n = ativas.length; const base = r2(Math.trunc((m.valor / n) * 100) / 100); setPartes(ativas.map((c, i) => ({ comunidadeId: c.id, valor: i === n - 1 ? r2(m.valor - base * (n - 1)) : base }))); };
  const previsao = () => { if (cat?.codigo) setPartes(repartirPorPrevisao(m.valor, custosFixos, cat.codigo, m.data.slice(0, 7))); };
  const ok = !repartir || (partes.length > 0 && Math.abs(somaPartes - m.valor) < 0.005 && partes.every((p) => p.comunidadeId && (p.categoria || v.categoria)));
  // Categoria do movimento itemizado: a da linha maior (as linhas guardam a sua).
  const catPrincipal = () => v.categoria ?? [...partes].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor))[0]?.categoria;
  const final = (): Partial<MovBanco> => (repartir
    ? { ...v, comunidadeId: undefined, categoria: catPrincipal(), partes: partes.map((p) => ({ ...p, categoria: p.categoria || undefined, descricao: p.descricao?.trim() || undefined, contabilizar: undefined })) }
    : { ...v, partes: undefined });
  const opcoesCat = categorias.filter((c) => c.ativo !== false && (c.tipo === 'financeiro' || (m.valor > 0 ? c.tipo === 'entrada' : c.tipo === 'saida')));
  const falta = r2(m.valor - somaPartes);
  const mudar = (i: number, patch: Partial<ParteMov>) => setPartes(partes.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  // Guardar regra: o texto do banco passa a propor esta classificação nos próximos movimentos.
  const [regraAberta, setRegraAberta] = useState(false);
  const [padrao, setPadrao] = useState(() => sugerirPadrao(m.descricao));
  const [comComunidade, setComComunidade] = useState(!!m.comunidadeId);
  const [msgRegra, setMsgRegra] = useState<string | null>(null);
  const existente = regras.find((x) => x.ativo !== false && padrao.trim() && temPalavra(m.descricao, x.padrao) && x.padrao.trim().toLowerCase() === padrao.trim().toLowerCase());
  const comTexto = padrao.trim() ? movsMes.filter((x) => Math.sign(x.valor) === Math.sign(m.valor) && temPalavra(x.descricao, padrao.trim())).length : 0;
  async function guardarRegra() {
    if (!padrao.trim() || !v.categoria) return;
    setMsgRegra(null);
    try {
      const id = existente?.id ?? (padrao.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `regra-${Date.now()}`);
      const partesRegra = repartir && partes.length > 1 ? partes.map((x) => ({
        comunidadeId: x.comunidadeId, ...(x.categoria ? { categoria: x.categoria } : {}), ...(x.centroCusto ? { centroCusto: x.centroCusto } : {}), ...(x.descricao?.trim() ? { descricao: x.descricao.trim() } : {}),
        ...(x.pct != null ? { pct: x.pct } : { valor: Math.abs(x.valor) }),
      })) : undefined;
      const nova: RegraBanco = { id, padrao: padrao.trim(), categoria: v.categoria, fornecedor: v.fornecedor, centroCusto: v.centroCusto, comunidadeId: comComunidade && !repartir ? v.comunidadeId : undefined, ativo: true, ...(partesRegra ? { partes: partesRegra } : {}) };
      await gravar('regras_banco', nova);
      await auditar(email, 'regra dos extratos', `${existente ? 'Atualizada' : 'Criada'} na reconciliação: ${nova.padrao} → ${nova.categoria}`);
      onRegra();
      setMsgRegra(`Regra "${nova.padrao}" ${existente ? 'atualizada' : 'guardada'}. Use Propor classificação para a aplicar aos outros movimentos por classificar.`);
    } catch (e) { setMsgRegra(mensagemErro(e)); }
  }
  return (
    <Modal titulo="Classificar movimento" onFechar={onFechar}>
      <p className="small">{`${m.data.split('-').reverse().join('/')} · ${m.descricao} · `}<b>{eur(m.valor)}</b>{m.conciliadoCom ? ` · Conciliado com ${m.conciliadoCom}` : ''}</p>
      {m.nota && <div className={m.estado === 'rever' ? 'aviso' : 'nota'}>{m.nota}</div>}
      {m.conciliadoCom && <RegistosJotformConciliados m={m} jotform={jotform} comunidades={comunidades} />}
      {!m.conciliadoCom && m.valor < 0 && <CruzarReembolsos m={m} jotform={jotform} usados={usados} comunidades={comunidades}
        onConciliar={(regs) => {
          const soma = r2(regs.reduce((s0, x) => s0 + x.valor, 0));
          const dif = r2(soma - Math.abs(m.valor));
          if (Math.abs(dif) >= 0.005 && !confirm(`A soma dos reembolsos escolhidos (${eur(soma)}) é diferente do movimento (${eur(Math.abs(m.valor))}). Conciliar mesmo assim?`)) return;
          const coms = [...new Set(regs.map((x) => x.comunidadeId))];
          const cat = categorias.find((c) => c.codigo === 'F3.02')?.nome;
          onAplicar(validar({ ...m, conciliadoCom: `despesas:${regs.map((x) => x.id).join(',')}`, categoria: cat ?? m.categoria, comunidadeId: coms.length === 1 ? coms[0] : undefined, partes: undefined,
            nota: `Conciliado à mão com o Jotform: ${regs.map((x) => x.codigo ?? x.id).join(', ')}${Math.abs(dif) >= 0.005 ? ` (diferença ${eur(dif)})` : ''} (contado pelo Jotform)` } as MovBanco, categorias));
        }} />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        <label className="campo">Categoria
          <select value={v.categoria ?? ''} onChange={(e) => setV({ ...v, categoria: e.target.value || undefined, contaAnalitica: undefined })}>
            <option value="">—</option>
            {categorias.filter((c) => (c.ativo !== false || c.nome === v.categoria) && (c.tipo === 'financeiro' || (m.valor > 0 ? c.tipo === 'entrada' : c.tipo === 'saida'))).map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
          </select></label>
        <label className="campo">Conta analítica
          <select value={v.contaAnalitica ?? ''} onChange={(e) => setV({ ...v, contaAnalitica: e.target.value || undefined })}>
            <option value="">—</option>
            {dims('conta').filter((d) => !cat?.codigo || !d.categoria || d.categoria === cat.codigo).map((d) => <option key={d.id} value={d.nome}>{d.nome}</option>)}
          </select></label>
        <label className="campo">Fornecedor
          <input value={v.fornecedor ?? ''} list="forn-mov" onChange={(e) => setV({ ...v, fornecedor: e.target.value || undefined })} />
          <datalist id="forn-mov">{dims('fornecedor').map((d) => <option key={d.id} value={d.nome} />)}</datalist></label>
        <label className="campo">Centro de custo
          <select value={v.centroCusto ?? ''} onChange={(e) => setV({ ...v, centroCusto: e.target.value || undefined })}>
            <option value="">—</option>
            {dims('centro').map((d) => <option key={d.id} value={d.codigo}>{`${d.codigo} ${d.nome}`}</option>)}
          </select></label>
        <label className="campo">Projeto ou evento
          <select value={v.projeto ?? ''} onChange={(e) => setV({ ...v, projeto: e.target.value || undefined })}>
            <option value="">—</option>
            {dims('projeto').map((d) => <option key={d.id} value={d.nome}>{d.nome}</option>)}
          </select></label>
        <label className="campo">Documento<input value={v.documento ?? ''} placeholder="FT 123" onChange={(e) => setV({ ...v, documento: e.target.value || undefined })} /></label>
        {!repartir && <label className="campo">Comunidade
          <select value={v.comunidadeId ?? ''} onChange={(e) => setV({ ...v, comunidadeId: e.target.value || undefined })}>
            <option value="">—</option>
            {comunidades.filter((c) => c.ativo !== false || c.id === v.comunidadeId).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select></label>}
      </div>
      <label className="opcao"><input type="checkbox" checked={repartir} onChange={(e) => {
        setRepartir(e.target.checked);
        if (e.target.checked && !partes.length) setPartes([{ comunidadeId: v.comunidadeId ?? '', valor: m.valor, categoria: v.categoria }]);
      }} /> Dividir em várias linhas (itemização: categorias, comunidades e valores diferentes)</label>
      {repartir && <div className="card" style={{ marginTop: 6 }}>
        <p className="small muted" style={{ marginTop: 0 }}>Cada linha conta na sua categoria e comunidade. A soma das linhas tem de dar o valor do movimento. Linhas sem categoria usam a do movimento; linhas financeiras não contam nos resultados.</p>
        <div className="acoes" style={{ margin: '0 0 8px' }}>
          <button className="sec" type="button" onClick={() => setPartes([...partes, { comunidadeId: partes[partes.length - 1]?.comunidadeId ?? '', valor: falta, categoria: v.categoria }])}>Acrescentar linha{Math.abs(falta) >= 0.005 ? ` (${eur(falta)})` : ''}</button>
          <button className="sec" type="button" disabled={!cat?.codigo} onClick={previsao} title="Uma linha por comunidade, na proporção dos custos fixos desta categoria previstos no mês">Repartir pela previsão dos custos fixos</button>
          <button className="sec" type="button" onClick={iguais}>Repartir em partes iguais</button>
        </div>
        <div className="tabela"><table>
          <thead><tr><th>Categoria</th><th>Comunidade</th><th>Descrição</th><th>Tipo</th><th className="num">Valor fixo (€) ou %</th><th className="num">Valor (€)</th><th /></tr></thead>
          <tbody>{partes.map((p, i) => (
            <tr key={i}>
              <td><select value={p.categoria ?? ''} onChange={(e) => mudar(i, { categoria: e.target.value || undefined })} aria-label="Categoria da linha">
                <option value="">{v.categoria ? `Igual ao movimento (${v.categoria})` : '—'}</option>{opcoesCat.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
              </select></td>
              <td><select value={p.comunidadeId} onChange={(e) => mudar(i, { comunidadeId: e.target.value })} aria-label="Comunidade da linha">
                <option value="">—</option>{comunidades.filter((c) => c.ativo !== false).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select></td>
              <td><input value={p.descricao ?? ''} placeholder="Ex.: lanche do GC" onChange={(e) => mudar(i, { descricao: e.target.value })} aria-label="Descrição da linha" /></td>
              <td><select value={p.pct != null ? 'pct' : 'valor'} aria-label="Tipo da linha" onChange={(e) => mudar(i, e.target.value === 'pct' ? { pct: Math.round((Math.abs(p.valor) / Math.abs(m.valor || 1)) * 10000) / 100 } : { pct: undefined })}>
                <option value="valor">Valor fixo</option><option value="pct">Percentagem</option>
              </select></td>
              <td className="num">{p.pct != null
                ? <input type="number" step="0.01" min={0} max={100} value={p.pct} style={{ width: 90 }} aria-label="Percentagem da linha" onChange={(e) => mudar(i, { pct: Number(e.target.value) })} />
                : <input type="number" step="0.01" value={p.valor} style={{ width: 110 }} aria-label="Valor da linha" onChange={(e) => mudar(i, { valor: Number(e.target.value) })} />}</td>
              <td className="num">{eur(p.valor)}</td>
              <td><button className="link" type="button" onClick={() => setPartes(partes.filter((_, k) => k !== i))}>Remover</button></td>
            </tr>
          ))}</tbody>
        </table></div>
        <p className="small">{`Soma das linhas: ${eur(somaPartes)} · movimento: ${eur(m.valor)}`}{Math.abs(falta) >= 0.005 && <b>{` · falta repartir ${eur(falta)}`}</b>}</p>
        <p className="small muted">Os valores fixos têm o sinal do movimento (negativos nas saídas). As percentagens aplicam-se ao que sobra depois das linhas de valor fixo; o arredondamento ao cêntimo vai para a linha de maior percentagem.</p>
      </div>}
      {!m.conciliadoCom && <>
        <label className="opcao" style={{ marginTop: 8 }}><input type="checkbox" checked={regraAberta} onChange={(e) => setRegraAberta(e.target.checked)} /> Guardar como regra para os próximos movimentos</label>
        {regraAberta && <div className="card" style={{ marginTop: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, alignItems: 'end' }}>
            <label className="campo">Texto no descritivo do banco<input value={padrao} onChange={(e) => setPadrao(e.target.value)} /></label>
            {!repartir && v.comunidadeId && <label className="opcao"><input type="checkbox" checked={comComunidade} onChange={(e) => setComComunidade(e.target.checked)} /> Incluir a comunidade ({comunidades.find((c) => c.id === v.comunidadeId)?.nome})</label>}
          </div>
          <p className="small">{v.categoria
            ? <>Quando o descritivo tiver "{padrao.trim() || '…'}", propõe <b>{v.categoria}</b>{v.fornecedor ? `, fornecedor ${v.fornecedor}` : ''}{v.centroCusto ? `, ${v.centroCusto}` : ''}{comComunidade && !repartir && v.comunidadeId ? `, comunidade ${comunidades.find((c) => c.id === v.comunidadeId)?.nome}` : ''}.
              {padrao.trim() && !temPalavra(m.descricao, padrao.trim()) ? ' Atenção: este movimento não tem esse texto.' : ` Neste mês: ${comTexto} movimento${comTexto === 1 ? '' : 's'} com este texto.`}
              {repartir && partes.length > 1 && ` Guarda também a divisão em ${partes.length} linhas (${partes.map((x) => (x.pct != null ? `${String(x.pct).replace('.', ',')}%` : eur(Math.abs(x.valor)))).join(' + ')}).`}
              {existente && ' Já existe uma regra com este texto: vai ser atualizada.'}</>
            : 'Escolha primeiro a categoria.'}</p>
          {msgRegra && <div className="nota">{msgRegra}</div>}
          <button className="sec" type="button" disabled={!padrao.trim() || !v.categoria} onClick={() => void guardarRegra()}>{existente ? 'Atualizar regra' : 'Guardar regra'}</button>
          <p className="small muted">As regras ficam em Configuração → Regras dos extratos. As transferências recebidas (TFI, MB WAY, Trf.Imed), os depósitos, os reembolsos e os vencimentos previstos vêm antes das regras.</p>
        </div>}
      </>}
      <div className="acoes" style={{ marginTop: 14 }}>
        <button disabled={!ok || (!repartir && (!v.categoria || (!v.comunidadeId && !v.conciliadoCom)))} onClick={() => onAplicar(validar({ ...m, ...final(), nota: v.estado === 'rever' ? undefined : v.nota } as MovBanco, categorias))}>Validar</button>
        <button className="sec" disabled={!ok} onClick={() => onAplicar({ ...final(), estado: 'proposto', contabilizar: false })}>Guardar como proposta</button>
        <button className="sec" onClick={() => onAplicar({ estado: 'rever', contabilizar: false, nota: v.nota?.startsWith('REVER') ? v.nota : 'REVER - marcado à mão' })}>Para rever</button>
        <button className="sec" onClick={() => onAplicar({ estado: 'por-classificar', contabilizar: false, categoria: undefined, comunidadeId: undefined, partes: undefined, conciliadoCom: null, centroCusto: undefined, fornecedor: undefined, projeto: undefined, contaAnalitica: undefined, nota: undefined })}>Limpar</button>
      </div>
    </Modal>
  );
}

const ORIGEM_JOT: Record<RegistoJotform['origem'], string> = { despesas: 'Reembolso', depositos: 'Depósito', contribuir: 'Contribuir' };

/** Os registos do Jotform com que o movimento está conciliado. */
function RegistosJotformConciliados({ m, jotform, comunidades }: { m: MovBanco; jotform: Parameters<typeof registosConciliados>[1] | null; comunidades: Comunidade[] }) {
  const [aberto, setAberto] = useState(false);
  const nome = (id: string) => comunidades.find((c) => c.id === id)?.nome ?? id;
  const regs = jotform ? registosConciliados(m, jotform) : [];
  const soma = r2(regs.reduce((s0, x) => s0 + (x.liquido ?? x.valor), 0));
  return (
    <div className="card" style={{ margin: '8px 0', padding: 10 }}>
      <button className="link" onClick={() => setAberto(!aberto)}>{aberto ? '▾' : '▸'} Ver os registos do Jotform conciliados ({m.conciliadoCom})</button>
      {aberto && (!jotform ? <p className="small muted">A carregar…</p> : !regs.length ? <p className="small muted">Não encontrei os registos no Jotform sincronizado (podem ter sido apagados ou ser de outro ano).</p> : <>
        <div className="tabela" style={{ maxHeight: 240, marginTop: 6 }}><table>
          <thead><tr><th>Origem</th><th>Data</th><th>Código</th><th>Comunidade</th><th>Categoria</th><th>Descrição</th><th className="num">Valor</th>{regs.some((x) => x.liquido != null) && <th className="num">Líquido</th>}</tr></thead>
          <tbody>{regs.map((x) => (
            <tr key={`${x.origem}-${x.id}`}><td>{ORIGEM_JOT[x.origem]}</td><td>{dataPt(x.data)}</td><td>{x.codigo ?? '—'}</td><td>{nome(x.comunidadeId)}</td><td className="small">{x.categoria ?? '—'}</td><td className="small">{x.descricao ?? '—'}</td>
              <td className="num">{eur(x.valor)}</td>{regs.some((y) => y.liquido != null) && <td className="num">{x.liquido != null ? eur(x.liquido) : '—'}</td>}</tr>
          ))}</tbody>
        </table></div>
        <p className="small">{`${regs.length} ${regs.length === 1 ? 'registo' : 'registos'} · soma ${eur(soma)} · movimento ${eur(Math.abs(m.valor))}`}{Math.abs(soma - Math.abs(m.valor)) >= 0.005 ? ` · diferença ${eur(r2(Math.abs(m.valor) - soma))}` : ' · confere'}</p>
      </>)}
    </div>
  );
}

/** Débito do banco: procurar e escolher reembolsos do Jotform da mesma semana e com valor aproximado, e conciliar. */
function CruzarReembolsos({ m, jotform, usados, comunidades, onConciliar }: {
  m: MovBanco; jotform: { despesas: import('../lib/types').Lote[] } | null; usados: Set<string>; comunidades: Comunidade[]; onConciliar: (regs: RegistoJotform[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [largo, setLargo] = useState(false);
  const nome = (id: string) => comunidades.find((c) => c.id === id)?.nome ?? id;
  const cands = jotform ? candidatosReembolso(m, jotform.despesas, usados, largo ? 15 : 7, largo ? 1 : 0.1) : [];
  const escolhidos = cands.filter((x) => sel.includes(x.id));
  const soma = r2(escolhidos.reduce((s0, x) => s0 + x.valor, 0));
  return (
    <div className="card" style={{ margin: '8px 0', padding: 10 }}>
      <button className="link" onClick={() => setAberto(!aberto)}>{aberto ? '▾' : '▸'} Cruzar com os reembolsos do Jotform</button>
      {aberto && (!jotform ? <p className="small muted">A carregar…</p> : <>
        <p className="small muted" style={{ margin: '6px 0' }}>{largo ? 'Até 15 dias antes ou depois, qualquer valor.' : 'Reembolsos até 7 dias antes ou depois, com valor até 10% de diferença.'} Os já conciliados noutros movimentos não aparecem. <button className="link" onClick={() => setLargo(!largo)}>{largo ? 'Só a mesma semana e valor aproximado' : 'Alargar a pesquisa'}</button></p>
        {!cands.length ? <p className="small">Nenhum reembolso encontrado.</p> : (
          <div className="tabela" style={{ maxHeight: 260 }}><table>
            <thead><tr><th /><th>Data</th><th>Código</th><th>Comunidade</th><th>Categoria</th><th>Descrição</th><th className="num">Valor</th><th className="num">Diferença</th></tr></thead>
            <tbody>{cands.slice(0, 50).map((x) => (
              <tr key={x.id}>
                <td><input type="checkbox" aria-label={`Escolher ${x.codigo ?? x.id}`} checked={sel.includes(x.id)} onChange={() => setSel(sel.includes(x.id) ? sel.filter((y) => y !== x.id) : [...sel, x.id])} /></td>
                <td>{dataPt(x.data)}</td><td>{x.codigo ?? '—'}</td><td>{nome(x.comunidadeId)}</td><td className="small">{x.categoria ?? '—'}</td><td className="small">{x.descricao ?? '—'}</td>
                <td className="num">{eur(x.valor)}</td><td className="num">{x.diferenca ? eur(x.diferenca) : 'igual'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {!!escolhidos.length && <p className="small">{`${escolhidos.length} escolhido(s) · soma ${eur(soma)} · movimento ${eur(Math.abs(m.valor))}`}{Math.abs(soma - Math.abs(m.valor)) >= 0.005 ? <b>{` · diferença ${eur(r2(soma - Math.abs(m.valor)))}`}</b> : ' · confere'}</p>}
        <button className="sec" disabled={!escolhidos.length} onClick={() => onConciliar(escolhidos)}>Conciliar com os escolhidos</button>
      </>)}
    </div>
  );
}
