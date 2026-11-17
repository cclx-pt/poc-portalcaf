import { describe, expect, it } from 'vitest';
import { EVENTOS_INICIAIS, ID_PORTAL, comunidadesDoUtilizador, corrigirRegisto, entradaDeRegisto, eCorrigido, acrescentarRegisto, novoRegistoPresenca, removerRegisto, validarPresenca } from '../../src/lib/presencas';
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
  it('campos numéricos começam em branco e são obrigatórios (0 escreve-se)', () => {
    expect(validarPresenca({ ...entrada, adultos: NaN }, '2026-11-16')).toBe('Indique o número de jovens e adultos (0 se não houve).');
    expect(validarPresenca({ ...entrada, connects: NaN }, '2026-11-16')).toBe("Indique o número de Connect's (0 se não houve).");
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

  it('só oferece as comunidades a que o utilizador tem acesso', () => {
    const todas = [{ id: 'almada', nome: 'Almada', ordem: 1 }, { id: 'porto', nome: 'Porto', ordem: 2 }, { id: 'moita', nome: 'Moita', ordem: 3, ativo: false }, { id: 'bolsa-geral', nome: 'Bolsa', ordem: 9, especial: true }];
    expect(comunidadesDoUtilizador(todas, ['*']).map((c) => c.id)).toEqual(['almada', 'porto']);
    expect(comunidadesDoUtilizador(todas, ['porto']).map((c) => c.id)).toEqual(['porto']);
    expect(comunidadesDoUtilizador(todas, ['moita', 'bolsa-geral'])).toEqual([]);
    expect(comunidadesDoUtilizador(todas, [])).toEqual([]);
  });

  describe('corrigir registos anteriores', () => {
    const jot: Lote = { id: 'assistencia_2026_11_almada', origem: 'assistencia', ano: 2026, mes: 11, periodo: '2026-11', comunidadeId: 'almada',
      registos: [
        { id: 'j1', data: '2026-11-08', valor: 100, categoria: 'Assistência', evento: 'Celebração Domingo', extra: { jump: 4, criancas: 10 } },
        { id: 'j2', data: '2026-11-15', valor: 90, categoria: 'Assistência', evento: 'Celebração Domingo' },
      ], total: 190, n: 2, atualizadoEm: '', atualizadoPor: '' };
    const AGORA = '2026-11-17T14:00:00.000Z';

    it('preenche o formulário a partir do registo (campos vazios do Jotform contam 0)', () => {
      expect(entradaDeRegisto(jot.registos[0], 'almada')).toMatchObject({ data: '2026-11-08', evento: 'Celebração Domingo', comunidadeId: 'almada', adultos: 100, jump: 4, criancas: 10, connects: 0 });
    });
    it('corrige, guarda quem e quando alterou e descreve a alteração', () => {
      const e = { ...entradaDeRegisto(jot.registos[0], 'almada'), adultos: 105, observacoes: 'Contagem revista' };
      const r = corrigirRegisto(jot, 'j1', e, 'ana@x.pt', '2026-11-17', AGORA);
      const c = r.lote.registos.find((x) => x.id === 'j1')!;
      expect(c).toMatchObject({ valor: 105, extra: { jump: 4, criancas: 10, connects: 0, observacoes: 'Contagem revista', alteradoPor: 'ana@x.pt', alteradoEm: AGORA } });
      expect(eCorrigido(c)).toBe(true);
      expect(r.lote.total).toBe(195);
      expect(r.lote.atualizadoPor).toBe('ana@x.pt');
      expect(r.alteracoes).toBe('Jovens e adultos: 100 → 105; Observações: (vazio) → Contagem revista');
    });
    it('não aceita mudar de mês nem duplicar outro registo; sem alterações não grava', () => {
      const base = entradaDeRegisto(jot.registos[0], 'almada');
      expect(() => corrigirRegisto(jot, 'j1', { ...base, data: '2026-10-25' }, 'a@x.pt', '2026-11-17', AGORA)).toThrow(/mesmo mês/);
      expect(() => corrigirRegisto(jot, 'j1', { ...base, data: '2026-11-15' }, 'a@x.pt', '2026-11-17', AGORA)).toThrow(/Já existe/);
      expect(() => corrigirRegisto(jot, 'j1', { ...base, adultos: NaN }, 'a@x.pt', '2026-11-17', AGORA)).toThrow(/jovens e adultos/);
      expect(() => corrigirRegisto(jot, 'j1', base, 'a@x.pt', '2026-11-17', AGORA)).toThrow(/Não há alterações/);
    });
  });
});

