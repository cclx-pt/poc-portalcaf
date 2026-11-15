import { describe, expect, it } from 'vitest';
import { calcularPublico, calcularPublicoSite, calcularResumos, partesMes, type DadosCalculo } from '../../src/lib/resumos';
import { OUTROS_FUNCIONAMENTO } from '../../src/lib/rubricas';
import type { Categoria, Comunidade, CustoFixo, Lote, Resumo } from '../../src/lib/types';

const COMS: Comunidade[] = [
  { id: 'almada', nome: 'Almada', ordem: 1 },
  { id: 'porto', nome: 'Porto', ordem: 2 },
  { id: 'sede', nome: 'Sede', ordem: 3 },
  { id: 'barreiro', nome: 'Barreiro', ordem: 4, fim: '2026-10-31' },
  { id: 'bolsa-geral', nome: 'Bolsa geral', ordem: 99, especial: true },
];
const cat = (nome: string, tipo: Categoria['tipo'], ambito: 'local' | 'geral', nivel: Categoria['nivel'] = 'privado'): Categoria =>
  ({ id: nome, nome, tipo, atividade: '', nivel, ambito });
const CATS = [cat('Renda', 'saida', 'geral'), cat('Material', 'saida', 'local'), cat('Vencimentos', 'saida', 'geral', 'confidencial'), cat('Dízimos', 'entrada', 'local')];
let seq = 0;
/** Primeiro domingo do mês (as médias de assistência só contam domingos). */
const domingo = (ano: number, mes: number) => { const d = new Date(Date.UTC(ano, mes - 1, 1)); d.setUTCDate(1 + ((7 - d.getUTCDay()) % 7)); return d.toISOString().slice(0, 10); };
const lote = (origem: Lote['origem'], comunidadeId: string, ano: number, mes: number, regs: { valor: number; categoria?: string }[]): Lote => ({
  id: `${origem}_${ano}_${mes}_${comunidadeId}_${++seq}`, origem, ano, mes, periodo: `${ano}-${String(mes).padStart(2, '0')}`, comunidadeId,
  registos: regs.map((r, i) => ({ id: `${seq}-${i}`, data: domingo(ano, mes), valor: r.valor, categoria: r.categoria ?? 'Dízimos' })),
  total: 0, n: regs.length, atualizadoEm: '', atualizadoPor: '',
});
const base = (x: Partial<DadosCalculo>): DadosCalculo => ({
  ano: 2026, comunidades: COMS, contribuir: [], depositos: [], despesas: [], assistencia: [], banco: [], custosFixos: [],
  mesesFechados: new Set(), hoje: '2026-11-13', categorias: CATS, assistenciaAnterior: [], ...x,
});
const mes = (rs: Resumo[], c: string, m: number) => rs.find((r) => r.comunidadeId === c)!.meses[m - 1];
const somaSaldos = (rs: Resumo[]) => Math.round(rs.reduce((s, r) => s + r.meses.reduce((t, x) => t + x.saldo, 0), 0) * 100) / 100;

