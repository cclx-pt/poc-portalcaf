import { describe, expect, it } from 'vitest';
import { codigoCompleto, ECRAS, ecraDe } from '../../src/lib/ecras';
import { readFileSync } from 'node:fs';

describe('códigos dos ecrãs', () => {
  it('cada endereço tem o seu código, e um código nunca se repete', () => {
    const codigos = Object.values(ECRAS).map((e) => e.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    for (const c of codigos) expect(c).toMatch(/^(PAI|DAD|REG|ANA|TES|ADM|EXT)-\d{2}$/);
  });

  it('encontra o ecrã pelo endereço, com ou sem barra no fim', () => {
    expect(ecraDe('/reconciliacao')?.codigo).toBe('TES-02');
    expect(ecraDe('/registos/presencas/novo/')?.codigo).toBe('REG-02');
    expect(ecraDe('/')?.codigo).toBe('PAI-01');
    expect(ecraDe('/nao-existe')).toBeNull();
  });

  it('acrescenta o separador ao código', () => {
    expect(codigoCompleto(ECRAS['/configuracao'], 2)).toBe('ADM-01.2');
    expect(codigoCompleto(ECRAS['/configuracao'], null)).toBe('ADM-01');
  });

  it('todas as rotas do portal têm código', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    const rotas = [...app.matchAll(/<Route path="([^"*]+)" element=\{(?!<Navigate)/g)].map((m) => (m[1].startsWith('/') ? m[1] : `/${m[1]}`));
    expect(rotas.length).toBeGreaterThan(20);
    for (const r of rotas) expect(ecraDe(r), r).not.toBeNull();
  });
});

describe('rodapé com o código do ecrã', () => {
  it('mostra o código e o nome do ecrã atual', async () => {
    const { renderToString } = await import('react-dom/server');
    const { createElement: h } = await import('react');
    const { MemoryRouter } = await import('react-router-dom');
    const { Rodape } = await import('../../src/components/ui');
    const html = renderToString(h(MemoryRouter, { initialEntries: ['/reconciliacao'] }, h(Rodape))).replace(/<!-- -->/g, '');
    expect(html).toContain('Ecrã TES-02');
    expect(html).toContain('Reconciliação bancária');
  });

  it('fora de um router não mostra código e não falha', async () => {
    const { renderToString } = await import('react-dom/server');
    const { createElement: h } = await import('react');
    const { Rodape } = await import('../../src/components/ui');
    expect(renderToString(h(Rodape))).not.toContain('Ecrã');
  });
});
