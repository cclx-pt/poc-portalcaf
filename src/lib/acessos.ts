/**
 * Índice de acessos: permite ao ecrã de login saber, antes de enviar o link, se um email está registado.
 * Antes do login não se pode ler `users` (tem dados de perfil). Este índice só guarda, por email cifrado com
 * SHA-256, se o acesso está ativo. Pode ser lido um a um sem login, mas não listado (ver firestore.rules).
 * É mantido pelo portal quando o Master grava ou apaga um utilizador, e sincronizado quando o Master entra.
 */
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { MASTER_EMAILS, type Perfil } from './types';

const SAL = 'cclx-caf-portal:acesso:';
/** Documento que indica que o índice já foi construído (antes disso, o login não bloqueia ninguém). */
const MARCA = '_indice';

export async function chaveAcesso(email: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SAL + email.trim().toLowerCase()));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type Verificacao = 'registado' | 'nao-registado' | 'desconhecido';

/** Pode receber o link? Master sempre; índice ainda não construído ou erro de leitura: "desconhecido" (deixa enviar). */
export async function verificarAcesso(email: string): Promise<Verificacao> {
  const e = email.trim().toLowerCase();
  if (MASTER_EMAILS.includes(e)) return 'registado';
  try {
    const [marca, registo] = await Promise.all([getDoc(doc(db, 'acessos', MARCA)), getDoc(doc(db, 'acessos', await chaveAcesso(e)))]);
    if (!marca.exists()) return 'desconhecido';
    return registo.exists() && registo.data().ativo === true ? 'registado' : 'nao-registado';
  } catch {
    return 'desconhecido';
  }
}

/** Atualiza a entrada de um utilizador (ativo → existe; inativo ou apagado → não existe). */
export async function atualizarAcesso(email: string, ativo: boolean) {
  const ref = doc(db, 'acessos', await chaveAcesso(email));
  if (ativo) await setDoc(ref, { ativo: true });
  else await deleteDoc(ref);
}

/** Reconstrói o índice a partir dos perfis (Master). Devolve o número de acessos ativos. */
export async function sincronizarAcessos(perfis: Pick<Perfil, 'email' | 'ativo'>[]): Promise<number> {
  const ativos = new Set(await Promise.all(perfis.filter((p) => p.ativo).map((p) => chaveAcesso(p.email))));
  const existentes = (await getDocs(collection(db, 'acessos'))).docs.map((d) => d.id).filter((id) => id !== MARCA);
  const b = writeBatch(db);
  for (const id of existentes) if (!ativos.has(id)) b.delete(doc(db, 'acessos', id));
  for (const id of ativos) if (!existentes.includes(id)) b.set(doc(db, 'acessos', id), { ativo: true });
  b.set(doc(db, 'acessos', MARCA), { em: new Date().toISOString() });
  await b.commit();
  return ativos.size;
}
