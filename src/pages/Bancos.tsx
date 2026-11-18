import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { LogoBanco } from '../components/LogoBanco';
import SaldosBancos from './SaldosBancos';
import { useAuth } from '../auth/AuthProvider';
import { Estado, Modal, mensagemErro, useCarregar, useFiltros } from '../components/ui';
import { apagarBancoLote, auditar, gravarBancoLote, listarBanco, listarCategorias, listarComunidades, listarContas, listarCustosFixos, listarDimensoes, listarLotes, listarRegrasBanco } from '../lib/db';
import { REGRAS_INICIAIS, aceitarPropostas, proporClassificacao, relatorioExtratos, repartirPorPrevisao, validar, type DimensaoRelatorio } from '../lib/classificacaoBanco';
import { lerFicheiro } from '../lib/ficheiros';
import { NOME_BANCO, bancoDaConta, maioresMovimentos, detetarBanco, dividirPorMes, mapaDoBanco, mapearExtrato, resumoMes, sugerirMapaBanco, type Banco, type MapaBanco } from '../lib/banco';
import { eur, MESES, r2 } from '../lib/format';
import type { BancoLote, Categoria, Comunidade, Conta, Dimensao, EstadoMov, MovBanco, ParteMov } from '../lib/types';
import type { Linha } from '../lib/fontes';
import { comunidadeAtiva } from '../lib/resumos';

