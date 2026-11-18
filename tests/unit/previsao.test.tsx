import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { GraficoBarras } from '../../src/components/ui';

describe('gráfico com meses abertos', () => {
  it('assinala as barras de previsão com uma nota clara', () => {
    const html = renderToString(<GraficoBarras dados={[{ rotulo: 'jan', A: 1 }, { rotulo: 'fev', A: 2, _previsao: true }]} series={[{ key: 'A', nome: 'A' }]} />);
    expect(html).toContain('Barras claras e tracejadas: meses abertos, só com a previsão dos custos fixos');
    expect(html).toContain('previsão dos custos fixos)');
  });
  it('sem meses abertos não mostra a nota', () => {
    const html = renderToString(<GraficoBarras dados={[{ rotulo: 'jan', A: 1 }]} series={[{ key: 'A', nome: 'A' }]} />);
    expect(html).not.toContain('Barras claras');
  });
});
