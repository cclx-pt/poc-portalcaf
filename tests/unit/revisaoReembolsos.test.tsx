import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
vi.mock('../../src/lib/db', () => ({ auditar: async () => {} }));

const mov = (id: string, data: string, descricao: string, valor: number) => ({ id, data, descricao, valor, contabilizar: false, loteId: 'L' });
const sub = (id: string, submetido: string, valor: number, extra = {}) => ({ id, codigo: id, submetido, valor, comunidadeId: 'almada', forma: 'mbway' as const, estado: 'Fechado', ...extra });

describe('Reconciliação › Reembolsos MB Way', () => {
  it('lista as saídas com estado, score e submissão, e o relatório inverso', async () => {
    const { RevisaoReembolsos } = await import('../../src/components/RevisaoReembolsos');
    const html = renderToString(<RevisaoReembolsos
      movs={[mov('m1', '2026-11-12', 'Trf Mbway 924XXX727', -45), mov('m2', '2026-11-12', 'EDP', -30)]}
      subs={[sub('R20260040', '2026-11-01', 45, { telefone: '924123727', pessoa: 'Ana Sousa' }), sub('R20260041', '2026-11-03', 90)]}
      usados={new Set()} parametros={{ diasAntes: 2, diasDepois: 45 }} categorias={[]} comunidades={[{ id: 'almada', nome: 'Almada' } as never]}
      ano={2026} mes={11} email="caf@cclx.pt" verPessoais onAplicar={() => {}} />).replace(/<!-- -->/g, '');
    expect(html).toContain('Trf Mbway 924XXX727');
    expect(html).not.toContain('>EDP<');
    expect(html).toContain('Confirmado');
    expect(html).toMatch(/R20260040 · Ana Sousa · Almada · 45,00/);
    expect(html).toContain('Aplicar os confirmados (1)');
    expect(html).toContain('Relatório inverso');
    expect(html).toMatch(/<td>R20260041<\/td>/);
  });
  it('sem nível confidencial não mostra nomes', async () => {
    const { RevisaoReembolsos } = await import('../../src/components/RevisaoReembolsos');
    const html = renderToString(<RevisaoReembolsos movs={[mov('m1', '2026-11-12', 'Reembolso R20260040', -45)]} subs={[sub('R20260040', '2026-11-01', 45, { pessoa: 'Ana Sousa' })]}
      usados={new Set()} parametros={{ diasAntes: 2, diasDepois: 45 }} categorias={[]} comunidades={[]} ano={2026} mes={11} email="x" verPessoais={false} onAplicar={() => {}} />);
    expect(html).not.toContain('Ana Sousa');
  });
});
