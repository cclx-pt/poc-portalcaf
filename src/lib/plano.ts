/**
 * Plano financeiro da CCLX (Proposta de Plano Financeiro de Gestão, v2.1):
 * tipos, rubricas e categorias com código, centros de custo, fornecedores e contas analíticas.
 * Serve para carregar o catálogo na Configuração; depois disso o catálogo é editável.
 */
import { slug } from './format';
import type { Categoria, Dimensao } from './types';

export type Grupo = 'despesa' | 'receita' | 'financeiro';
export interface RubricaPlano { codigo: string; nome: string; grupo: Grupo }

export const RUBRICAS_PLANO: RubricaPlano[] = [
  { codigo: '01', nome: 'Pessoal', grupo: 'despesa' },
  { codigo: '02', nome: 'Instalações', grupo: 'despesa' },
  { codigo: '03', nome: 'Administração e Tecnologia', grupo: 'despesa' },
  { codigo: '04', nome: 'Operações e Cultos', grupo: 'despesa' },
  { codigo: '05', nome: 'Ministérios e Formação', grupo: 'despesa' },
  { codigo: '06', nome: 'Eventos', grupo: 'despesa' },
  { codigo: '07', nome: 'Missões e Apoio Social', grupo: 'despesa' },
  { codigo: '08', nome: 'Investimentos', grupo: 'despesa' },
  { codigo: '09', nome: 'Outros Gastos', grupo: 'despesa' },
  { codigo: 'R1', nome: 'Dízimos e ofertas', grupo: 'receita' },
  { codigo: 'R2', nome: 'Atividades e serviços', grupo: 'receita' },
  { codigo: 'R3', nome: 'Apoios e donativos', grupo: 'receita' },
  { codigo: 'F1', nome: 'Transferências e depósitos', grupo: 'financeiro' },
  { codigo: 'F2', nome: 'Financiamento', grupo: 'financeiro' },
  { codigo: 'F3', nome: 'Adiantamentos e reembolsos', grupo: 'financeiro' },
];

/** [código, nome] de cada categoria; a rubrica é o código antes do ponto. 02.08 e 03.07 acrescentadas pelo CAF (18/11/2026). */
export const CATEGORIAS_PLANO: [string, string][] = [
  ['01.01', 'Remunerações e subsídios'], ['01.02', 'Segurança Social e retenções'], ['01.03', 'Seguros de trabalho'], ['01.04', 'Serviços contratados'], ['01.05', 'Deslocações de pessoal'],
  ['02.01', 'Rendas e condomínios'], ['02.02', 'Energia e água'], ['02.03', 'Comunicações'], ['02.04', 'Limpeza e higiene'], ['02.05', 'Manutenção e inspeções'], ['02.06', 'Segurança e seguros'], ['02.07', 'Equipamentos em aluguer'], ['02.08', 'Impostos prediais'],
  ['03.01', 'Contabilidade e assessoria'], ['03.02', 'Jurídico e registos'], ['03.03', 'Bancos e pagamentos'], ['03.04', 'Software e subscrições'], ['03.05', 'Associações e quotas'], ['03.06', 'Escritório e correios'], ['03.07', 'Taxas'],
  ['04.01', 'Cultos e sacramentos'], ['04.02', 'Som, louvor e multimédia'], ['04.03', 'Hospitalidade e representação'], ['04.04', 'Viaturas e transportes'], ['04.05', 'Consumíveis e utensílios'], ['04.06', 'Bar e livraria (custo)'], ['04.07', 'Equipamentos e manutenção corrente'],
  ['05.01', 'Ensino e discipulado'], ['05.02', 'Crianças e jovens'], ['05.03', 'Homens e mulheres'], ['05.04', 'Ação social ministerial'], ['05.05', 'Outras atividades ministeriais'],
  ['06.01', 'Alojamento e espaços'], ['06.02', 'Alimentação e catering'], ['06.03', 'Produção e decoração'], ['06.04', 'Materiais e consumíveis'], ['06.05', 'Transporte e deslocações'], ['06.06', 'Inscrições e serviços'], ['06.07', 'Reembolsos e ajustes de eventos'],
  ['07.01', 'Apoio missionário'], ['07.02', 'Apoio social'], ['07.03', 'Donativos a entidades'], ['07.04', 'Apoios individuais'],
  ['08.01', 'Obras e beneficiações'], ['08.02', 'Mobiliário'], ['08.03', 'Equipamento técnico'], ['08.04', 'Tecnologia e informática'], ['08.05', 'Viaturas e outros ativos'],
  ['09.01', 'Gastos extraordinários'], ['09.02', 'Regularizações de gastos'], ['09.03', 'Outros gastos identificados'],
  ['R1.01', 'Dízimos'], ['R1.02', 'Ofertas gerais'], ['R1.03', 'Ofertas consignadas'],
  ['R2.01', 'Eventos e inscrições'], ['R2.02', 'Bar e livraria'], ['R2.03', 'Cedência de espaços'], ['R2.04', 'Venda de ativos'],
  ['R3.01', 'Apoios missionários recebidos'], ['R3.02', 'Donativos e outros apoios'],
  ['F1.01', 'Transferências internas'], ['F1.02', 'Depósitos de numerário'], ['F1.03', 'Regularização de tesouraria'],
  ['F2.01', 'Empréstimos recebidos'], ['F2.02', 'Amortizações de empréstimos'],
  ['F3.01', 'Adiantamentos'], ['F3.02', 'Reembolsos e estornos'],
];

