import { useState } from 'react';
import { Importar } from './Importar';
import { FONTES } from '../lib/fontes';
import type { Origem } from '../lib/types';

const ORIGENS: Origem[] = ['contribuir', 'depositos', 'despesas', 'assistencia'];

/**
 * Importação manual de recurso do Jotform, por formulário (Configuração › Jotform e sincronização, ADM-01.3).
 * Cada importação substitui os meses que contém, por comunidade.
 */
export function ImportacaoManualJotform({ onFeito }: { onFeito?: () => void }) {
  const [origem, setOrigem] = useState<Origem | null>(null);
  return (
    <div className="sec card">
      <h2>Importação manual (recurso)</h2>
      <p className="small">Os dados entram do Jotform automaticamente. Use a importação manual só quando a sincronização falha: cada importação substitui os meses que contém, por comunidade.</p>
      <table>
        <thead><tr><th>Formulário</th><th /></tr></thead>
        <tbody>
          {ORIGENS.map((o) => (
            <tr key={o}>
              <td>{FONTES[o].titulo}</td>
              <td className="num"><button className="sec" onClick={() => setOrigem(o)}>Importar ficheiro</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {origem && <Importar origem={origem} onFechar={() => setOrigem(null)} onFeito={() => onFeito?.()} />}
    </div>
  );
}
