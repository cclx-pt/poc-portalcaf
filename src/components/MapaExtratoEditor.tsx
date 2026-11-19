import { useState } from 'react';
import { Modal, mensagemErro } from './ui';
import { LogoConta } from './LogoBanco';
import { auditar, gravar } from '../lib/db';
import { detetarBanco, mapaCompleto, mapaDoBanco, mapearExtrato, sugerirMapaBanco, type MapaBanco } from '../lib/banco';
import { lerFicheiro } from '../lib/ficheiros';
import { reduzirImagem } from '../lib/imagem';
import type { Linha } from '../lib/fontes';
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

export const limparMapa = (m: MapaBanco) => Object.fromEntries(Object.entries(m).filter(([, v]) => v)) as MapaBanco;

/** Resumo do mapeamento de uma conta, para a tabela das contas. */
export const resumoMapa = (c: Conta) =>
  c.mapa && mapaCompleto(c.mapa)
    ? CAMPOS_EXTRATO.filter(([k]) => c.mapa![k]).map(([k, l]) => `${l.replace(' *', '')}: ${c.mapa![k]}`).join(' · ')
    : null;

/** Mapeamento do extrato e logótipo de uma conta. */
export function EditorConta({ conta, email, onFechar, onGuardado }: { conta: Conta; email: string; onFechar: () => void; onGuardado: () => void }) {
  const [colunas, setColunas] = useState<string[]>(conta.mapaColunas ?? Object.values(conta.mapa ?? {}).filter((v): v is string => !!v));
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [mapa, setMapa] = useState<MapaBanco>(conta.mapa ?? {});
  const [logo, setLogo] = useState<string | undefined>(conta.logo);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const teste = linhas.length && mapaCompleto(mapa) ? mapearExtrato(linhas, mapa) : null;

  async function lerExemplo(f: File) {
    setMsg(null);
    try {
      const t = await lerFicheiro(f);
      const b = detetarBanco(t.colunas);
      setColunas(t.colunas); setLinhas(t.linhas);
      const atuais = Object.values(mapa).filter((v): v is string => !!v);
      if (!mapaCompleto(mapa) || !atuais.every((v) => t.colunas.includes(v))) setMapa(b ? mapaDoBanco(b, t.colunas) : sugerirMapaBanco(t.colunas));
      setMsg(`${f.name}: ${t.colunas.length} colunas e ${t.linhas.length} linhas lidas. Confirme as colunas.`);
    } catch (e) { setMsg(mensagemErro(e)); }
  }
  async function lerLogo(f: File) {
    setMsg(null);
    try { setLogo(await reduzirImagem(f)); } catch (e) { setMsg(mensagemErro(e)); }
  }
  async function guardar() {
    setOcupado(true); setMsg(null);
    try {
      const temMapa = mapaCompleto(mapa);
      const nova: Conta = { ...conta, logo, mapa: temMapa ? limparMapa(mapa) : undefined, mapaColunas: temMapa ? colunas : undefined };
      await gravar('contas', nova);
      await auditar(email, 'conta: extrato e logótipo', `${conta.nome}: ${temMapa ? 'mapeamento guardado' : 'sem mapeamento'}${logo ? ', com logótipo' : ''}`);
      onGuardado();
    } catch (e) { setMsg(mensagemErro(e)); } finally { setOcupado(false); }
  }

  return (
    <Modal titulo={`Extrato e logótipo · ${conta.nome}`} onFechar={onFechar}>
      <h3 style={{ marginTop: 0 }}>Logótipo</h3>
      <div className="linha" style={{ alignItems: 'center', gap: 12 }}>
        <LogoConta conta={{ ...conta, logo }} tamanho={40} />
        <button className="sec" onClick={() => document.getElementById('logo-conta')?.click()}>Carregar imagem</button>
        <input id="logo-conta" type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void lerLogo(f); }} />
        {logo && <button className="link" onClick={() => setLogo(undefined)}>Remover (usar o do banco)</button>}
      </div>
      <p className="small muted">PNG, JPG, SVG ou WebP. É reduzido a 128 × 128 px.</p>

      <h3>Colunas do extrato</h3>
      <p className="small">Carregue um extrato desta conta, tal como sai do homebanking, e indique as colunas. Ao importar, o portal reconhece o ficheiro, escolhe esta conta e aplica estas colunas.</p>
      <button className="sec" onClick={() => document.getElementById('exemplo-extrato')?.click()}>Carregar extrato de exemplo</button>
      <input id="exemplo-extrato" type="file" accept=".csv,.xlsx,.xls,.txt" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void lerExemplo(f); }} />
      {!!colunas.length && <div style={{ marginTop: 10 }}><CamposExtrato colunas={colunas} mapa={mapa} onChange={setMapa} /></div>}
      {!!colunas.length && !mapaCompleto(mapa) && <p className="small muted">Indique a data e o montante (ou o débito e o crédito).</p>}
      {teste && <p className="small">Teste: {teste.movimentos.length} movimentos válidos{teste.rejeitadas.length ? `, ${teste.rejeitadas.length} linhas ignoradas` : ''}.</p>}
      {!!conta.mapa && <p className="small"><button className="link" onClick={() => { setMapa({}); setColunas([]); setLinhas([]); }}>Apagar o mapeamento</button></p>}
      {msg && <div className="nota">{msg}</div>}
      <div className="acoes" style={{ marginTop: 14 }}>
        <button disabled={ocupado} onClick={() => void guardar()}>{ocupado ? 'A guardar…' : 'Guardar'}</button>
        <button className="sec" onClick={onFechar}>Cancelar</button>
      </div>
    </Modal>
  );
}
