import { NOME_BANCO, type Banco } from '../lib/banco';

const BASE = import.meta.env.BASE_URL;
/** Logótipo do banco (identificação de cada linha e dos filtros). */
export function LogoBanco({ banco, tamanho = 18 }: { banco: Banco | null; tamanho?: number }) {
  if (!banco) return <span className="logo-banco vazio" style={{ width: tamanho, height: tamanho }} />;
  return <img className="logo-banco" src={`${BASE}bancos/${banco}.png`} alt={NOME_BANCO[banco]} title={NOME_BANCO[banco]} width={tamanho} height={tamanho} />;
}
