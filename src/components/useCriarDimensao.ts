import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { auditar, gravar } from '../lib/db';
import { novaDimensao, valorDaDimensao } from '../lib/escolha';
import type { Dimensao } from '../lib/types';
import type { CriarOpcao } from './Escolha';
import { mensagemErro } from './ui';

const NOME_TIPO: Record<Dimensao['tipo'], string> = { centro: 'centro de custo', projeto: 'projeto ou evento', fornecedor: 'fornecedor', conta: 'conta analítica' };

/**
 * Criar centros de custo, projetos ou eventos e fornecedores a partir das listas (só quem pode configurar).
 * `todas`: as dimensões carregadas mais as criadas nesta página, para aparecerem logo na lista.
 */
export function useCriarDimensao(dimensoes: Dimensao[], recarregar?: () => Promise<unknown>) {
  const { acesso, pode } = useAuth();
  const [novas, setNovas] = useState<Dimensao[]>([]);
  const todas = [...dimensoes, ...novas.filter((n) => !dimensoes.some((d) => d.id === n.id))];
  const criar = (tipo: Dimensao['tipo']): CriarOpcao | undefined => (!pode('configurar') ? undefined : {
    rotulo: NOME_TIPO[tipo],
    fazer: async (texto) => {
      const d = novaDimensao(tipo, texto, todas);
      const igual = todas.find((x) => x.id === d.id);
      if (igual) { if (igual.ativo === false) alert(`Já existe "${igual.codigo ? `${igual.codigo} ` : ''}${igual.nome}", mas está inativo. Ative-o em Configuração.`); else return valorDaDimensao(igual); return null; }
      try {
        await gravar('dimensoes', d);
        await auditar(acesso!.email, 'nova dimensão', `${NOME_TIPO[tipo]}: ${d.codigo ? `${d.codigo} ` : ''}${d.nome} (criado a partir de uma lista)`);
        setNovas((n) => [...n, d]);
        if (recarregar) void recarregar();
        return valorDaDimensao(d);
      } catch (e) { alert(mensagemErro(e)); return null; }
    },
  });
  return { criar, todas };
}
