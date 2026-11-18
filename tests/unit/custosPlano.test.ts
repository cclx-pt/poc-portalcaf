import { describe, expect, it } from 'vitest';
import { proporClassificacaoCusto } from '../../src/lib/custosPlano';
import { categoriasDoPlano } from '../../src/lib/plano';
import { calcularResumos } from '../../src/lib/resumos';
import type { CustoFixo } from '../../src/lib/types';

const cats = categoriasDoPlano();
const p = (r: string) => proporClassificacaoCusto(r, cats);

describe('proposta de classificação dos custos fixos com o plano', () => {
  it('propõe categoria, fornecedor e centro de custo a partir da rubrica atual', () => {
    expect(p('Renda')).toEqual({ categoria: '02.01 Rendas e condomínios', centroCusto: 'CC02' });
    expect(p('Condomínio').categoria).toBe('02.01 Rendas e condomínios');
    expect(p('Luz').categoria).toBe('02.02 Energia e água');
    expect(p('Água (Culligan)')).toEqual({ categoria: '02.02 Energia e água', fornecedor: 'Culligan', centroCusto: 'CC02' });
    expect(p('Comunicações').categoria).toBe('02.03 Comunicações');
    expect(p('Controlo de pragas (Anticimex)')).toMatchObject({ categoria: '02.04 Limpeza e higiene', fornecedor: 'Anticimex' });
    expect(p('Alarme (Prosegur)')).toMatchObject({ categoria: '02.06 Segurança e seguros', fornecedor: 'Prosegur' });
    expect(p('Vencimento Pastoral')).toEqual({ categoria: '01.01 Remunerações e subsídios', centroCusto: 'CC03' });
    expect(p('Segurança Social · Vencimento Multimédia')).toEqual({ categoria: '01.02 Segurança Social e retenções', centroCusto: 'CC03' });
    expect(p('Contabilidade').categoria).toBe('03.01 Contabilidade e assessoria');
    expect(p('Google Workspace')).toMatchObject({ categoria: '03.04 Software e subscrições' });
    expect(p('Imposto sobre a renda').categoria).toBe('02.08 Impostos prediais');
    expect(p('Plafond deslocação pastoral')).toEqual({ categoria: '01.05 Deslocações de pessoal', centroCusto: 'CC03' });
    expect(p('Deslocação pastoral (donativo)')).toEqual({ categoria: '01.05 Deslocações de pessoal', centroCusto: 'CC03' });
    expect(p('Algo desconhecido')).toEqual({});
  });
  it('só propõe categorias que existem no catálogo', () => {
    expect(proporClassificacaoCusto('Renda', [])).toEqual({});
  });
  it('nos resultados, um custo fixo com categoria do plano usa a rubrica dessa categoria', () => {
    const cf: CustoFixo = { id: 'r', comunidadeId: 'almada', rubrica: 'Renda', categoria: '02.01 Rendas e condomínios', valorMensal: 500, ano: 2026, inicio: '2026-01', fim: '2026-12', nivel: 'privado' };
    const rs = calcularResumos({ ano: 2026, comunidades: [{ id: 'almada', nome: 'Almada', ordem: 1 }], contribuir: [], depositos: [], despesas: [], assistencia: [], banco: [], custosFixos: [cf], mesesFechados: new Set(), regraFechados: false, hoje: '2026-03-15', categorias: cats, assistenciaAnterior: [] });
    expect(rs[0].meses[0].rubricas.saida['02 Instalações'].local).toBe(500);
  });
});
