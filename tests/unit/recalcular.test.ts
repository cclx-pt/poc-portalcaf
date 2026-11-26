import { beforeEach, describe, expect, it, vi } from 'vitest';
const auditar = vi.fn(async () => {});
const commit = vi.fn(async () => {});
vi.mock('firebase/firestore', () => ({ doc: () => ({}), writeBatch: () => ({ set: () => {}, commit }) }));
vi.mock('../../src/lib/db', () => ({
  db: {}, auditar,
  listarComunidades: async () => [], listarLotes: async () => [], listarBanco: async () => [], listarCustosFixos: async () => [],
  listarFechos: async () => [], listarCategorias: async () => [], lerConfigAssistencia: async () => ({ eventoCelebracao: null }), lerTraducaoJotform: async () => ({ linhas: [] }),
}));
vi.mock('../../src/lib/pesos', () => ({ listarPesos: async () => [], pesosParaCalculo: () => ({}) }));
const A = (papel: string) => ({ email: `${papel}@x.pt`, papel, nivel: 'confidencial', comunidades: ['*'] }) as never;

describe('recalcularAno: só Master e CAF, sempre registado na auditoria', () => {
  beforeEach(() => { auditar.mockClear(); commit.mockClear(); });

  it('regista quem, de onde e o ano', async () => {
    const { recalcularAno } = await import('../../src/lib/recalcular');
    await recalcularAno(A('caf'), 2026, 'Painel (PAI-01)');
    expect(commit).toHaveBeenCalledOnce();
    expect(auditar).toHaveBeenCalledWith('caf@x.pt', 'recalcular', expect.stringMatching(/^Painel \(PAI-01\): resumos e página pública de 2026/));
  });

  it('recusa outros perfis sem gravar e regista a tentativa', async () => {
    const { recalcularAno } = await import('../../src/lib/recalcular');
    await expect(recalcularAno(A('tesoureiro'), 2026, 'Painel (PAI-01)')).rejects.toThrow(/Master e CAF/);
    expect(commit).not.toHaveBeenCalled();
    expect(auditar).toHaveBeenCalledWith('tesoureiro@x.pt', 'recalcular (recusado)', expect.stringContaining('2026'));
  });

  it('regista a falha quando a gravação não corre', async () => {
    commit.mockRejectedValueOnce(new Error('sem rede'));
    const { recalcularAno } = await import('../../src/lib/recalcular');
    await expect(recalcularAno(A('master'), 2026, 'Fecho (TES-05)')).rejects.toThrow('sem rede');
    expect(auditar).toHaveBeenCalledWith('master@x.pt', 'recalcular (falhou)', expect.stringContaining('sem rede'));
  });
});
