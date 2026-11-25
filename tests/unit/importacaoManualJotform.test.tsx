import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
vi.mock('../../src/components/Importar', () => ({ Importar: () => null }));

describe('Configuração › Jotform e sincronização (ADM-01.3): importação manual', () => {
  it('tem a importação manual para os quatro formulários', async () => {
    const { ImportacaoManualJotform } = await import('../../src/components/ImportacaoManualJotform');
    const html = renderToString(<ImportacaoManualJotform />).replace(/<!-- -->/g, '');
    expect(html).toContain('Importação manual (recurso)');
    for (const t of ['CCLX - CONTRIBUIR', 'REGISTO DE DEPÓSITOS', 'REGISTO DE DESPESAS', 'Registo de Presenças']) expect(html).toContain(t);
    expect(html.match(/Importar ficheiro/g)).toHaveLength(4);
  });
});
