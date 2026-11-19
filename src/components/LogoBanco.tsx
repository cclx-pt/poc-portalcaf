import { NOME_BANCO, bancoDaConta, type Banco } from '../lib/banco';
import type { Conta } from '../lib/types';

const BASE = import.meta.env.BASE_URL;
/** Logótipo do banco (identificação de cada linha e dos filtros). */
export function LogoBanco({ banco, tamanho = 18 }: { banco: Banco | null; tamanho?: number }) {
  if (!banco) return <span className="logo-banco vazio" style={{ width: tamanho, height: tamanho }} />;
  return <img className="logo-banco" src={`${BASE}bancos/${banco}.png`} alt={NOME_BANCO[banco]} title={NOME_BANCO[banco]} width={tamanho} height={tamanho} />;
}

/** Logótipo da conta: o carregado em Configuração; senão, o do banco. */
export function LogoConta({ conta, tamanho = 18 }: { conta?: Pick<Conta, 'id' | 'banco' | 'nome' | 'logo'> | null; tamanho?: number }) {
  if (conta?.logo) return <img className="logo-banco" src={conta.logo} alt={conta.banco || conta.nome} title={conta.banco || conta.nome} width={tamanho} height={tamanho} />;
  return <LogoBanco banco={conta ? bancoDaConta(conta) : null} tamanho={tamanho} />;
}
