/**
 * Importação dos custos fixos a partir do Excel "Custos por Comunidade":
 * colunas Site, Rúbrica, Incidência % e uma coluna por ano (valor mensal desse ano).
 * Cada ano com valor dá um custo fixo desse ano (campo ano), de janeiro a dezembro.
 * Os nomes das pessoas saem das rubricas (vencimentos sem nomes); vencimentos e encargos são confidenciais.
 */
import { norm, parseNumero, r2, slug } from './format';
import type { Comunidade, CustoFixo, Nivel } from './types';

type Linha = Record<string, unknown>;

/** "Site" Geral: custos partilhados por toda a CCLX, lançados na Sede e repartidos pela assistência. */
export const SITE_GERAL = 'geral';
const COMUNIDADE_DOS_GERAIS = 'sede';

const coluna = (l: Linha, ...nomes: string[]) => {
  const k = Object.keys(l).find((c) => nomes.some((n) => norm(c).startsWith(n)));
  return k ? l[k] : undefined;
};

/** Rubrica sem nomes de pessoas, com a grafia corrigida, e se é confidencial (vencimentos e encargos). */
export function limparRubrica(texto: string): { rubrica: string; confidencial: boolean } {
  let t = texto.replace(/\s+/g, ' ').trim().replace(/Vencimendo/gi, 'Vencimento');
  const ss = /imposto mensal seguran[cç]a social/i.test(t);
  t = t.replace(/imposto mensal seguran[cç]a social/i, '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  const n = norm(t);
  let rubrica: string;
  let confidencial = false;
  if (n.startsWith('vencimento') || n.includes('multimedi') || (n.includes('elemento') && n.includes('tesouraria'))) {
    confidencial = true;
    if (n.includes('multimedi')) rubrica = 'Vencimento Multimédia';
    else if (n.includes('tesouraria')) rubrica = 'Vencimento Tesouraria e Administração';
    else if (n.includes('obreiro')) rubrica = 'Vencimento Obreiro';
    else if (n.includes('pastoral')) rubrica = 'Vencimento Pastoral';
    else rubrica = 'Vencimento';
  } else if (n.includes('plafond') && n.includes('desloca')) { rubrica = 'Plafond deslocação pastoral'; confidencial = true; }
  else if (n.includes('desloca')) { rubrica = 'Deslocação pastoral (donativo)'; confidencial = true; }
  else if (n.includes('imposto') && n.includes('renda')) rubrica = 'Imposto sobre a renda';
  else if (n === 'renda') rubrica = 'Renda';
  else if (n === 'agua') rubrica = 'Água';
  else if (n === 'luz') rubrica = 'Luz';
  else if (n.startsWith('comunica')) rubrica = 'Comunicações';
  else if (n.includes('prosegur')) rubrica = 'Alarme (Prosegur)';
  else if (n.includes('securitas')) rubrica = 'Alarme (Securitas)';
  else if (n.includes('anticimex') || n.includes('pragas')) rubrica = 'Controlo de pragas (Anticimex)';
  else if (n.includes('culligan')) rubrica = 'Água (Culligan)';
  else if (n.includes('apolice') || n.includes('recheio')) rubrica = 'Seguro de recheio';
  else if (n.includes('condominio')) rubrica = 'Condomínio';
  else rubrica = t.charAt(0).toUpperCase() + t.slice(1);
  if (ss) return { rubrica: `Segurança Social · ${rubrica}`, confidencial: true };
  return { rubrica, confidencial };
}

const nivelDe = (rubrica: string, confidencial: boolean): Nivel =>
  confidencial ? 'confidencial' : ['Luz', 'Água', 'Comunicações'].includes(rubrica) ? 'publico' : 'privado';

export interface ResultadoImportacao { custos: CustoFixo[]; avisos: string[]; anos: number[] }

export function importarCustosFixos(linhas: Linha[], comunidades: Comunidade[]): ResultadoImportacao {
  const avisos: string[] = [];
  const anos = [...new Set(linhas.flatMap((l) => Object.keys(l).filter((k) => /^\d{4}$/.test(k.trim())).map((k) => Number(k))))].sort();
  const porNome = (site: string) => {
    if (norm(site) === SITE_GERAL) return comunidades.find((c) => c.id === COMUNIDADE_DOS_GERAIS);
    return comunidades.find((c) => !c.especial && (norm(c.nome) === norm(site) || c.id === slug(site)));
  };
  const vistas = new Set<string>();
  const ids = new Map<string, number>();
  const custos: CustoFixo[] = [];

  linhas.forEach((l, i) => {
    const site = String(coluna(l, 'site', 'comunidade') ?? '').trim();
    const original = String(coluna(l, 'rubrica', 'rúbrica') ?? '').trim();
    if (!site && !original) return;
    const linhaN = i + 2; // linha no Excel (a 1 é o cabeçalho)
    const com = porNome(site);
    if (!com) { avisos.push(`Linha ${linhaN}: comunidade "${site}" não existe no portal; linha ignorada.`); return; }
    if (!original) { avisos.push(`Linha ${linhaN}: sem rubrica; linha ignorada.`); return; }
    const geral = norm(site) === SITE_GERAL;
    const { rubrica, confidencial } = limparRubrica(original);
    const valores = anos.map((a) => ({ a, v: r2(parseNumero(l[String(a)] ?? l[` ${a}`])) }));
    const chave = `${site}|${rubrica}|${valores.map((x) => x.v).join('|')}`;
    if (vistas.has(norm(chave))) { avisos.push(`Linha ${linhaN}: ${site} · ${rubrica} repetida (mesmos valores); importada só uma vez. Pendente de confirmação.`); return; }
    vistas.add(norm(chave));
    let inc = parseNumero(coluna(l, 'incidencia') ?? 1);
    if (!Number.isFinite(inc)) inc = 1;
    const incidencia = r2(inc <= 1 ? inc * 100 : inc);
    const base = `imp-${com.id}-${slug(rubrica)}`;
    const k = (ids.get(base) ?? 0) + 1;
    ids.set(base, k);
    const prefixo = k > 1 ? `${base}-${k}` : base;
    const fimCom = com.fim ? com.fim.slice(0, 7) : null;
    for (const { a, v } of valores) {
      if (!Number.isFinite(v)) { if (l[String(a)] != null && l[String(a)] !== '') avisos.push(`Linha ${linhaN}: valor de ${a} ilegível ("${String(l[String(a)])}"); ano ignorado.`); continue; }
      if (v <= 0) continue;
      const inicio = `${a}-01`;
      let fim: string = `${a}-12`;
      if (fimCom && inicio > fimCom) { avisos.push(`Linha ${linhaN}: ${com.nome} termina em ${fimCom.split('-').reverse().join('/')}; o valor de ${a} (${rubrica}) não foi importado. Pendente de confirmação.`); continue; }
      if (fimCom && fim > fimCom) fim = fimCom;
      const c: CustoFixo = {
        id: `${prefixo}-${a}`, comunidadeId: com.id, rubrica, ano: a, valorMensal: v, incidencia, inicio, fim, nivel: nivelDe(rubrica, confidencial),
      };
      const notas = [incidencia !== 100 ? `Custo partilhado: ${incidencia}% imputado a esta comunidade.` : '', geral ? 'Custo geral (CCLX): repartido pelas comunidades conforme a assistência.' : ''].filter(Boolean).join(' ');
      if (notas) c.notas = notas;
      if (geral) c.ambito = 'geral';
      custos.push(c);
    }
  });
  return { custos, avisos, anos };
}