/** Decisão do CAF (18/11/2026): tudo privado, exceto vencimentos e donativos. */
export const CONFIDENCIAIS = ['01.01', '07.03', 'R3.02'];

/**
 * Nomes usados hoje nos registos do Jotform (Contribuir, depósitos, reembolsos) e as categorias do plano a que correspondem.
 * Proposta inicial, editável na Configuração (campo "sinónimos" de cada categoria).
 */
export const SINONIMOS: Record<string, string[]> = {
  'R1.01': ['Dízimos', 'Dízimo'],
  'R1.02': ['Ofertas', 'Oferta', 'Coletas em dinheiro', 'Transferências'],
  'R1.03': ['Missões', 'Obras', 'Oferta Missionária'],
  'R2.01': ['Eventos'],
  '07.01': ['Missões'],
  '07.02': ['Apoio Familiar (Cabazes, apoio alimentar)', 'Ação social'],
  '08.01': ['Obras', 'ObrasMoita 2.0'],
  '02.04': ['Limpeza'],
  '04.03': ['Refeições/Catering'],
  '04.04': ['Despesas com Transportes'],
  '04.05': ['Economato'],
  '05.03': ['Alcateia'],
  '06.01': ['Aluguer de Espaço (Custo com colaboradores)'],
  '06.04': ['Eventos'],
  '09.03': ['Outro (especificar detalhes no evento)'],
};

export const CENTROS_CUSTO: [string, string, string][] = [
  ['CC01', 'CAF / Administração', 'Central'], ['CC02', 'Operações locais', 'Local'], ['CC03', 'Pessoal', 'Transversal'],
  ['CC04', 'ED', 'Ministério'], ['CC05', 'LOGOS', 'Ministério'], ['CC06', 'B1', 'Ministério'], ['CC07', 'JUMP', 'Ministério'],
  ['CC08', 'Alcateia', 'Ministério'], ['CC09', 'GLAM', 'Ministério'], ['CC10', 'Desafios com Esperança', 'Ministério'], ['CC11', 'Missões', 'Ministério'],
  ['CC12', 'Eventos', 'Evento'], ['CC13', 'Bar', 'Atividade'], ['CC14', 'Livraria', 'Atividade'], ['CC15', 'Obras e projetos', 'Projeto'],
];

/** Catálogo inicial de contas analíticas e fornecedores (secção 6 da proposta). */
export const CONTAS_ANALITICAS: [string, string][] = [
  ['02.03', 'Internet e telecomunicações'], ['02.02', 'Eletricidade'], ['03.04', 'Colaboração e produtividade'],
  ['03.04', 'Videoconferência'], ['03.04', 'Alojamento web'], ['03.04', 'Gestão de igreja'], ['02.06', 'Alarmes e vigilância'],
];
export const FORNECEDORES = ['MEO', 'Vodafone', 'NOS', 'EDP', 'Endesa', 'Google Workspace', 'Zoom', 'Hostinger', 'InChurch', 'Securitas Direct'];

