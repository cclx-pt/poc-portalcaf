import { useState } from 'react';
import { Importar } from '../components/Importar';
import { SyncEstado } from '../components/SyncEstado';
import { FONTES } from '../lib/fontes';
import type { Origem } from '../lib/types';

const ORIGENS: Origem[] = ['contribuir', 'depositos', 'despesas', 'assistencia'];

/**
 * Administração › Integrações › Jotform (ADM-06): estado da sincronização automática e importação manual
 * de recurso, por formulário. A importação manual saiu dos ecrãs de dados para aqui.
 */
export default function IntegracaoJotform() {
  const [origem, setOrigem] = useState<Origem | null>(null);
  const [versao, setVersao] = useState(0);
  return (
    <>
      <h1>Integrações › Jotform</h1>
      <p className="muted">Os dados entram do Jotform automaticamente. A importação manual é um recurso para quando a sincronização falha: cada importação substitui os meses que contém, por comunidade.</p>
      <SyncEstado detalhe versao={versao} />
      <div className="card" style={{ marginTop: 12 }}>
        <h2>Importação manual (recurso)</h2>
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
      </div>
      {origem && <Importar origem={origem} onFechar={() => setOrigem(null)} onFeito={() => setVersao((v) => v + 1)} />}
    </>
  );
}
