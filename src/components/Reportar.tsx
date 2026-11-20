import { useRef, useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Modal, mensagemErro, useCarregar, useCodigoEcra, useFocarErro } from './ui';
import { criarPedido, lerConfigPedidos, refPedido, validarPedido, type NovoPedido, type TipoPedido } from '../lib/pedidos';

/**
 * Botão do rodapé "Reportar bug ou melhoria": abre uma janela que regista o pedido com o código do ecrã.
 * Só aparece com sessão iniciada e quando o registo está ligado (Administração › Bugs e melhorias).
 */
export function BotaoReportar() {
  const { acesso } = useAuth();
  const cfg = useCarregar(lerConfigPedidos, []);
  const [aberto, setAberto] = useState(false);
  if (!acesso || !cfg.dados?.ativo) return null;
  return (
    <>
      <button type="button" className="link reportar" onClick={() => setAberto(true)}>
        <MessageSquarePlus size={14} aria-hidden style={{ verticalAlign: -2, marginRight: 4 }} />Reportar bug ou melhoria
      </button>
      {aberto && <JanelaReportar email={acesso.email} onFechar={() => setAberto(false)} />}
    </>
  );
}

const VAZIO: NovoPedido = { tipo: '', titulo: '', descricao: '' };

export function JanelaReportar({ email, onFechar }: { email: string; onFechar: () => void }) {
  const ecra = useCodigoEcra();
  const [p, setP] = useState<NovoPedido>(VAZIO);
  const [erros, setErros] = useState<ReturnType<typeof validarPedido>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  useFocarErro(Object.keys(erros).length ? erros : null, raiz);
  const caminho = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') || '/' : '/';

  async function enviar() {
    const e = validarPedido(p);
    setErros(e); setErroGeral(null);
    if (Object.keys(e).length) return;
    setOcupado(true);
    try {
      const id = await criarPedido({
        tipo: p.tipo as TipoPedido, titulo: p.titulo.trim(), descricao: p.descricao.trim(),
        ecra: ecra?.codigo ?? '', ecraNome: ecra?.nome ?? '', caminho,
        criadoPor: email.toLowerCase(), criadoEm: new Date().toISOString(),
      });
      setFeito(refPedido(id));
    } catch (err) { setErroGeral(mensagemErro(err)); } finally { setOcupado(false); }
  }

  const erroEm = (c: keyof NovoPedido) => (erros[c] ? 'campo com-erro' : 'campo');
  return (
    <Modal titulo="Reportar bug ou melhoria" onFechar={onFechar}>
      <div ref={raiz}>
        {feito ? (
          <>
            <div className="ok-box">Pedido {feito} registado. Obrigado! A administração vai analisá-lo e pode acompanhar o estado com o CAF.</div>
            <div className="acoes"><button onClick={onFechar}>Fechar</button></div>
          </>
        ) : (
          <>
            <p className="small">Ecrã: <b>{ecra ? `${ecra.codigo} · ${ecra.nome}` : 'sem código'}</b>. O código do ecrã é guardado com o pedido.</p>
            {erroGeral && <div className="aviso">{erroGeral}</div>}
            {Object.keys(erros).length > 0 && <div className="aviso">Corrija os campos assinalados.</div>}
            <div className="grelha-form">
              <div className={erroEm('tipo')} role="radiogroup" aria-label="Tipo">
                <span>Tipo *</span>
                <span className="linha" style={{ gap: 16 }}>
                  {(['bug', 'melhoria'] as const).map((t) => (
                    <label key={t} className="opcao">
                      <input type="radio" name="tipo-pedido" checked={p.tipo === t} aria-invalid={!!erros.tipo} onChange={() => setP({ ...p, tipo: t })} />
                      {t === 'bug' ? 'Bug (algo não funciona)' : 'Melhoria (algo a mudar ou acrescentar)'}
                    </label>
                  ))}
                </span>
                {erros.tipo && <span className="small">{erros.tipo}</span>}
              </div>
            </div>
            <label className={erroEm('titulo')} style={{ marginTop: 12 }}>Título *
              <input value={p.titulo} maxLength={120} aria-invalid={!!erros.titulo} placeholder="Resumo numa frase" onChange={(e) => setP({ ...p, titulo: e.target.value })} />
              {erros.titulo && <span className="small">{erros.titulo}</span>}
            </label>
            <label className={erroEm('descricao')} style={{ marginTop: 12 }}>Descrição *
              <textarea rows={6} value={p.descricao} aria-invalid={!!erros.descricao}
                placeholder={p.tipo === 'melhoria' ? 'O que quer mudar e porquê.' : 'O que fez, o que esperava e o que aconteceu.'}
                onChange={(e) => setP({ ...p, descricao: e.target.value })} />
              {erros.descricao && <span className="small">{erros.descricao}</span>}
            </label>
            <div className="acoes" style={{ marginTop: 14 }}>
              <button disabled={ocupado} onClick={() => void enviar()}>{ocupado ? 'A enviar…' : 'Enviar pedido'}</button>
              <button className="sec" onClick={onFechar}>Cancelar</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
