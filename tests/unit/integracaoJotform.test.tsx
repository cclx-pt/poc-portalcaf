import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
vi.mock('../../src/components/SyncEstado', () => ({ SyncEstado: () => <div>estado-sync</div> }));
vi.mock('../../src/components/Importar', () => ({ Importar: () => null }));

describe('Administração › Integrações › Jotform (ADM-06)', () => {
  it('mostra o estado da sincronização e a importação manual para os quatro formulários', async () => {
    const { default: Pagina } = await import('../../src/pages/IntegracaoJotform');
    const html = renderToString(<Pagina />).replace(/<!-- -->/g, '');
    expect(html).toContain('estado-sync');
    for (const t of ['CCLX - CONTRIBUIR', 'REGISTO DE DEPÓSITOS', 'REGISTO DE DESPESAS', 'Registo de Presenças']) expect(html).toContain(t);
    expect(html.match(/Importar ficheiro/g)).toHaveLength(4);
  });
});
