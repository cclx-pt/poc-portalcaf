import { describe, expect, it } from 'vitest';
import { OUTROS_FUNCIONAMENTO, RUBRICAS_ENTRADA, RUBRICAS_SAIDA, classificador, rubricaInicial } from '../../src/lib/rubricas';
import type { Categoria } from '../../src/lib/types';

const cat = (nome: string, tipo: Categoria['tipo'], extra: Partial<Categoria> = {}): Categoria =>
  ({ id: `${tipo}-${nome}`, nome, tipo, atividade: '', nivel: 'privado', ...extra });

describe('rubricas', () => {
  it('lista as rubricas do desenho', () => {
    expect(RUBRICAS_ENTRADA).toEqual(['Dízimos', 'Ofertas', 'Outras contribuições', 'Pagamentos (eventos, inscrições)', 'Outros rendimentos']);
    expect(RUBRICAS_SAIDA).toEqual(['Vencimentos e encargos', 'Instalações', 'Consumíveis e funcionamento', 'Donativos e ofertas', 'Atividades e eventos', 'Outros gastos']);
    expect(OUTROS_FUNCIONAMENTO).toBe('Outros custos de funcionamento');
  });
  it('mapeamento inicial', () => {
    expect(rubricaInicial('Renda', 'saida')).toBe('Instalações');
    expect(rubricaInicial('Coletas em dinheiro', 'entrada')).toBe('Ofertas');
    expect(rubricaInicial('Missões', 'saida')).toBe('Donativos e ofertas');
    expect(rubricaInicial('Missões', 'entrada')).toBe('Outras contribuições');
    expect(rubricaInicial('Segurança Social', 'saida')).toBe('Vencimentos e encargos');
    expect(rubricaInicial('Pagamentos Livraria', 'entrada')).toBe('Outros rendimentos');
    expect(rubricaInicial('Algo novo', 'saida')).toBe('Outros gastos');
  });
  it('classifica pelo nome e tipo, com âmbito e nível', () => {
    const c = classificador([
      cat('Renda', 'saida', { ambito: 'geral' }),
      cat('Dízimos', 'entrada', { rubrica: 'Dízimos' }),
      cat('Vencimentos', 'saida', { nivel: 'confidencial' }),
    ]);
    expect(c('Renda', 'saida')).toEqual({ rubrica: 'Instalações', ambito: 'geral', confidencial: false });
    expect(c('Dízimo', 'entrada')).toEqual({ rubrica: 'Dízimos', ambito: 'local', confidencial: false });
    expect(c('vencimentos', 'saida').confidencial).toBe(true);
    expect(c('Pagamentos Livraria', 'entrada')).toEqual({ rubrica: 'Outros rendimentos', ambito: 'local', confidencial: false });
    expect(c('Renda', 'entrada').ambito).toBe('local'); // tipo diferente não corresponde
  });
});
