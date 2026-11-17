import { describe, expect, it } from 'vitest';
import { EVENTOS_INICIAIS, ID_PORTAL, acrescentarRegisto, novoRegistoPresenca, removerRegisto, validarPresenca } from '../../src/lib/presencas';
import type { Lote } from '../../src/lib/types';

const entrada = { data: '2026-11-15', evento: 'Celebração Domingo', comunidadeId: 'almada', adultos: 120, jump: 8, criancas: 20, connects: 5, observacoes: 'Culto com visitas' };

describe('registo de presenças no portal', () => {
  it('tem os tipos de evento do formulário Jotform por defeito', () => {
    expect(EVENTOS_INICIAIS).toEqual(['Celebração Domingo', 'Reunião Oração', 'ATOS', 'Outra']);
  });
  it('valida os campos obrigatórios como no Jotform', () => {
    expect(validarPresenca({ ...entrada }, '2026-11-16')).toBeNull();
    expect(validarPresenca({ ...entrada, data: '' }, '2026-11-16')).toMatch(/data/i);
    expect(validarPresenca({ ...entrada, data: '2026-11-17' }, '2026-11-16')).toMatch(/futura/i);
    expect(validarPresenca({ ...entrada, evento: '' }, '2026-11-16')).toMatch(/evento/i);
    expect(validarPresenca({ ...entrada, evento: 'Outra', descricao: '' }, '2026-11-16')).toMatch(/descri/i);
    expect(validarPresenca({ ...entrada, comunidadeId: '' }, '2026-11-16')).toMatch(/comunidade/i);
    expect(validarPresenca({ ...entrada, adultos: -1 }, '2026-11-16')).toMatch(/jovens e adultos/i);
    expect(validarPresenca({ ...entrada, criancas: 2.5 }, '2026-11-16')).toMatch(/crianças/i);
  });
  it('cria um registo com a forma dos registos do Jotform', () => {
    const r = novoRegistoPresenca({ ...entrada, evento: 'Outra', descricao: 'Vigília' }, 'ana@x.pt');
    expect(r.id.startsWith(ID_PORTAL)).toBe(true);
    expect(r).toMatchObject({ data: '2026-11-15', valor: 120, categoria: 'Assistência', evento: 'Outra', descricao: 'Vigília', extra: { jump: 8, criancas: 20, connects: 5, observacoes: 'Culto com visitas', registadoPor: 'ana@x.pt' } });
  });
  it('acrescenta ao lote mensal da comunidade (cria-o se não existir) e remove', () => {
    const r = novoRegistoPresenca(entrada, 'ana@x.pt');
    const l1 = acrescentarRegisto(undefined, r, 'ana@x.pt', 'almada');
    expect(l1).toMatchObject({ id: 'assistencia_2026_11_almada', origem: 'assistencia', ano: 2026, mes: 11, periodo: '2026-11', comunidadeId: 'almada', n: 1, total: 120 });
    const r2 = novoRegistoPresenca({ ...entrada, data: '2026-11-08', adultos: 100 }, 'ana@x.pt');
    const l2 = acrescentarRegisto(l1, r2, 'ana@x.pt');
    expect(l2.n).toBe(2); expect(l2.total).toBe(220);
    expect(l2.registos.map((x) => x.data)).toEqual(['2026-11-08', '2026-11-15']); // ordenado por data
    const l3 = removerRegisto(l2, r.id);
    expect(l3.n).toBe(1); expect(l3.total).toBe(100);
  });
  it('avisa quando já existe registo do mesmo evento no mesmo dia e comunidade', () => {
    const r = novoRegistoPresenca(entrada, 'ana@x.pt');
    const lote: Lote = acrescentarRegisto(undefined, r, 'ana@x.pt', 'almada');
    expect(validarPresenca(entrada, '2026-11-16', [lote])).toMatch(/já existe/i);
    expect(validarPresenca({ ...entrada, evento: 'ATOS' }, '2026-11-16', [lote])).toBeNull();
  });
});
