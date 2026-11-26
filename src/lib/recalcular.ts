import { doc, writeBatch } from 'firebase/firestore';
import { db, lerConfigAssistencia, listarBanco, listarCategorias, listarComunidades, listarCustosFixos, listarFechos, listarLotes, auditar, lerTraducaoJotform, type Acesso } from './db';
import { calcularPublico, calcularPublicoSite, calcularResumosComReais } from './resumos';
import { hoje } from './format';
import { listarPesos, pesosParaCalculo } from './pesos';

/** Perfis que podem recalcular resumos, distribuições e a página pública. */
export const PAPEIS_RECALCULAR: Acesso['papel'][] = ['master', 'caf'];

/**
 * Recalcula os resumos de um ano e a página pública. Só Master e CAF (precisa de dados confidenciais).
 * Fica sempre na auditoria: quem, de que ecrã, o ano e o resultado (também as tentativas recusadas e as falhas).
 */
export async function recalcularAno(a: Acesso, ano: number, origem = 'Recalcular') {
  if (!PAPEIS_RECALCULAR.includes(a.papel)) {
    await auditar(a.email, 'recalcular (recusado)', `${origem}: ${ano}, perfil sem permissão`);
    throw new Error('Só os perfis Master e CAF podem recalcular.');
  }
  try {
    return await recalcular(a, ano, origem);
  } catch (e) {
    await auditar(a.email, 'recalcular (falhou)', `${origem}: ${ano}: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}

async function recalcular(a: Acesso, ano: number, origem: string) {
  const [comunidades, contribuir, depositos, despesas, assistencia, banco, custosFixos, fechos, categorias, assistenciaAnterior, configAss, pesos, traducaoJotform] = await Promise.all([
    listarComunidades(),
    listarLotes(a, 'contribuir', ano, true),
    listarLotes(a, 'depositos', ano, true),
    listarLotes(a, 'despesas', ano, true),
    listarLotes(a, 'assistencia', ano, false),
    listarBanco(ano),
    listarCustosFixos(a),
    listarFechos(),
    listarCategorias(),
    listarLotes(a, 'assistencia', ano - 1, false), // média dos últimos 12 meses atravessa o ano
    lerConfigAssistencia(),
    listarPesos(ano),
    lerTraducaoJotform(),
  ]);
  const mesesFechados = new Set(fechos.filter((f) => f.estado === 'fechado').map((f) => f.periodo));
  const resumos = calcularResumosComReais({ ano, comunidades, contribuir, depositos, despesas, assistencia, banco, custosFixos, mesesFechados, hoje: hoje(), categorias, assistenciaAnterior, eventoCelebracao: configAss.eventoCelebracao, pesosGravados: pesosParaCalculo(pesos), traducaoJotform });
  const publico = calcularPublico(ano, resumos, comunidades, mesesFechados);
  const site = calcularPublicoSite(ano, resumos, mesesFechados);
  const b = writeBatch(db);
  for (const r of resumos) b.set(doc(db, 'resumos', r.id), { ...r, calculadoPor: a.email });
  b.set(doc(db, 'publico', String(ano)), site); // aberto: só o consolidado CCLX
  b.set(doc(db, 'publico_sites', String(ano)), publico); // com login: por comunidade
  await b.commit();
  await auditar(a.email, 'recalcular', `${origem}: resumos e página pública de ${ano} (${resumos.length} resumos; ${[...mesesFechados].filter((p) => p.startsWith(`${ano}-`)).length} meses fechados; ${pesos.length} meses com pesos gravados)`);
  return { resumos, publico };
}
