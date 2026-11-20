import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Estado, Kpi, Modal, mensagemErro, useCarregar } from '../components/ui';
import { auditar } from '../lib/db';
import {
  apagarPedido, atualizarPedido, ESTADO_PEDIDO, ESTADOS_ABERTOS, gravarConfigPedidos, lerConfigPedidos, listarPedidos, ordenarPedidos,
  PRIORIDADE_PEDIDO, refPedido, TIPO_PEDIDO, type EstadoPedido, type Pedido, type PrioridadePedido, type TipoPedido,
} from '../lib/pedidos';

const dataHora = (s?: string) => (s ? new Date(s).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) : '—');

/** Administração › Bugs e melhorias (ADM-04): pedidos registados no rodapé dos ecrãs, e o interruptor do registo. */
export default function Pedidos() {
  const { acesso } = useAuth();
  const cfg = useCarregar(lerConfigPedidos, []);
  const lista = useCarregar(listarPedidos, []);
  const [fEstado, setFEstado] = useState<'abertos' | 'todos' | EstadoPedido>('abertos');
  const [fTipo, setFTipo] = useState<'todos' | TipoPedido>('todos');
  const [fTexto, setFTexto] = useState('');
  const [detalhe, setDetalhe] = useState<Pedido | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const todos = lista.dados ?? [];
  const visiveis = useMemo(() => {
    const t = fTexto.trim().toLowerCase();
    return ordenarPedidos(todos.filter((p) =>
      (fEstado === 'todos' || (fEstado === 'abertos' ? ESTADOS_ABERTOS.includes(p.estado) : p.estado === fEstado))
      && (fTipo === 'todos' || p.tipo === fTipo)
      && (!t || `${p.titulo} ${p.descricao} ${p.ecra} ${p.ecraNome} ${p.criadoPor} ${refPedido(p.id)}`.toLowerCase().includes(t))));
  }, [todos, fEstado, fTipo, fTexto]);
  const conta = (f: (p: Pedido) => boolean) => todos.filter(f).length;

  async function alternarRegisto() {
    if (!cfg.dados || !acesso) return;
    const ativo = !cfg.dados.ativo;
    setErro(null); setMsg(null);
    try {
      await gravarConfigPedidos({ ativo, alteradoPor: acesso.email, alteradoEm: new Date().toISOString() });
      await auditar(acesso.email, 'Bugs e melhorias', ativo ? 'Registo ligado' : 'Registo desligado');
      setMsg(ativo ? 'Registo de bugs e melhorias ligado: o botão aparece no rodapé de todos os ecrãs.' : 'Registo de bugs e melhorias desligado: o botão deixa de aparecer no rodapé.');
      await cfg.recarregar();
    } catch (e) { setErro(mensagemErro(e)); }
  }

  async function mudar(p: Pedido, campos: Partial<Pick<Pedido, 'estado' | 'prioridade' | 'nota'>>) {
    if (!acesso) return false;
    setErro(null); setMsg(null);
    try {
      await atualizarPedido(p.id, { ...campos, atualizadoPor: acesso.email, atualizadoEm: new Date().toISOString() });
      const o = campos.estado && campos.estado !== p.estado ? `estado ${ESTADO_PEDIDO[p.estado]} → ${ESTADO_PEDIDO[campos.estado]}`
        : campos.prioridade ? `prioridade ${PRIORIDADE_PEDIDO[campos.prioridade]}` : 'nota alterada';
      await auditar(acesso.email, 'Bugs e melhorias', `${refPedido(p.id)} (${p.ecra}): ${o}`);
      lista.setDados(todos.map((x) => (x.id === p.id ? { ...x, ...campos } : x)));
      return true;
    } catch (e) { setErro(mensagemErro(e)); return false; }
  }

  async function apagar(p: Pedido) {
    if (!acesso || !window.confirm(`Apagar o pedido ${refPedido(p.id)} "${p.titulo}"? Não se pode desfazer.`)) return;
    try {
      await apagarPedido(p.id);
      await auditar(acesso.email, 'Bugs e melhorias', `${refPedido(p.id)} (${p.ecra}) apagado: ${p.titulo}`);
      lista.setDados(todos.filter((x) => x.id !== p.id));
      setDetalhe(null);
    } catch (e) { setErro(mensagemErro(e)); }
  }

  const ativo = cfg.dados?.ativo;
  return (
    <>
      <h1>Bugs e melhorias</h1>
      <p className="muted">Pedidos registados no rodapé de cada ecrã ("Reportar bug ou melhoria"), com o código do ecrã. Só o Master e o CAF veem e gerem esta lista; as alterações ficam na auditoria.</p>
      {erro && <div className="aviso">{erro}</div>}
      {msg && <div className="nota">{msg}</div>}

      <div className="sec card">
        <div className="linha" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>Registo de bugs e melhorias</h2>
            <p className="small" style={{ margin: 0 }}>
              {cfg.aCarregar ? 'A carregar…' : ativo
                ? <>Ligado: todos os utilizadores com sessão iniciada veem o botão no rodapé.</>
                : <>Desligado: o botão não aparece e não se podem registar pedidos novos.</>}
              {cfg.dados?.alteradoEm && <span className="muted"> Alterado por {cfg.dados.alteradoPor} em {dataHora(cfg.dados.alteradoEm)}.</span>}
            </p>
          </div>
          <label className="opcao interruptor">
            <input type="checkbox" role="switch" checked={!!ativo} disabled={cfg.aCarregar} onChange={() => void alternarRegisto()} aria-label="Registo de bugs e melhorias" />
            <b>{ativo ? 'Ligado' : 'Desligado'}</b>
          </label>
        </div>
      </div>

      <div className="cards">
        <Kpi titulo="Abertos" valor={String(conta((p) => ESTADOS_ABERTOS.includes(p.estado)))} sub={`${conta((p) => p.estado === 'novo')} novos por analisar`} />
        <Kpi titulo="Bugs abertos" valor={String(conta((p) => p.tipo === 'bug' && ESTADOS_ABERTOS.includes(p.estado)))} sub={`${conta((p) => p.tipo === 'bug' && p.prioridade === 'alta' && ESTADOS_ABERTOS.includes(p.estado))} de prioridade alta`} />
        <Kpi titulo="Melhorias abertas" valor={String(conta((p) => p.tipo === 'melhoria' && ESTADOS_ABERTOS.includes(p.estado)))} />
        <Kpi titulo="Resolvidos" valor={String(conta((p) => p.estado === 'resolvido'))} sub={`${todos.length} pedidos no total`} />
      </div>

      <div className="linha" style={{ marginBottom: 12 }}>
        <label className="campo">Estado
          <select value={fEstado} onChange={(e) => setFEstado(e.target.value as typeof fEstado)}>
            <option value="abertos">Abertos</option>
            <option value="todos">Todos</option>
            {(Object.keys(ESTADO_PEDIDO) as EstadoPedido[]).map((k) => <option key={k} value={k}>{ESTADO_PEDIDO[k]}</option>)}
          </select>
        </label>
        <label className="campo">Tipo
          <select value={fTipo} onChange={(e) => setFTipo(e.target.value as typeof fTipo)}>
            <option value="todos">Todos</option>
            <option value="bug">Bugs</option>
            <option value="melhoria">Melhorias</option>
          </select>
        </label>
        <label className="campo">Procurar
          <input value={fTexto} onChange={(e) => setFTexto(e.target.value)} placeholder="Texto, código do ecrã, email…" />
        </label>
      </div>

      <Estado aCarregar={lista.aCarregar} erro={lista.erro} vazio={!visiveis.length} />
      {visiveis.length > 0 && (
        <div className="tabela"><table>
          <thead><tr><th>Ref.</th><th>Data</th><th>Tipo</th><th>Ecrã</th><th>Título</th><th>Registado por</th><th>Prioridade</th><th>Estado</th><th></th></tr></thead>
          <tbody>{visiveis.map((p) => (
            <tr key={p.id}>
              <td className="small">{refPedido(p.id)}</td>
              <td className="small">{dataHora(p.criadoEm)}</td>
              <td>{p.tipo === 'bug' ? <span className="etiqueta preta">Bug</span> : <span className="etiqueta">Melhoria</span>}</td>
              <td className="small"><b>{p.ecra || '—'}</b>{p.ecraNome && <div className="muted">{p.ecraNome}</div>}</td>
              <td><button className="link" onClick={() => setDetalhe(p)}>{p.titulo}</button></td>
              <td className="small">{p.criadoPor}</td>
              <td>
                <select aria-label="Prioridade" value={p.prioridade ?? ''} onChange={(e) => void mudar(p, { prioridade: e.target.value as PrioridadePedido })}>
                  <option value="" disabled>—</option>
                  {(Object.keys(PRIORIDADE_PEDIDO) as PrioridadePedido[]).map((k) => <option key={k} value={k}>{PRIORIDADE_PEDIDO[k]}</option>)}
                </select>
              </td>
              <td>
                <select aria-label="Estado" value={p.estado} onChange={(e) => void mudar(p, { estado: e.target.value as EstadoPedido })}>
                  {(Object.keys(ESTADO_PEDIDO) as EstadoPedido[]).map((k) => <option key={k} value={k}>{ESTADO_PEDIDO[k]}</option>)}
                </select>
              </td>
              <td className="acoes-linha"><button className="link" onClick={() => setDetalhe(p)}>Abrir</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}

      {detalhe && <DetalhePedido p={detalhe} onFechar={() => setDetalhe(null)} onGuardarNota={(nota) => mudar(detalhe, { nota })} onApagar={() => void apagar(detalhe)} />}
    </>
  );
}

function DetalhePedido({ p, onFechar, onGuardarNota, onApagar }: { p: Pedido; onFechar: () => void; onGuardarNota: (nota: string) => Promise<boolean>; onApagar: () => void }) {
  const [nota, setNota] = useState(p.nota ?? '');
  const [gravado, setGravado] = useState(false);
  return (
    <Modal titulo={`${refPedido(p.id)} · ${TIPO_PEDIDO[p.tipo]}`} onFechar={onFechar}>
      <h2>{p.titulo}</h2>
      <table className="resumo-registo"><tbody>
        <tr><th>Ecrã</th><td>{p.ecra ? <><b>{p.ecra}</b> · {p.ecraNome} {p.caminho && <Link to={p.caminho} onClick={onFechar}>(abrir o ecrã)</Link>}</> : '—'}</td></tr>
        <tr><th>Registado por</th><td>{p.criadoPor} · {dataHora(p.criadoEm)}</td></tr>
        <tr><th>Estado</th><td>{ESTADO_PEDIDO[p.estado]}{p.prioridade && ` · prioridade ${PRIORIDADE_PEDIDO[p.prioridade].toLowerCase()}`}</td></tr>
        {p.atualizadoEm && <tr><th>Última alteração</th><td>{p.atualizadoPor} · {dataHora(p.atualizadoEm)}</td></tr>}
      </tbody></table>
      <h3 style={{ marginTop: 14 }}>Descrição</h3>
      <p style={{ whiteSpace: 'pre-wrap' }}>{p.descricao}</p>
      <label className="campo" style={{ marginTop: 12 }}>Nota da administração (decisão, resposta, PR que resolveu)
        <textarea rows={3} value={nota} onChange={(e) => { setNota(e.target.value); setGravado(false); }} />
      </label>
      {gravado && <div className="ok-box" style={{ marginTop: 8 }}>Nota guardada.</div>}
      <div className="acoes" style={{ marginTop: 12, justifyContent: 'space-between' }}>
        <span className="acoes" style={{ margin: 0 }}>
          <button disabled={nota === (p.nota ?? '')} onClick={() => void onGuardarNota(nota).then((ok) => setGravado(ok))}>Guardar nota</button>
          <button className="sec" onClick={onFechar}>Fechar</button>
        </span>
        <button className="sec" onClick={onApagar}>Apagar pedido</button>
      </div>
    </Modal>
  );
}