describe('repartição dos gerais', () => {
  it('geral repartida pela média de 12 meses', () => {
    const rs = calcularResumos(base({
      despesas: [lote('despesas', 'sede', 2026, 3, [{ valor: 300, categoria: 'Renda' }])],
      assistencia: [lote('assistencia', 'almada', 2026, 3, [{ valor: 100 }]), lote('assistencia', 'porto', 2026, 3, [{ valor: 50 }])],
    }));
    expect(mes(rs, 'almada', 3).geralSaidas).toBe(200);
    expect(mes(rs, 'porto', 3).geralSaidas).toBe(100);
    expect(mes(rs, 'sede', 3).saidas).toBe(0);
    expect(mes(rs, 'almada', 3).rubricas.saida['Instalações'].geral).toBe(200);
    expect(mes(rs, 'almada', 3).pesoGeral).toBeCloseTo(2 / 3);
    expect(mes(rs, 'almada', 3).adultosMedia12m).toBe(100);
  });

  it('só os registos de domingo contam para as médias e os pesos', () => {
    const sabado: Lote = { ...lote('assistencia', 'porto', 2026, 3, [{ valor: 1000 }]) };
    sabado.registos = sabado.registos.map((r) => ({ ...r, data: '2026-03-07' })); // sábado
    const rs = calcularResumos(base({
      despesas: [lote('despesas', 'sede', 2026, 3, [{ valor: 300, categoria: 'Renda' }])],
      assistencia: [lote('assistencia', 'almada', 2026, 3, [{ valor: 100 }]), lote('assistencia', 'porto', 2026, 3, [{ valor: 50 }]), sabado],
    }));
    expect(mes(rs, 'porto', 3).adultosMedia).toBe(50);
    expect(mes(rs, 'porto', 3).adultosMedia12m).toBe(50);
    expect(mes(rs, 'porto', 3).geralSaidas).toBe(100);
  });

  it('com o tipo de celebração configurado, conta só esse tipo, em qualquer dia', () => {
    const a = (com: string, regs: { data: string; valor: number; evento: string }[]): Lote => {
      const l = lote('assistencia', com, 2026, 3, regs.map((r) => ({ valor: r.valor })));
      l.registos = l.registos.map((r, i) => ({ ...r, data: regs[i].data, evento: regs[i].evento }));
      return l;
    };
    const rs = calcularResumos(base({
      eventoCelebracao: 'Celebração de Domingo',
      despesas: [lote('despesas', 'sede', 2026, 3, [{ valor: 300, categoria: 'Renda' }])],
      assistencia: [
        a('almada', [{ data: '2026-03-07', valor: 100, evento: 'celebração de domingo' }, { data: '2026-03-08', valor: 999, evento: 'Batismos' }]),
        a('porto', [{ data: '2026-03-08', valor: 50, evento: 'Celebração de Domingo' }]),
      ],
      contribuir: [lote('contribuir', 'bolsa-geral', 2026, 3, [{ valor: 150 }])],
    }));
    expect(mes(rs, 'almada', 3).adultosMedia).toBe(100); // sábado conta (tipo certo); domingo de Batismos não
    expect(mes(rs, 'almada', 3).adultosMedia12m).toBe(100);
    expect(mes(rs, 'almada', 3).geralSaidas).toBe(200);
    expect(mes(rs, 'almada', 3).quotaBolsa).toBe(100);
  });

  it('janeiro usa a assistência do ano anterior', () => {
    const rs = calcularResumos(base({
      despesas: [lote('despesas', 'sede', 2026, 1, [{ valor: 120, categoria: 'Renda' }])],
      assistencia: [lote('assistencia', 'porto', 2026, 1, [{ valor: 30 }])],
      assistenciaAnterior: [lote('assistencia', 'almada', 2025, 12, [{ valor: 90 }]), lote('assistencia', 'almada', 2025, 1, [{ valor: 1000 }])],
    }));
    expect(mes(rs, 'almada', 1).geralSaidas).toBe(90);
    expect(mes(rs, 'porto', 1).geralSaidas).toBe(30);
  });

  it('comunidade inativa não recebe e a sua despesa geral sai dela', () => {
    const rs = calcularResumos(base({
      despesas: [lote('despesas', 'barreiro', 2026, 11, [{ valor: 100, categoria: 'Renda' }])],
      assistencia: [lote('assistencia', 'barreiro', 2026, 10, [{ valor: 100 }]), lote('assistencia', 'almada', 2026, 11, [{ valor: 100 }])],
    }));
    expect(mes(rs, 'barreiro', 11).saidas).toBe(0);
    expect(mes(rs, 'barreiro', 11).geralSaidas).toBe(0);
    expect(mes(rs, 'almada', 11).geralSaidas).toBe(100);
  });

  it('sem pesos os gerais ficam em "gerais"', () => {
    const rs = calcularResumos(base({ despesas: [lote('despesas', 'sede', 2026, 5, [{ valor: 50, categoria: 'Renda' }])] }));
    expect(mes(rs, 'gerais', 5).saidas).toBe(50);
    expect(mes(rs, 'sede', 5).saidas).toBe(0);
  });

  it('o total CCLX é igual com categorias locais ou gerais', () => {
    const dados = {
      despesas: [lote('despesas', 'sede', 2026, 3, [{ valor: 333.33, categoria: 'Renda' }]), lote('despesas', 'almada', 2026, 4, [{ valor: 10, categoria: 'Material' }])],
      contribuir: [lote('contribuir', 'porto', 2026, 3, [{ valor: 500 }]), lote('contribuir', 'bolsa-geral', 2026, 3, [{ valor: 77.77 }])],
      assistencia: [lote('assistencia', 'almada', 2026, 3, [{ valor: 70 }]), lote('assistencia', 'porto', 2026, 3, [{ valor: 33 }])],
    };
    const comGerais = calcularResumos(base(dados));
    const soLocais = calcularResumos(base({ ...dados, categorias: CATS.map((c) => ({ ...c, ambito: 'local' as const })) }));
    expect(somaSaldos(comGerais)).toBe(somaSaldos(soLocais));
    expect(mes(comGerais, 'almada', 3).geralSaidas + mes(comGerais, 'porto', 3).geralSaidas).toBeCloseTo(333.33, 2);
  });

  it('custo fixo geral confidencial só aparece como "Outros custos de funcionamento"', () => {
    const cf: CustoFixo = { id: 'v', comunidadeId: 'sede', rubrica: 'Vencimentos', valorMensal: 1000, inicio: '2026-01', fim: null, nivel: 'confidencial' };
    const rs = calcularResumos(base({ custosFixos: [cf], assistencia: [lote('assistencia', 'almada', 2026, 2, [{ valor: 10 }])] }));
    expect(mes(rs, 'almada', 2).rubricas.saida[OUTROS_FUNCIONAMENTO].geral).toBe(1000);
    expect(mes(rs, 'sede', 2).saidas).toBe(0);
    expect(rs.some((r) => r.meses.some((x) => 'Vencimentos e encargos' in x.rubricas.saida))).toBe(false);
  });

  it('categoria desconhecida fica local em "Outros rendimentos"', () => {
    const rs = calcularResumos(base({ contribuir: [lote('contribuir', 'almada', 2026, 7, [{ valor: 12.9, categoria: 'Pagamentos Livraria' }])] }));
    expect(mes(rs, 'almada', 7).rubricas.entrada['Outros rendimentos'].local).toBe(12.9);
    expect(mes(rs, 'almada', 7).entradas).toBe(12.9);
  });

  it('a quota da bolsa geral entra nas rubricas da comunidade', () => {
    const rs = calcularResumos(base({
      contribuir: [lote('contribuir', 'bolsa-geral', 2026, 6, [{ valor: 100, categoria: 'Dízimos' }])],
      assistencia: [lote('assistencia', 'almada', 2026, 6, [{ valor: 30 }]), lote('assistencia', 'porto', 2026, 6, [{ valor: 10 }])],
    }));
    expect(mes(rs, 'almada', 6).rubricas.entrada['Dízimos'].local).toBe(75);
    expect(mes(rs, 'porto', 6).rubricas.entrada['Dízimos'].local).toBe(25);
  });

  it('página pública: "gerais" conta no total CCLX mas não é uma comunidade', () => {
    const rs = calcularResumos(base({ despesas: [lote('despesas', 'sede', 2026, 5, [{ valor: 20, categoria: 'Renda' }, { valor: 20, categoria: 'Renda' }, { valor: 10, categoria: 'Renda' }])] }));
    const fechados = new Set(['2026-05']);
    expect(calcularPublico(2026, rs, COMS, fechados).comunidades.some((c) => c.id === 'gerais')).toBe(false);
    expect(calcularPublicoSite(2026, rs, fechados).site.meses[0].outrasDespesas).toBe(50);
  });

  it('página pública por comunidade usa os valores já repartidos', () => {
    const rs = calcularResumos(base({
      despesas: [lote('despesas', 'sede', 2026, 3, [{ valor: 90, categoria: 'Renda' }, { valor: 1, categoria: 'Material' }, { valor: 1, categoria: 'Material' }, { valor: 1, categoria: 'Material' }])],
      assistencia: [lote('assistencia', 'almada', 2026, 3, [{ valor: 20 }]), lote('assistencia', 'porto', 2026, 3, [{ valor: 10 }])],
    }));
    const pub = calcularPublico(2026, rs, COMS, new Set(['2026-03']));
    const linha = (c: string) => pub.comunidades.find((x) => x.id === c)!.meses[0];
    expect(linha('sede').outrasDespesas).toBe(3);
    expect(linha('almada').saldo).toBe(-60);
    expect(mes(rs, 'sede', 3).cedidoGeral.despesas).toBe(90);
  });

  it('partes do mês somam ao saldo (Painel, Exportação, Orçamento)', () => {
    const cf: CustoFixo = { id: 'r', comunidadeId: 'sede', rubrica: 'Renda', valorMensal: 300, inicio: '2026-01', fim: null, nivel: 'privado' };
    const rs = calcularResumos(base({
      custosFixos: [cf],
      despesas: [lote('despesas', 'almada', 2026, 3, [{ valor: 40, categoria: 'Material' }])],
      contribuir: [lote('contribuir', 'almada', 2026, 3, [{ valor: 500 }])],
      assistencia: [lote('assistencia', 'almada', 2026, 3, [{ valor: 20 }]), lote('assistencia', 'porto', 2026, 3, [{ valor: 10 }])],
    }));
    for (const c of ['almada', 'porto', 'sede']) {
      const x = mes(rs, c, 3);
      const p = partesMes(x);
      expect(Math.round((p.entradas - p.custosFixos - p.despesas - p.gerais) * 100) / 100).toBe(x.saldo);
    }
    expect(partesMes(mes(rs, 'sede', 3)).custosFixos).toBe(0);
    expect(partesMes(mes(rs, 'almada', 3)).gerais).toBe(200);
  });
});
