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
  mesesFechados: new Set(), regraFechados: false, hoje: '2026-11-13', categorias: CATS, assistenciaAnterior: [], ...x,
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

  it('custo fixo com âmbito geral (ex.: lançado na Sede) é repartido pela assistência, com a incidência', () => {
    const cf: CustoFixo = { id: 'g', comunidadeId: 'sede', rubrica: 'Vencimento Multimédia', valorMensal: 600, incidencia: 50, ambito: 'geral', inicio: '2026-03', fim: '2026-03', nivel: 'confidencial' };
    const rs = calcularResumos(base({
      custosFixos: [cf],
      assistencia: [lote('assistencia', 'almada', 2026, 3, [{ valor: 100 }]), lote('assistencia', 'porto', 2026, 3, [{ valor: 50 }])],
    }));
    expect(mes(rs, 'almada', 3).geralSaidas).toBe(200);
    expect(mes(rs, 'porto', 3).geralSaidas).toBe(100);
    expect(mes(rs, 'sede', 3).saidas).toBe(0);
    expect(mes(rs, 'almada', 3).rubricas.saida[OUTROS_FUNCIONAMENTO].geral).toBe(200); // confidencial: agregado
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

  it('a quota da bolsa geral entra nas rubricas da comunidade, sempre em "Outros rendimentos"', () => {
    const rs = calcularResumos(base({
      contribuir: [lote('contribuir', 'bolsa-geral', 2026, 6, [{ valor: 100, categoria: 'Dízimos' }])],
      assistencia: [lote('assistencia', 'almada', 2026, 6, [{ valor: 30 }]), lote('assistencia', 'porto', 2026, 6, [{ valor: 10 }])],
    }));
    // Entradas sem comunidade: rubrica "Outros rendimentos", seja qual for a categoria (decisão do CAF).
    expect(mes(rs, 'almada', 6).rubricas.entrada['Outros rendimentos'].local).toBe(75);
    expect(mes(rs, 'porto', 6).rubricas.entrada['Outros rendimentos'].local).toBe(25);
    expect(mes(rs, 'almada', 6).rubricas.entrada['Dízimos']).toBeUndefined();
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

describe('comunidade Geral (bolsa-geral) nos custos fixos', () => {
  it('um custo fixo da Geral é sempre repartido pelas comunidades (nunca fica na Geral), mesmo sem âmbito definido', () => {
    const cf: CustoFixo = { id: 'g1', comunidadeId: 'bolsa-geral', rubrica: 'Contabilidade', valorMensal: 300, ano: 2026, inicio: '2026-03', fim: '2026-03', nivel: 'privado' };
    const rs = calcularResumos(base({
      custosFixos: [cf],
      assistencia: [lote('assistencia', 'almada', 2026, 3, [{ valor: 100 }]), lote('assistencia', 'porto', 2026, 3, [{ valor: 50 }])],
    }));
    expect(mes(rs, 'almada', 3).geralSaidas).toBe(200);
    expect(mes(rs, 'porto', 3).geralSaidas).toBe(100);
    expect(mes(rs, 'bolsa-geral', 3).geralSaidas).toBe(0);
    expect(mes(rs, 'bolsa-geral', 3).saidas).toBe(0);
  });
});

describe('plano financeiro nos resultados', () => {
  it('movimentos do banco: categorias do plano dão a rubrica; os financeiros não entram nos resultados', async () => {
    const { categoriasDoPlano } = await import('../../src/lib/plano');
    const mov = (id: string, valor: number, categoria: string) => ({ id, data: '2026-03-10', descricao: id, valor, categoria, comunidadeId: 'almada', contabilizar: true });
    const banco = [{ id: 'b', contaId: 'cgd', ano: 2026, mes: 3, periodo: '2026-03', atualizadoEm: '', atualizadoPor: '', registos: [
      mov('net', -45, '02.03 Comunicações'), mov('dep', 500, 'F1.02 Depósitos de numerário'), mov('of', 100, 'R1.02 Ofertas gerais'),
    ] }];
    const rs = calcularResumos(base({ categorias: categoriasDoPlano(), banco }));
    const m = mes(rs, 'almada', 3);
    expect(m.rubricas.saida['02 Instalações'].local).toBe(45);
    expect(m.rubricas.entrada['R1 Dízimos e ofertas'].local).toBe(100);
    expect(m.transferencias).toBe(100);
    expect(m.despesas).toBe(45);
  });
});

describe('movimentos repartidos', () => {
  it('um movimento do banco com partes conta em cada comunidade pelo valor da parte', async () => {
    const { categoriasDoPlano } = await import('../../src/lib/plano');
    const banco = [{ id: 'b', contaId: 'cgd', ano: 2026, mes: 3, periodo: '2026-03', atualizadoEm: '', atualizadoPor: '', registos: [
      { id: 'ss', data: '2026-03-10', descricao: 'TSU', valor: -300, categoria: '01.02 Segurança Social e retenções', contabilizar: true, partes: [{ comunidadeId: 'almada', valor: -100 }, { comunidadeId: 'porto', valor: -200 }] },
    ] }];
    const rs = calcularResumos(base({ categorias: categoriasDoPlano(), banco }));
    expect(mes(rs, 'almada', 3).despesas).toBe(100);
    expect(mes(rs, 'porto', 3).despesas).toBe(200);
    expect(mes(rs, 'porto', 3).rubricas.saida['01 Pessoal'].local).toBe(200);
  });
});

describe('comissão IFTHENPAY (Contribuir com líquido)', () => {
  it('a diferença entre o valor e o líquido é um gasto 03.07 Taxas da comunidade', async () => {
    const { categoriasDoPlano } = await import('../../src/lib/plano');
    const l = lote('contribuir', 'almada', 2026, 3, [{ valor: 50, categoria: 'Dízimos' }]);
    l.registos[0].extra = { liquido: 48.9 };
    const rs = calcularResumos(base({ categorias: categoriasDoPlano(), contribuir: [l] }));
    const m = mes(rs, 'almada', 3);
    expect(m.contribuir).toBe(50);
    expect(m.despesas).toBe(1.1);
    expect(m.despesasPorCategoria['03.07 Taxas']).toBe(1.1);
    expect(m.rubricas.saida['03 Administração e Tecnologia'].local).toBe(1.1);
  });
});

describe('meses fechados e previsão dos custos fixos', () => {
  it('mês fechado: valores reais sem custos fixos; mês aberto: só a previsão dos custos fixos, marcada', () => {
    const cf: CustoFixo = { id: 'r', comunidadeId: 'almada', rubrica: 'Renda', valorMensal: 500, ano: 2026, inicio: '2026-01', fim: '2026-12', nivel: 'privado' };
    const rs = calcularResumos(base({
      regraFechados: true, mesesFechados: new Set(['2026-01']), custosFixos: [cf],
      contribuir: [lote('contribuir', 'almada', 2026, 1, [{ valor: 100 }]), lote('contribuir', 'almada', 2026, 2, [{ valor: 70 }])],
      despesas: [lote('despesas', 'almada', 2026, 2, [{ valor: 30, categoria: 'Material' }])],
    }));
    const jan = mes(rs, 'almada', 1); const fev = mes(rs, 'almada', 2); const dez = mes(rs, 'almada', 12);
    expect([jan.previsao, jan.contribuir, jan.custosFixos]).toEqual([false, 100, 0]);
    expect([fev.previsao, fev.contribuir, fev.despesas, fev.custosFixos]).toEqual([true, 0, 0, 500]);
    expect([dez.previsao, dez.custosFixos]).toEqual([true, 500]); // a previsão cobre o ano todo
  });
});

describe('texto dos meses fechados e da previsão', () => {
  it('diz até quando há valores reais e que o resto é previsão dos custos fixos', async () => {
    const { estadoMeses, textoMeses } = await import('../../src/lib/resumos');
    const r = (fechados: number[]) => [{ id: 'x', ano: 2026, comunidadeId: 'a', calculadoEm: '', calculadoPor: '', meses: Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, previsao: !fechados.includes(i + 1) })) }] as unknown as Resumo[];
    expect(estadoMeses(r([1, 2, 3]))).toEqual({ regra: true, fechados: [1, 2, 3], abertos: [4, 5, 6, 7, 8, 9, 10, 11, 12] });
    expect(textoMeses(2026, estadoMeses(r([1, 2, 3])))).toBe('Valores reais: meses fechados (janeiro a março de 2026). Abril a dezembro (meses abertos): só a previsão dos custos fixos.');
    expect(textoMeses(2026, estadoMeses(r([])))).toBe('Ainda não há meses fechados em 2026: os valores são só a previsão dos custos fixos.');
    expect(textoMeses(2026, estadoMeses(r([1, 3])))).toBe('Valores reais: meses fechados (janeiro e março de 2026). Fevereiro e abril a dezembro (meses abertos): só a previsão dos custos fixos.');
    expect(estadoMeses([{ meses: [{ mes: 1 }] }] as unknown as Resumo[]).regra).toBe(false);
  });
});

describe('comunidade que termina e passa para outra (fusão: Barreiro → Moita)', () => {
  const COMS_F: Comunidade[] = [
    { id: 'almada', nome: 'Almada', ordem: 1 },
    { id: 'moita', nome: 'Moita', ordem: 2 },
    { id: 'barreiro', nome: 'Barreiro', ordem: 3, fim: '2026-07-18', sucessora: 'moita' },
    { id: 'bolsa-geral', nome: 'Geral', ordem: 99, especial: true },
  ];
  const cf = (id: string, com: string): CustoFixo => ({ id, comunidadeId: com, rubrica: 'Renda', valorMensal: 1000, inicio: '2026-01', fim: '2026-10', ano: 2026, nivel: 'privado' });
  it('custos fixos e registos do Barreiro depois do fim contam na Moita; até julho no Barreiro', () => {
    const rs = calcularResumos(base({
      comunidades: COMS_F, custosFixos: [cf('b', 'barreiro')],
      contribuir: [lote('contribuir', 'barreiro', 2026, 7, [{ valor: 70 }]), lote('contribuir', 'barreiro', 2026, 8, [{ valor: 80 }])],
    }));
    expect(mes(rs, 'barreiro', 7).custosFixos).toBe(1000);
    expect(mes(rs, 'barreiro', 7).contribuir).toBe(70);
    expect(mes(rs, 'barreiro', 8).custosFixos).toBe(0);
    expect(mes(rs, 'moita', 8).custosFixos).toBe(1000);
    expect(mes(rs, 'moita', 8).contribuir).toBe(80);
    expect(mes(rs, 'moita', 10).custosFixos).toBe(1000);
    expect(mes(rs, 'moita', 11).custosFixos).toBe(0);
  });
  it('depois da fusão, o peso de 12 meses da Moita soma a assistência do Barreiro (por domingo)', () => {
    const rs = calcularResumos(base({
      comunidades: COMS_F,
      despesas: [lote('despesas', 'almada', 2026, 9, [{ valor: 300, categoria: 'Renda' }]), lote('despesas', 'almada', 2026, 6, [{ valor: 300, categoria: 'Renda' }])],
      assistencia: [lote('assistencia', 'almada', 2026, 6, [{ valor: 100 }]), lote('assistencia', 'moita', 2026, 6, [{ valor: 50 }]), lote('assistencia', 'barreiro', 2026, 6, [{ valor: 50 }])],
    }));
    // Junho (antes do fim): três comunidades, 100 : 50 : 50.
    expect(mes(rs, 'almada', 6).geralSaidas).toBe(150);
    expect(mes(rs, 'barreiro', 6).geralSaidas).toBe(75);
    // Setembro (depois): o Barreiro já não entra; a Moita pesa 50 + 50 = 100, igual a Almada.
    expect(mes(rs, 'almada', 9).geralSaidas).toBe(150);
    expect(mes(rs, 'moita', 9).geralSaidas).toBe(150);
    expect(mes(rs, 'barreiro', 9).geralSaidas).toBe(0);
  });
});

describe('custos fixos previstos (anual e mensal) com a parte do geral', () => {
  it('cada mês tem os custos fixos previstos da comunidade e a sua parte dos custos fixos gerais, mesmo nos meses fechados', () => {
    const cfL: CustoFixo = { id: 'l', comunidadeId: 'almada', rubrica: 'Material', valorMensal: 500, inicio: '2026-01', fim: '2026-12', ano: 2026, nivel: 'privado' };
    const cfG: CustoFixo = { id: 'g', comunidadeId: 'bolsa-geral', rubrica: 'Vencimento Multimédia', valorMensal: 300, inicio: '2026-01', fim: '2026-12', ano: 2026, nivel: 'confidencial' };
    const rs = calcularResumos(base({
      custosFixos: [cfL, cfG], regraFechados: true, mesesFechados: new Set(['2026-03']),
      assistencia: [lote('assistencia', 'almada', 2026, 3, [{ valor: 100 }]), lote('assistencia', 'porto', 2026, 3, [{ valor: 50 }])],
    }));
    expect(mes(rs, 'almada', 3).cfPrevisto).toBe(500);
    expect(mes(rs, 'almada', 3).cfGeralPrevisto).toBe(200);
    expect(mes(rs, 'porto', 3).cfGeralPrevisto).toBe(100);
    expect(mes(rs, 'almada', 3).custosFixos).toBe(0); // mês fechado: conta o real, não a previsão
    expect(mes(rs, 'almada', 4).cfPrevisto).toBe(500);
  });
});

import { aplicarComponentes, TODOS_COMPONENTES } from '../../src/lib/resumos';
describe('Painel: ligar e desligar componentes', () => {
  const t = { entradas: 1150, contribuir: 600, coletas: 300, transferencias: 200, quotaBolsa: 50, geralEntradas: 0, custosFixos: 500, despesas: 200, saldo: 300, geralSaidas: 150, cedidoGeral: { entradas: 0, custosFixos: 0, despesas: 0 } };
  it('com tudo ligado, igual ao resumo', () => {
    const a = aplicarComponentes(t, TODOS_COMPONENTES);
    expect(a.entradas).toBe(1150);
    expect(a.saldo).toBe(1150 - 500 - 200 - 150);
  });
  it('desligar Contribuir e Custos fixos tira-os das entradas, das saídas e do saldo', () => {
    const a = aplicarComponentes(t, { ...TODOS_COMPONENTES, contribuir: false, custosFixos: false });
    expect(a.entradas).toBe(550);
    expect(a.custosFixos).toBe(0);
    expect(a.saldo).toBe(550 - 200 - 150);
  });
  it('só depósitos e reembolsos', () => {
    const a = aplicarComponentes(t, { contribuir: false, depositos: true, transferencias: false, custosFixos: false, despesas: true, gerais: false });
    expect(a.entradas).toBe(300);
    expect(a.saldo).toBe(100);
  });
});

import { calcularResumosComReais } from '../../src/lib/resumos';
describe('Painel: valores reais até hoje (mesesReais)', () => {
  it('os meses abertos têm os valores reais do Jotform em mesesReais, e a previsão em meses', () => {
    const cf: CustoFixo = { id: 'r', comunidadeId: 'almada', rubrica: 'Renda', valorMensal: 500, ano: 2026, inicio: '2026-01', fim: '2026-12', nivel: 'privado' };
    const rs = calcularResumosComReais(base({
      regraFechados: true, mesesFechados: new Set(), custosFixos: [cf], hoje: '2026-02-20',
      contribuir: [lote('contribuir', 'almada', 2026, 2, [{ valor: 70 }])],
      despesas: [lote('despesas', 'almada', 2026, 2, [{ valor: 30, categoria: 'Material' }])],
    }));
    const r = rs.find((x) => x.comunidadeId === 'almada')!;
    expect([r.meses[1].contribuir, r.meses[1].custosFixos]).toEqual([0, 500]);
    expect([r.mesesReais![1].contribuir, r.mesesReais![1].despesas, r.mesesReais![1].custosFixos]).toEqual([70, 30, 500]);
    expect(r.mesesReais![5].custosFixos).toBe(0); // custos fixos só até ao mês corrente
  });
});
