import type { Contagem } from '../lib/eventos';
import { num } from '../lib/format';

const hora = (iso?: string) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' }) : '';
};

/**
 * Contador em grelha de toque: um quadrado grande por contagem. Tocar no quadrado soma 1;
 * o − no canto corrige. Todas as contagens ficam visíveis ao mesmo tempo, com o total em cima.
 */
export function Contador({ contagens, valores, contexto, aoSomar, aoFechar, rascunhoAtivo = true, guardadoEm }: {
  contagens: Contagem[]; valores: Record<string, number | undefined>; contexto: string;
  /** Soma (ou subtrai) ao valor mais recente, para cliques rápidos não se perderem. */
  aoSomar: (id: string, delta: number) => void;
  aoFechar: () => void; rascunhoAtivo?: boolean; guardadoEm?: string;
}) {
  const v = (id: string) => { const x = valores[id]; return x == null || Number.isNaN(x) ? 0 : x; };
  const total = contagens.reduce((s, c) => s + v(c.id), 0);
  const somar = (id: string, d: number) => {
    if (d < 0 && v(id) <= 0) return;
    aoSomar(id, d);
    try { navigator.vibrate?.(d > 0 ? 15 : [10, 40, 10]); } catch { /* sem vibração */ }
  };

  return (
    <div className="contador" role="dialog" aria-label="Contador">
      <div className="contador-topo">
        <button className="link" onClick={aoFechar}>← Registo</button>
        <span className="small muted">{contexto}</span>
      </div>
      <div className="contador-total"><span>Total</span><b aria-live="polite">{num(total)}</b></div>
      <div className={`contador-grelha n${Math.min(contagens.length, 6)}`}>
        {contagens.map((c, i) => (
          <div key={c.id} className={`contador-tile${i === 0 ? ' prim' : ''}`}>
            <button className="contador-toque" onClick={() => somar(c.id, 1)} aria-label={`Mais 1 em ${c.nome}`}>
              <span className="contador-tile-nome">{c.nome}</span>
              <span className="contador-tile-valor">{num(v(c.id))}</span>
              <span className="contador-tile-dica">toque para +1</span>
            </button>
            <button className="contador-menos" onClick={() => somar(c.id, -1)} disabled={v(c.id) <= 0} aria-label={`Menos 1 em ${c.nome}`}>−</button>
          </div>
        ))}
      </div>
      <p className="small muted contador-nota">{rascunhoAtivo
        ? (guardadoEm ? `Rascunho guardado às ${hora(guardadoEm)}` : 'Rascunho guardado neste dispositivo a cada toque')
        : 'Escolha a data, o evento e a comunidade no registo para a contagem ficar em rascunho.'}</p>
      <button className="contador-guardar" onClick={aoFechar}>Rever e guardar registo</button>
    </div>
  );
}