const rubricaDe = (codigo: string) => RUBRICAS_PLANO.find((r) => r.codigo === codigo.split('.')[0])!;
export const nomeRubrica = (r: RubricaPlano) => `${r.codigo} ${r.nome}`;
const TIPO: Record<Grupo, Categoria['tipo']> = { despesa: 'saida', receita: 'entrada', financeiro: 'financeiro' };

/** Categorias do plano, prontas a gravar na coleção categorias. */
export function categoriasDoPlano(): Categoria[] {
  return CATEGORIAS_PLANO.map(([codigo, nome]) => {
    const r = rubricaDe(codigo);
    return {
      id: `plano-${codigo.replace('.', '-').toLowerCase()}`, codigo, nome: `${codigo} ${nome}`, tipo: TIPO[r.grupo], atividade: r.nome,
      nivel: CONFIDENCIAIS.includes(codigo) ? 'confidencial' : 'privado', snc: '', origem: 'plano', ativo: true,
      rubrica: nomeRubrica(r), ambito: 'local', sinonimos: SINONIMOS[codigo] ?? [],
    };
  });
}

/** Centros de custo, fornecedores e contas analíticas iniciais. Os projetos começam vazios. */
export function dimensoesDoPlano(): Dimensao[] {
  return [
    ...CENTROS_CUSTO.map(([codigo, nome, ambito]): Dimensao => ({ id: `centro-${codigo.toLowerCase()}`, tipo: 'centro', codigo, nome, ambito, ativo: true })),
    ...FORNECEDORES.map((nome): Dimensao => ({ id: `fornecedor-${slug(nome)}`, tipo: 'fornecedor', nome, ativo: true })),
    ...CONTAS_ANALITICAS.map(([categoria, nome]): Dimensao => ({ id: `conta-${slug(nome)}`, tipo: 'conta', nome, categoria, ativo: true })),
  ];
}

// ---------- Nova categoria (Configuração ADM-01.1): tipo → rubrica → código seguinte → nome ----------

/** Rubricas do plano de um tipo (Despesa: 01 a 09; Receita: R1 a R3; Financeiro: F1 a F3). */
export const rubricasDoTipo = (tipo: Categoria['tipo']) => RUBRICAS_PLANO.filter((r) => TIPO[r.grupo] === tipo);

/** Código seguinte ao maior já usado na rubrica, contando as categorias inativas (ex.: 02.09; sem nenhuma, 02.01). */
export function proximoCodigo(rubrica: string, categorias: Pick<Categoria, 'codigo'>[]): string {
  const usados = categorias.map((c) => c.codigo ?? '').filter((c) => c.startsWith(`${rubrica}.`)).map((c) => Number(c.slice(rubrica.length + 1))).filter(Number.isFinite);
  return `${rubrica}.${String(Math.max(0, ...usados) + 1).padStart(2, '0')}`;
}

/** Nova categoria a partir da rubrica e do texto do nome: o código seguinte, o tipo e a rubrica vêm do plano. */
export function novaCategoria(rubrica: string, texto: string, categorias: Pick<Categoria, 'codigo'>[]): Categoria {
  const r = RUBRICAS_PLANO.find((x) => x.codigo === rubrica);
  if (!r) throw new Error('Escolha a rubrica.');
  const codigo = proximoCodigo(rubrica, categorias);
  return {
    id: `plano-${codigo.replace('.', '-').toLowerCase()}`, codigo, nome: `${codigo} ${texto.replace(/\s+/g, ' ').trim()}`, tipo: TIPO[r.grupo], atividade: r.nome,
    nivel: 'privado', snc: '', origem: 'portal', ativo: true, rubrica: nomeRubrica(r), ambito: 'local', sinonimos: [],
  };
}
