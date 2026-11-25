import { useState } from 'react';
import { Modal, mensagemErro } from './ui';
import { LogoConta } from './LogoBanco';
import { auditar, gravar } from '../lib/db';
import { detetarBanco, mapaCompleto, mapaDoBanco, mapearExtrato, sugerirMapaBanco, type MapaBanco } from '../lib/banco';
import { lerFicheiro, type ModoCabecalho } from '../lib/ficheiros';
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

/** As primeiras linhas do ficheiro, para saber o que tem cada coluna; as colunas escolhidas mostram o campo. */
export function AmostraExtrato({ colunas, linhas, mapa, n = 3 }: { colunas: string[]; linhas: Linha[]; mapa: MapaBanco; n?: number }) {
  if (!colunas.length || !linhas.length) return null;
  const campoDe = (c: string) => CAMPOS_EXTRATO.filter(([k]) => mapa[k] === c).map(([, l]) => l.replace(' *', '')).join(', ');
  return (
    <div className="amostra-extrato">
      <p className="small muted" style={{ margin: '8px 0 4px' }}>{`Primeiras ${Math.min(n, linhas.length)} linhas do ficheiro:`}</p>
      <div className="tabela" style={{ maxHeight: 'none' }}><table>
        <thead>
          <tr>{colunas.map((c) => <th key={c} className={campoDe(c) ? 'mapeada' : ''}>{c}{campoDe(c) && <div className="small">{`→ ${campoDe(c)}`}</div>}</th>)}</tr>
        </thead>
        <tbody>{linhas.slice(0, n).map((l, i) => (
          <tr key={i}>{colunas.map((c) => <td key={c} className={campoDe(c) ? 'mapeada small' : 'small'}>{String(l[c] ?? '')}</td>)}</tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

/** Pergunta se o extrato tem linha de cabeçalho (automático, sim ou não). */
export function CampoCabecalho({ valor, onChange }: { valor: ModoCabecalho; onChange: (v: ModoCabecalho) => void }) {
  return (
    <label className="campo" style={{ maxWidth: 320 }}>O extrato tem linha de cabeçalho?
      <select value={valor} onChange={(e) => onChange(e.target.value as ModoCabecalho)}>
        <option value="auto">Automático (o portal deteta)</option>
        <option value="sim">Sim: a 1.ª linha tem os nomes das colunas</option>
        <option value="nao">Não: todas as linhas são movimentos</option>
      </select>
    </label>
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
  const [cabecalho, setCabecalho] = useState<ModoCabecalho>(conta.extratoCabecalho ?? 'auto');
  const [exemplo, setExemplo] = useState<File | null>(null);
  const teste = linhas.length && mapaCompleto(mapa) ? mapearExtrato(linhas, mapa) : null;

  async function lerExemplo(f: File, modo: ModoCabecalho = cabecalho) {
    setMsg(null);
    try {
      setExemplo(f);
      const t = await lerFicheiro(f, modo);
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
      const nova: Conta = { ...conta, logo, mapa: temMapa ? limparMapa(mapa) : undefined, mapaColunas: temMapa ? colunas : undefined, extratoCabecalho: cabecalho === 'auto' ? undefined : cabecalho };
      if (!nova.extratoCabecalho) delete nova.extratoCabecalho;
      if (!nova.mapa) { delete nova.mapa; delete nova.mapaColunas; }
      if (!nova.logo) delete nova.logo;
      await gravar('contas', nova);
      await auditar(email, 'conta: extrato e logótipo', `${conta.nome}: ${temMapa ? 'mapeamento guardado' : 'sem mapeamento'}${cabecalho === 'auto' ? '' : `, extrato ${cabecalho === 'sim' ? 'com' : 'sem'} cabeçalho`}${logo ? ', com logótipo' : ''}`);
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
      <CampoCabecalho valor={cabecalho} onChange={(v) => {
        setCabecalho(v);
        // Volta a ler o exemplo com a nova opção: as colunas mudam (com cabeçalho: os nomes; sem: "Coluna 1…").
        if (exemplo) { setMapa({}); void lerExemplo(exemplo, v); }
      }} />
      <button className="sec" onClick={() => document.getElementById('exemplo-extrato')?.click()}>Carregar extrato de exemplo</button>
      <input id="exemplo-extrato" type="file" accept=".csv,.xlsx,.xls,.txt" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void lerExemplo(f); }} />
      <AmostraExtrato colunas={colunas} linhas={linhas} mapa={mapa} />
      {!!colunas.length && <div style={{ marginTop: 10 }}><CamposExtrato colunas={colunas} mapa={mapa} onChange={setMapa} /></div>}
      {!!colunas.length && !linhas.length && <p className="small muted">Carregue um extrato de exemplo para ver as primeiras linhas de cada coluna.</p>}
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
