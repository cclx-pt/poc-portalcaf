import { describe, expect, it } from 'vitest';
import { CATEGORIAS_PLANO, RUBRICAS_PLANO, categoriasDoPlano, dimensoesDoPlano } from '../../src/lib/plano';
import { classificador } from '../../src/lib/rubricas';

describe('plano financeiro (proposta v2.1)', () => {
  it('tem as rubricas e categorias da proposta', () => {
    expect(RUBRICAS_PLANO.filter((r) => r.grupo === 'despesa')).toHaveLength(9);
    expect(RUBRICAS_PLANO.filter((r) => r.grupo === 'receita')).toHaveLength(3);
    expect(RUBRICAS_PLANO.filter((r) => r.grupo === 'financeiro')).toHaveLength(3);
    expect(CATEGORIAS_PLANO.filter(([c]) => /^\d/.test(c))).toHaveLength(51);
    expect(CATEGORIAS_PLANO).toHaveLength(67);
    expect(CATEGORIAS_PLANO).toContainEqual(['02.08', 'Impostos prediais']);
    expect(CATEGORIAS_PLANO).toContainEqual(['03.07', 'Taxas']);
  });
  it('gera as categorias com rubrica, tipo, nível (vencimentos e donativos confidenciais) e âmbito local', () => {
    const cats = categoriasDoPlano();
    const c = (cod: string) => cats.find((x) => x.codigo === cod)!;
    expect(c('02.03')).toMatchObject({ id: 'plano-02-03', nome: '02.03 Comunicações', tipo: 'saida', rubrica: '02 Instalações', nivel: 'privado', ambito: 'local', ativo: true, origem: 'plano' });
    expect(c('R1.01')).toMatchObject({ tipo: 'entrada', rubrica: 'R1 Dízimos e ofertas' });
    expect(c('F1.02')).toMatchObject({ tipo: 'financeiro', rubrica: 'F1 Transferências e depósitos' });
    expect(cats.filter((x) => x.nivel === 'confidencial').map((x) => x.codigo).sort()).toEqual(['01.01', '07.03', 'R3.02']);
  });
  it('gera as dimensões: 15 centros de custo, fornecedores e contas analíticas', () => {
    const d = dimensoesDoPlano();
    expect(d.filter((x) => x.tipo === 'centro')).toHaveLength(15);
    expect(d.find((x) => x.codigo === 'CC07')).toMatchObject({ nome: 'JUMP', ambito: 'Ministério' });
    expect(d.filter((x) => x.tipo === 'fornecedor').map((x) => x.nome)).toContain('MEO');
    expect(d.find((x) => x.tipo === 'conta' && x.nome === 'Eletricidade')).toMatchObject({ categoria: '02.02' });
    expect(new Set(d.map((x) => x.id)).size).toBe(d.length);
  });
  it('o classificador reconhece o nome com código, sem código e os sinónimos do Jotform', () => {
    const k = classificador(categoriasDoPlano());
    expect(k('02.03 Comunicações', 'saida')).toMatchObject({ rubrica: '02 Instalações', financeiro: false });
    expect(k('Comunicações', 'saida').rubrica).toBe('02 Instalações');
    expect(k('Dízimos', 'entrada').rubrica).toBe('R1 Dízimos e ofertas');
    expect(k('Coletas em dinheiro', 'entrada').categoria).toBe('R1.02 Ofertas gerais');
    expect(k('Obras', 'saida').rubrica).toBe('08 Investimentos');
    expect(k('01.01 Remunerações e subsídios', 'saida').confidencial).toBe(true);
    expect(k('F1.02 Depósitos de numerário', 'entrada').financeiro).toBe(true);
    expect(k('Coisa nova', 'saida')).toMatchObject({ rubrica: 'Por classificar', financeiro: false });
  });
});
