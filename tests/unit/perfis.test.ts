import { describe, expect, it } from 'vitest';
import { erroPerfil } from '../../src/lib/perfis';
import type { Perfil } from '../../src/lib/types';

const p = (x: Partial<Perfil>): Perfil => ({ email: 'ana@cclx.pt', nome: 'Ana Silva', papel: 'leitura', nivel: 'publico', comunidades: ['*'], ativo: true, ...x });

describe('registo de utilizadores (ADM-02)', () => {
  it('o nome é obrigatório', () => {
    expect(erroPerfil(p({}))).toBeNull();
    expect(erroPerfil(p({ nome: undefined }))).toMatch(/nome/i);
    expect(erroPerfil(p({ nome: '   ' }))).toMatch(/nome/i);
  });
  it('email válido e, fora do CAF, pelo menos uma comunidade', () => {
    expect(erroPerfil(p({ email: 'ana' }))).toMatch(/email/i);
    expect(erroPerfil(p({ comunidades: [] }))).toMatch(/comunidade/);
    expect(erroPerfil(p({ papel: 'caf', comunidades: [] }))).toBeNull();
  });
});
