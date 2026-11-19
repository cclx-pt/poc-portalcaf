import { useState } from 'react';
import { Modal, mensagemErro } from './ui';
import { auditar, gravar } from '../lib/db';
import { NOME_BANCO, assinaturaColunas, mapaCompleto, type Banco, type MapaBanco, type MapaExtrato } from '../lib/banco';
import { norm } from '../lib/format';
import type { Conta } from '../lib/types';

export const CAMPOS_EXTRATO: [keyof MapaBanco, string][] = [
  ['data', 'Data *'], ['descricao', 'Descrição'], ['valor', 'Montante (com sinal)'],
  ['debito', 'Débito'], ['credito', 'Crédito'], ['saldo', 'Saldo'], ['estorno', 'Estorno'],
];

/** Escolha das colunas do extrato para cada campo. */
export function CamposExtrato({ colunas, mapa, onChange }: { colunas: string[]; mapa: MapaBanco; onChange: (m: MapaBanco) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8 }}>
      {CAMPOS_EXTRATO.map(([k, label]) => (
        <label key={k} className="campo">{label}
          <select value={mapa[k] ?? ''} onChange={(e) => onChange({ ...mapa, [k]: e.target.value || undefined })}>
            <option value="">(não usar)</option>{colunas.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}

const idDe = (nome: string) => norm(nome).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `mapa-${Date.now()}`;

/** Cria ou edita um mapeamento guardado (nome, banco, conta por omissão e colunas). */
export function EditorMapaExtrato({ inicial, colunasFicheiro, contas, email, onFechar, onGuardado }: {
  inicial: Partial<MapaExtrato> & { campos: MapaBanco };
  /** Colunas do ficheiro de exemplo; sem ficheiro, usam-se as colunas guardadas no mapa. */
  colunasFicheiro?: string[];
  contas: Conta[];
  email: string;
  onFechar: () => void;
  onGuardado: (m: MapaExtrato) => void;
}) {
  const colunas = colunasFicheiro ?? [...new Set([...(inicial.colunas ?? []), ...Object.values(inicial.campos).filter((v): v is string => !!v)])];
  const [m, setM] = useState<{ nome: string; banco: string; contaId: string; campos: MapaBanco }>({ nome: inicial.nome ?? '', banco: inicial.banco ?? '', contaId: inicial.contaId ?? '', campos: inicial.campos });
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const ok = !!m.nome.trim() && mapaCompleto(m.campos);

  async function guardar() {
    setOcupado(true); setMsg(null);
    try {
      const final: MapaExtrato = {
        id: inicial.id || idDe(m.nome), nome: m.nome.trim(), banco: m.banco as Banco | '', contaId: m.contaId || undefined,
        colunas: colunasFicheiro ? assinaturaColunas(colunasFicheiro) : inicial.colunas ?? assinaturaColunas(colunas),
        campos: Object.fromEntries(Object.entries(m.campos).filter(([, v]) => v)) as MapaBanco,
        atualizadoEm: new Date().toISOString(), atualizadoPor: email,
      };
      await gravar('mapas_extrato', final);
      await auditar(email, 'mapeamento de extrato', `${inicial.id ? 'Alterado' : 'Criado'}: ${final.nome}`);
      onGuardado(final);
    } catch (e) { setMsg(mensagemErro(e)); } finally { setOcupado(false); }
  }

  return (
    <Modal titulo={inicial.id ? 'Editar mapeamento do extrato' : 'Guardar mapeamento do extrato'} onFechar={onFechar}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 12 }}>
        <label className="campo">Nome<input value={m.nome} placeholder="Ex.: Millennium conta corrente" onChange={(e) => setM({ ...m, nome: e.target.value })} /></label>
        <label className="campo">Banco
          <select value={m.banco} onChange={(e) => setM({ ...m, banco: e.target.value })}>
            <option value="">Outro</option>{(Object.keys(NOME_BANCO) as Banco[]).map((b) => <option key={b} value={b}>{NOME_BANCO[b]}</option>)}
          </select></label>
        <label className="campo">Conta por omissão
          <select value={m.contaId} onChange={(e) => setM({ ...m, contaId: e.target.value })}>
            <option value="">Escolher ao importar</option>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select></label>
      </div>
      <CamposExtrato colunas={colunas} mapa={m.campos} onChange={(campos) => setM({ ...m, campos })} />
      {!mapaCompleto(m.campos) && <p className="small muted">Indique a data e o montante (ou o débito e o crédito).</p>}
      {msg && <div className="aviso">{msg}</div>}
      <div className="acoes" style={{ marginTop: 14 }}>
        <button disabled={!ok || ocupado} onClick={() => void guardar()}>{ocupado ? 'A guardar…' : 'Guardar'}</button>
        <button className="sec" onClick={onFechar}>Cancelar</button>
      </div>
    </Modal>
  );
}
