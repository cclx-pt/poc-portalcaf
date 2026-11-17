import { useEffect } from 'react';
import type { Contagem } from '../lib/eventos';
import { num } from '../lib/format';

/**
 * Contador manual (como os contadores de clique): ecrã inteiro com um botão grande de +1.
 * Os atalhos no topo mudam de contagem (ex.: de Jovens e adultos para Crianças); "Voltar ao registo" fecha.
 */
export function Contador({ contagens, ativa, valores, contexto, aoMudar, aoSomar, aoEscolher, aoFechar, rascunhoAtivo = true }: {
  contagens: Contagem[]; ativa: string; valores: Record<string, number | undefined>; contexto: string; rascunhoAtivo?: boolean;
  aoMudar: (id: string, valor: number) => void;
  /** Soma (ou subtrai) ao valor mais recente, para cliques rápidos não se perderem. */
  aoSomar: (id: string, delta: number) => void;
  aoEscolher: (id: string) => void; aoFechar: () => void;
}) {
  const atual = contagens.find((c) => c.id === ativa) ?? contagens[0];
  const v = (id: string) => { const x = valores[id]; return x == null || Number.isNaN(x) ? 0 : x; };
  const valor = v(atual.id);
  const somar = (d: number) => {
    if (d < 0 && valor <= 0) return;
    aoSomar(atual.id, d);
    try { navigator.vibrate?.(d > 0 ? 15 : [10, 40, 10]); } catch { /* sem vibração */ }
  };

  // Teclado (computador): espaço/Enter/+ soma, − ou Backspace subtrai, Esc volta.
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') aoFechar();
      else if (ev.key === '+' || ((ev.key === ' ' || ev.key === 'Enter') && !(ev.target instanceof HTMLButtonElement))) { ev.preventDefault(); somar(1); }
      else if (ev.key === '-' || ev.key === 'Backspace') { ev.preventDefault(); somar(-1); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  });

  return (
    <div className="contador" role="dialog" aria-label={`Contador de ${atual.nome}`}>
      <div className="contador-topo">
        <button className="link" onClick={aoFechar}>← Voltar ao registo</button>
        <span className="small muted">{contexto}</span>
      </div>
      <div className="contador-categorias" role="tablist" aria-label="Contagens">
        {contagens.map((c) => (
          <button key={c.id} role="tab" aria-selected={c.id === atual.id} className={c.id === atual.id ? 'ativa' : ''} onClick={() => aoEscolher(c.id)}>
            <span>{c.nome}</span><b>{num(v(c.id))}</b>
          </button>
        ))}
      </div>
      <div className="contador-nome">{atual.nome}</div>
      <div className="contador-valor" aria-live="polite">{num(valor)}</div>
      <button className="contador-mais" onClick={() => somar(1)} aria-label={`Mais 1 em ${atual.nome}`}>+1</button>
      <div className="contador-acoes">
        <button className="sec" onClick={() => somar(-1)} disabled={valor <= 0} aria-label={`Menos 1 em ${atual.nome}`}>−1</button>
        <button className="sec" onClick={() => { if (valor && confirm(`Repor ${atual.nome} a 0?`)) aoMudar(atual.id, 0); }} disabled={!valor}>Repor a 0</button>
      </div>
      <p className="small muted contador-nota">{rascunhoAtivo
        ? 'Rascunho guardado neste dispositivo a cada clique. Para gravar o registo, volte ao registo e carregue em Guardar registo.'
        : 'Escolha a data, o evento e a comunidade no registo para a contagem ficar guardada em rascunho.'}</p>
    </div>
  );
}
