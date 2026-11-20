import { describe, expect, it, vi } from 'vitest';
const docs = new Map<string, Record<string, unknown>>();
vi.mock('../../src/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => `${col}/${id}`,
  getDoc: async (ref: string) => ({ exists: () => docs.has(ref), data: () => docs.get(ref) }),
  setDoc: async (ref: string, v: Record<string, unknown>) => { docs.set(ref, v); },
  deleteDoc: async (ref: string) => { docs.delete(ref); },
  collection: () => null, getDocs: async () => ({ docs: [] }), writeBatch: () => ({}),
}));
import { atualizarAcesso, chaveAcesso, verificarAcesso } from '../../src/lib/acessos';

describe('login: só envia o link a utilizadores registados', () => {
  it('a chave não depende de maiúsculas nem espaços e não contém o email', async () => {
    const k = await chaveAcesso(' Ana@Exemplo.PT ');
    expect(k).toBe(await chaveAcesso('ana@exemplo.pt'));
    expect(k).toMatch(/^[0-9a-f]{64}$/);
  });

  it('antes de o índice existir não bloqueia ninguém', async () => {
    expect(await verificarAcesso('ninguem@exemplo.pt')).toBe('desconhecido');
  });

  it('com o índice: registado e ativo entra; os outros recebem "não registado"; o Master entra sempre', async () => {
    docs.set('acessos/_indice', { em: 'x' });
    await atualizarAcesso('ana@exemplo.pt', true);
    expect(await verificarAcesso('ANA@exemplo.pt')).toBe('registado');
    expect(await verificarAcesso('outro@exemplo.pt')).toBe('nao-registado');
    await atualizarAcesso('ana@exemplo.pt', false);
    expect(await verificarAcesso('ana@exemplo.pt')).toBe('nao-registado');
    expect(await verificarAcesso('tesouraria@cclx.pt')).toBe('registado');
  });
});
