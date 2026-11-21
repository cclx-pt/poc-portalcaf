import { doc, writeBatch } from 'firebase/firestore';
import { db, lerConfigAssistencia, listarBanco, listarCategorias, listarComunidades, listarCustosFixos, listarFechos, listarFotosFecho, listarLotes, auditar, type Acesso } from './db';
import { aplicarFotos, calcularPublico, calcularPublicoSite, calcularResumos, fotografar } from './resumos';
import { hoje, periodo } from './format';

/**
 * Recalcula os resumos de um ano e a página pública. Só master e CAF (precisa de dados confidenciais).
 * Os meses fechados usam a fotografia do fecho; os que ainda não a têm (ou o mês em `fotografarPeriodo`) ficam fotografados agora.
 */
export async function recalcularAno(a: Acesso, ano: number, fotografarPeriodo?: string) {
  const [comunidades, contribuir, depositos, despesas, assistencia, banco, custosFixos, fechos, categorias, assistenciaAnterior, configAss, fotos0] = await Promise.all([
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
    listarFotosFecho(a, ano),
  ]);
  const mesesFechados = new Set(fechos.filter((f) => f.estado === 'fechado').map((f) => f.periodo));
  const calculados = calcularResumos({ ano, comunidades, contribuir, depositos, despesas, assistencia, banco, custosFixos, mesesFechados, hoje: hoje(), categorias, assistenciaAnterior, eventoCelebracao: configAss.eventoCelebracao });
  // Fotografias novas: o mês pedido e os meses fechados que ainda não têm fotografia.
  const comFoto = new Set(fotos0.map((f) => f.periodo));
  const em = new Date().toISOString();
  const novas = Array.from({ length: 12 }, (_, i) => i + 1)
    .filter((m) => mesesFechados.has(periodo(ano, m)) && (periodo(ano, m) === fotografarPeriodo || !comFoto.has(periodo(ano, m))))
    .flatMap((m) => fotografar(calculados, ano, m, a.email, em));
  const refeitos = new Set(novas.map((f) => f.periodo));
  const fotos = [...fotos0.filter((f) => !refeitos.has(f.periodo)), ...novas];
  const resumos = aplicarFotos(calculados, fotos, ano, mesesFechados);
  const publico = calcularPublico(ano, resumos, comunidades, mesesFechados);
  const site = calcularPublicoSite(ano, resumos, mesesFechados);
  const b = writeBatch(db);
  for (const f of novas) b.set(doc(db, 'fotos_fecho', f.id), f);
  for (const r of resumos) b.set(doc(db, 'resumos', r.id), { ...r, calculadoPor: a.email });
  b.set(doc(db, 'publico', String(ano)), site); // aberto: só o consolidado CCLX
  b.set(doc(db, 'publico_sites', String(ano)), publico); // com login: por comunidade
  await b.commit();
  await auditar(a.email, 'recalcular', `Resumos e página pública de ${ano}${refeitos.size ? `; fotografia do fecho: ${[...refeitos].sort().join(', ')}` : ''}`);
  return { resumos, publico };
}
