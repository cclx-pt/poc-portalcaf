import { doc, writeBatch } from 'firebase/firestore';
import { db, lerConfigAssistencia, listarBanco, listarCategorias, listarComunidades, listarCustosFixos, listarFechos, listarLotes, auditar, type Acesso } from './db';
import { calcularPublico, calcularPublicoSite, calcularResumosComReais } from './resumos';
import { hoje } from './format';
import { listarPesos, pesosParaCalculo } from './pesos';

/** Recalcula os resumos de um ano e a página pública. Só master e CAF (precisa de dados confidenciais). */
export async function recalcularAno(a: Acesso, ano: number) {
  const [comunidades, contribuir, depositos, despesas, assistencia, banco, custosFixos, fechos, categorias, assistenciaAnterior, configAss, pesos] = await Promise.all([
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
  ]);
  const mesesFechados = new Set(fechos.filter((f) => f.estado === 'fechado').map((f) => f.periodo));
  const resumos = calcularResumosComReais({ ano, comunidades, contribuir, depositos, despesas, assistencia, banco, custosFixos, mesesFechados, hoje: hoje(), categorias, assistenciaAnterior, eventoCelebracao: configAss.eventoCelebracao, pesosGravados: pesosParaCalculo(pesos) });
  const publico = calcularPublico(ano, resumos, comunidades, mesesFechados);
  const site = calcularPublicoSite(ano, resumos, mesesFechados);
  const b = writeBatch(db);
  for (const r of resumos) b.set(doc(db, 'resumos', r.id), { ...r, calculadoPor: a.email });
  b.set(doc(db, 'publico', String(ano)), site); // aberto: só o consolidado CCLX
  b.set(doc(db, 'publico_sites', String(ano)), publico); // com login: por comunidade
  await b.commit();
  await auditar(a.email, 'recalcular', `Resumos e página pública de ${ano}`);
  return { resumos, publico };
}
