import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { mensagemErro, useCarregar } from './ui';
import { auditar, gravarConfigReembolsos, lerConfigReembolsos } from '../lib/db';

/** Configuração › janela de datas da reconciliação dos reembolsos MB Way (só o Master grava, como o resto de config). */
export function JanelaReembolsos() {
  const { acesso } = useAuth();
  const cfg = useCarregar(lerConfigReembolsos, []);
  const [antes, setAntes] = useState('');
  const [depois, setDepois] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (cfg.dados) { setAntes(String(cfg.dados.diasAntes)); setDepois(String(cfg.dados.diasDepois)); } }, [cfg.dados]);
  const master = acesso?.papel === 'master';
  const a = Number(antes); const d = Number(depois);
  const valido = Number.isInteger(a) && Number.isInteger(d) && a >= 0 && a <= 30 && d >= 1 && d <= 180;
  const mudou = !!cfg.dados && (a !== cfg.dados.diasAntes || d !== cfg.dados.diasDepois);
  async function guardar() {
    setMsg(null);
    try {
      await gravarConfigReembolsos({ diasAntes: a, diasDepois: d });
      await auditar(acesso!.email, 'configuração', `Reembolsos MB Way: janela de ${a} dias antes a ${d} dias depois da submissão`);
      await cfg.recarregar(); setMsg('Janela gravada.');
    } catch (e) { setMsg(mensagemErro(e)); }
  }
  return (
    <div className="sec card">
      <h2>Reconciliação dos reembolsos MB Way</h2>
      <p className="small">Sem Unique ID no descritivo, um movimento só procura submissões do Registo de Despesas feitas dentro desta janela (Tesouraria › Reconciliação bancária › Reembolsos MB Way).</p>
      <div className="linha" style={{ alignItems: 'flex-end' }}>
        <label className="campo">Dias antes da submissão<input inputMode="numeric" style={{ width: 90 }} value={antes} disabled={!master} onChange={(e) => setAntes(e.target.value)} /></label>
        <label className="campo">Dias depois da submissão<input inputMode="numeric" style={{ width: 90 }} value={depois} disabled={!master} onChange={(e) => setDepois(e.target.value)} /></label>
        {master && <button disabled={!valido || !mudou} onClick={() => void guardar()}>Gravar janela</button>}
      </div>
      {!valido && <p className="aviso small">Use números inteiros: 0 a 30 dias antes e 1 a 180 dias depois.</p>}
      {!master && <p className="muted small">Só o Master altera a janela.</p>}
      {msg && <p className="nota small">{msg}</p>}
    </div>
  );
}
