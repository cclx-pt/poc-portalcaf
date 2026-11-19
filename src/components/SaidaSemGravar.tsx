import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal } from './ui';

/** Ecrã com alterações por gravar: a função grava e devolve true se correu bem. */
interface Pendente { gravar?: () => Promise<boolean> }
interface Ctx { registar: (id: string, p: Pendente | null) => void }
const SaidaCtx = createContext<Ctx | null>(null);

/**
 * Ao sair de um ecrã com alterações por gravar (menu, links, fechar ou recarregar a página), pergunta:
 * gravar e sair, sair sem gravar, ou ficar.
 */
export function SaidaSemGravarProvider({ children }: { children: ReactNode }) {
  const pendentes = useRef(new Map<string, Pendente>());
  const [pergunta, setPergunta] = useState<{ destino: string } | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const registar = useCallback((id: string, p: Pendente | null) => { if (p) pendentes.current.set(id, p); else pendentes.current.delete(id); }, []);

  useEffect(() => {
    // Links internos (o portal usa #/…): intercetados antes de mudarem de página.
    const clique = (e: MouseEvent) => {
      if (!pendentes.current.size || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank') return;
      const href = a.getAttribute('href') ?? '';
      const i = href.indexOf('#/');
      if (i < 0) return;
      const destino = href.slice(i);
      if (destino === window.location.hash) return;
      e.preventDefault(); e.stopPropagation();
      setErro(null); setPergunta({ destino });
    };
    // Fechar o separador ou recarregar: o browser mostra o seu próprio aviso.
    const antesDeSair = (e: BeforeUnloadEvent) => { if (pendentes.current.size) { e.preventDefault(); e.returnValue = ''; } };
    document.addEventListener('click', clique, true);
    window.addEventListener('beforeunload', antesDeSair);
    return () => { document.removeEventListener('click', clique, true); window.removeEventListener('beforeunload', antesDeSair); };
  }, []);

  const ir = (destino: string) => { pendentes.current.clear(); setPergunta(null); window.location.hash = destino; };
  async function gravarESair() {
    if (!pergunta) return;
    setAGravar(true); setErro(null);
    try {
      for (const p of pendentes.current.values()) {
        if (p.gravar && !(await p.gravar())) { setErro('Não foi possível gravar: veja a mensagem no ecrã e corrija antes de sair.'); return; }
      }
      ir(pergunta.destino);
    } finally { setAGravar(false); }
  }

  return (
    <SaidaCtx.Provider value={{ registar }}>
      {children}
      {pergunta && (
        <Modal titulo="Há alterações por gravar" onFechar={() => setPergunta(null)}>
          <p>Este ecrã tem alterações que ainda não foram gravadas. O que quer fazer?</p>
          {erro && <div className="aviso">{erro}</div>}
          <div className="acoes" style={{ marginTop: 12 }}>
            {[...pendentes.current.values()].some((p) => p.gravar) && <button disabled={aGravar} onClick={() => void gravarESair()}>{aGravar ? 'A gravar…' : 'Gravar e sair'}</button>}
            <button className="sec" disabled={aGravar} onClick={() => ir(pergunta.destino)}>Sair sem gravar</button>
            <button className="sec" disabled={aGravar} onClick={() => setPergunta(null)}>Ficar</button>
          </div>
        </Modal>
      )}
    </SaidaCtx.Provider>
  );
}

/** Marca o ecrã como tendo alterações por gravar enquanto `sujo` for verdadeiro. `gravar` devolve true se gravou. */
export function useAvisoSaida(sujo: boolean, gravar?: () => Promise<boolean>) {
  const ctx = useContext(SaidaCtx);
  const id = useRef(Math.random().toString(36).slice(2));
  const gravarRef = useRef(gravar);
  gravarRef.current = gravar;
  useEffect(() => {
    if (!ctx) return;
    ctx.registar(id.current, sujo ? { gravar: gravarRef.current ? () => gravarRef.current!() : undefined } : null);
    return () => ctx.registar(id.current, null);
  }, [ctx, sujo]);
}
