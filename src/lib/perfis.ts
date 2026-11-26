import type { Perfil } from './types';

/** Validação do registo de um utilizador: nome e email obrigatórios; fora do CAF, pelo menos uma comunidade. Null se está tudo certo. */
export function erroPerfil(p: Perfil): string | null {
  if (!p.nome?.trim()) return 'Indique o nome do utilizador.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())) return 'Indique um email válido.';
  if (p.papel !== 'caf' && !p.comunidades.length) return 'Escolha "Todas" ou pelo menos uma comunidade.';
  return null;
}