type Filtro = 'todos' | EstadoMov | 'bolsa' | 'conciliados';
const ESTADO: Record<EstadoMov, string> = { 'por-classificar': 'Por classificar', proposto: 'Proposto', validado: 'Validado', rever: 'Rever' };
/** Estado de um movimento (os antigos, sem estado, contam como validados se já estavam classificados). */
const estadoDe = (m: MovBanco): EstadoMov => m.estado ?? (m.contabilizar || m.conciliadoCom ? 'validado' : 'por-classificar');
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
  const dims = useCarregar(listarDimensoes, []);
  const regras = useCarregar(listarRegrasBanco, []);
  const cfixos = useCarregar(() => listarCustosFixos(acesso!), [acesso?.email]);
  const [detalhe, setDetalhe] = useState<MovVista | null>(null);
  const [relDim, setRelDim] = useState<DimensaoRelatorio>('rubrica');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [alterados, setAlterados] = useState<Record<string, BancoLote>>({});
  const [importar, setImportar] = useState(false);
  const [limpar, setLimpar] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocultas, setOcultas] = useState<string[]>([]);
  const [vista, setVista] = useState<'mes' | 'saldos' | 'relatorio'>('mes');
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
      : filtro === 'bolsa' ? m.comunidadeId === 'bolsa-geral'
        : filtro === 'conciliados' ? !!m.conciliadoCom
          : estadoDe(m) === filtro);
  const contagem = (e: EstadoMov) => movs.filter((m) => estadoDe(m) === e).length;
  // Totais recalculados só com os bancos visíveis.
  const resumos = visiveis.map((c) => ({ c, r: resumoMes(porConta.get(c.id) ?? []) }));
  const soma = (k: 'entradas' | 'saidas') => r2(resumos.reduce((s, x) => s + x.r[k], 0));
  const somaSaldo = (k: 'saldoInicial' | 'saldoFinal') => { const v = resumos.filter((x) => x.r[k] != null); return v.length ? r2(v.reduce((s, x) => s + (x.r[k] as number), 0)) : null; };

  function alterar(loteId: string, id: string, patch: Partial<MovBanco>) {
    const base = alterados[loteId] ?? banco.dados!.find((l) => l.id === loteId)!;
    setAlterados({ ...alterados, [loteId]: { ...base, registos: base.registos.map((m) => (m.id === id ? { ...m, ...patch } : m)) } });
  }
  /** Propõe a classificação dos movimentos do mês (bancos visíveis) com o plano financeiro. */
  async function propor() {
    setMsg('A preparar a proposta…');
    try {
      const [deps, desp] = await Promise.all([listarLotes(acesso!, 'depositos', ano), listarLotes(acesso!, 'despesas', ano)]);
      const ctx = {
        categorias: cats.dados ?? [], regras: regras.dados?.length ? regras.dados : REGRAS_INICIAIS, depositos: deps, despesas: desp,
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
        <button role="tab" aria-selected={vista === 'relatorio'} className={vista === 'relatorio' ? 'ativa' : ''} onClick={() => setVista('relatorio')}>Relatório {ano}</button>
      </div>
      <div className="barra-bancos">
        {vista === 'mes' ? <div className="mes-nav" role="group" aria-label="Mês do extrato">
          <button className="sec" aria-label="Mês anterior" disabled={mes <= 1} onClick={() => mudarMes(mes - 1)}><ChevronLeft size={16} aria-hidden /></button>
          <select value={mes} onChange={(e) => mudarMes(Number(e.target.value))} aria-label="Mês">
            {MESES.map((m, i) => <option key={m} value={i + 1}>{`${m.charAt(0).toUpperCase() + m.slice(1)} ${ano}${mesesComDados.includes(i + 1) ? '' : ' (sem extrato)'}`}</option>)}
          </select>
          <button className="sec" aria-label="Mês seguinte" disabled={mes >= 12} onClick={() => mudarMes(mes + 1)}><ChevronRight size={16} aria-hidden /></button>
        </div> : <span className="small muted">{vista === 'saldos' ? 'Clique num mês para ver os movimentos.' : 'Movimentos validados que contam nos resultados.'}</span>}
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
            <option value="todos">{`Todos os movimentos (${movs.length})`}</option>
            <option value="por-classificar">{`Por classificar (${contagem('por-classificar')})`}</option>
            <option value="proposto">{`Propostos (${contagem('proposto')})`}</option>
            <option value="rever">{`Para rever (${contagem('rever')})`}</option>
            <option value="validado">{`Validados (${contagem('validado')})`}</option>
            <option value="conciliados">Conciliados com o Jotform</option>
            <option value="bolsa">Comunidade Geral</option>
          </select>
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
                  <select value={m.categoria ?? ''} disabled={!!m.conciliadoCom} onChange={(e) => alterar(m.loteId, m.id, { categoria: e.target.value || undefined, estado: 'proposto', contabilizar: false })}>
                    <option value="">—</option>
                    {(cats.dados ?? []).filter((c) => (c.ativo !== false || c.nome === m.categoria) && (c.tipo === 'financeiro' || (m.valor > 0 ? c.tipo === 'entrada' : c.tipo === 'saida'))).map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                  </select>
                </td>
                <td>
                  {m.partes?.length ? <span className="small">{`Repartido (${m.partes.length})`}</span> : (
                    <select value={m.comunidadeId ?? ''} disabled={!!m.conciliadoCom} onChange={(e) => alterar(m.loteId, m.id, { comunidadeId: e.target.value || undefined, estado: 'proposto', contabilizar: false })}>
                      <option value="">—</option>
                      {(coms.dados ?? []).filter((c) => c.ativo !== false || c.id === m.comunidadeId).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>)}
                </td>
                <td><button className="link" onClick={() => setDetalhe(m)}>Detalhe</button></td>
              </tr>
            ))}
            {!mostrar.length && <tr><td colSpan={9} className="muted">{lotesMes.length ? 'Sem movimentos neste filtro ou nos bancos visíveis.' : `Sem extratos de ${MESES[mes - 1]} ${ano}. Use Importar extrato.`}</td></tr>}
          </tbody>
          {mostrar.length > 0 && <tfoot><tr><td colSpan={3}>Total ({mostrar.length} movimentos)</td>
            <td className="num">{eur(r2(mostrar.filter((m) => m.valor > 0).reduce((s, m) => s + m.valor, 0)))}</td>
            <td className="num">{eur(r2(mostrar.filter((m) => m.valor < 0).reduce((s, m) => s - m.valor, 0)))}</td><td colSpan={4} /></tr></tfoot>}
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
      {detalhe && <DetalheMovimento m={detalhe} categorias={cats.dados ?? []} dimensoes={dims.dados ?? []} comunidades={coms.dados ?? []} custosFixos={cfixos.dados ?? []}
        onFechar={() => setDetalhe(null)} onAplicar={(patch) => { alterar(detalhe.loteId, detalhe.id, patch); setDetalhe(null); }} />}
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
      const falhas: string[] = [];
      for (const l of previa.lotes) {
        try { await gravarBancoLote(l); } catch { falhas.push(periodoPt(l.periodo)); }
      }
      const conta = contas.find((c) => c.id === contaId)!;
      await auditar(acesso!.email, 'importar extrato', `${conta.nome} (${nome}): ${res.movimentos.length} movimentos em ${previa.lotes.length} meses${falhas.length ? `; não gravados (mês fechado?): ${falhas.join(', ')}` : ''}`);
      setMsg(`Gravados ${previa.lotes.length - falhas.length} meses de ${conta.nome}. Use Propor classificação em cada mês para conciliar com o Jotform e classificar.${falhas.length ? ` Não gravados (mês fechado ou sem permissão): ${falhas.join(', ')}.` : ''}`);
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


/** Classificação completa de um movimento: dimensões do plano, documento e repartição por comunidades. */
function DetalheMovimento({ m, categorias, dimensoes, comunidades, custosFixos, onFechar, onAplicar }: {
  m: MovBanco; categorias: Categoria[]; dimensoes: Dimensao[]; comunidades: Comunidade[]; custosFixos: import('../lib/types').CustoFixo[];
  onFechar: () => void; onAplicar: (patch: Partial<MovBanco>) => void;
}) {
  const [v, setV] = useState<MovBanco>(m);
  const [repartir, setRepartir] = useState(!!m.partes?.length);
  const dims = (t: Dimensao['tipo']) => dimensoes.filter((d) => d.tipo === t && d.ativo !== false);
  const cat = categorias.find((c) => c.nome === v.categoria);
  const partes = v.partes ?? [];
  const somaPartes = r2(partes.reduce((s, p) => s + p.valor, 0));
  const ativas = comunidades.filter((c) => !c.especial && c.ativo !== false);
  const setPartes = (ps: ParteMov[]) => setV({ ...v, partes: ps });
  const iguais = () => { const n = ativas.length; const base = r2(Math.trunc((m.valor / n) * 100) / 100); setPartes(ativas.map((c, i) => ({ comunidadeId: c.id, valor: i === n - 1 ? r2(m.valor - base * (n - 1)) : base }))); };
  const previsao = () => { if (cat?.codigo) setPartes(repartirPorPrevisao(m.valor, custosFixos, cat.codigo, m.data.slice(0, 7))); };
  const ok = !repartir || (partes.length > 0 && Math.abs(somaPartes - m.valor) < 0.005 && partes.every((p) => p.comunidadeId));
  const final = (): Partial<MovBanco> => (repartir ? { ...v, comunidadeId: undefined } : { ...v, partes: undefined });
  return (
    <Modal titulo="Classificar movimento" onFechar={onFechar}>
      <p className="small">{`${m.data.split('-').reverse().join('/')} · ${m.descricao} · `}<b>{eur(m.valor)}</b>{m.conciliadoCom ? ` · Conciliado com ${m.conciliadoCom}` : ''}</p>
      {m.nota && <div className={m.estado === 'rever' ? 'aviso' : 'nota'}>{m.nota}</div>}
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
      <label className="opcao"><input type="checkbox" checked={repartir} onChange={(e) => setRepartir(e.target.checked)} /> Repartir por várias comunidades</label>
      {repartir && <div className="card" style={{ marginTop: 6 }}>
        <div className="acoes" style={{ margin: '0 0 8px' }}>
          <button className="sec" type="button" disabled={!cat?.codigo} onClick={previsao} title="Na proporção dos custos fixos desta categoria previstos no mês">Pela previsão dos custos fixos</button>
          <button className="sec" type="button" onClick={iguais}>Partes iguais</button>
          <button className="sec" type="button" onClick={() => setPartes([...partes, { comunidadeId: '', valor: 0 }])}>Acrescentar parte</button>
        </div>
        {partes.map((p, i) => (
          <div key={i} className="linha" style={{ gap: 8, marginBottom: 6 }}>
            <select value={p.comunidadeId} onChange={(e) => setPartes(partes.map((x, k) => (k === i ? { ...x, comunidadeId: e.target.value } : x)))} aria-label="Comunidade da parte">
              <option value="">—</option>{comunidades.filter((c) => c.ativo !== false).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <input type="number" step="0.01" value={p.valor} style={{ width: 120 }} aria-label="Valor da parte" onChange={(e) => setPartes(partes.map((x, k) => (k === i ? { ...x, valor: Number(e.target.value) } : x)))} />
            <button className="link" type="button" onClick={() => setPartes(partes.filter((_, k) => k !== i))}>Remover</button>
          </div>
        ))}
        <p className="small">{`Soma das partes: ${eur(somaPartes)} · movimento: ${eur(m.valor)}${Math.abs(somaPartes - m.valor) >= 0.005 ? ` · diferença ${eur(r2(m.valor - somaPartes))}` : ''}`}</p>
      </div>}
      <div className="acoes" style={{ marginTop: 14 }}>
        <button disabled={!ok || !v.categoria || (!repartir && !v.comunidadeId && !v.conciliadoCom)} onClick={() => onAplicar(validar({ ...m, ...final(), nota: v.estado === 'rever' ? undefined : v.nota } as MovBanco, categorias))}>Validar</button>
        <button className="sec" disabled={!ok} onClick={() => onAplicar({ ...final(), estado: 'proposto', contabilizar: false })}>Guardar como proposta</button>
        <button className="sec" onClick={() => onAplicar({ estado: 'rever', contabilizar: false, nota: v.nota?.startsWith('REVER') ? v.nota : 'REVER - marcado à mão' })}>Para rever</button>
        <button className="sec" onClick={() => onAplicar({ estado: 'por-classificar', contabilizar: false, categoria: undefined, comunidadeId: undefined, partes: undefined, conciliadoCom: null, centroCusto: undefined, fornecedor: undefined, projeto: undefined, contaAnalitica: undefined, nota: undefined })}>Limpar</button>
      </div>
    </Modal>
  );
}
