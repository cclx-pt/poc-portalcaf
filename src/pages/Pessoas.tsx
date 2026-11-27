import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Estado, Modal, mensagemErro, useCarregar, useFiltros } from '../components/ui';
import { auditar, listarComunidades, listarLotes } from '../lib/db';
import {
  apagarPessoa, apagarPessoas, apagarTodasPessoas, chavePessoa, desfazerFusao, fundirComJotform, fundirPessoas, gravarPessoa, gravarPessoas, gruposRepetidos, idNovaPessoa, listarPessoas, mascaraMbway, normEmail, normNif, pessoasDoJotform, procurarPessoas, propostaFusao, validarPessoa,
  type EscolhaFusao, type GrupoRepetidos, type Pessoa,
} from '../lib/pessoas';
import { normalizarTelefones } from '../lib/reconciliacaoReembolsos';

type Edicao = { novo: boolean; id: string; nome: string; telefone: string; nif: string; email: string; comunidadeId: string; notas: string };
const vazia: Edicao = { novo: true, id: '', nome: '', telefone: '', nif: '', email: '', comunidadeId: '', notas: '' };
const telTxt = (t: string) => t.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');

/**
 * Administração › Pessoas (ADM-06): base de dados de referência confidencial (nome, telefone, contribuinte, e-mail,
 * comunidade) para futuras consolidações e registos. Só Master e CAF. Proposta a partir do Jotform e editável à mão.
 */
export default function Pessoas() {
  const { acesso } = useAuth();
  const { ano } = useFiltros();
  const pessoas = useCarregar(listarPessoas, []);
  const coms = useCarregar(listarComunidades, []);
  const [q, setQ] = useState('');
  const [com, setCom] = useState('');
  const [edit, setEdit] = useState<Edicao | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [repetidos, setRepetidos] = useState<GrupoRepetidos[] | null>(null);
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const porId = new Map((pessoas.dados ?? []).map((p) => [p.id, p]));
  const nomeCom = (id?: string) => (id ? (coms.dados ?? []).find((c) => c.id === id)?.nome ?? id : '—');
  const lista = procurarPessoas(pessoas.dados ?? [], q).filter((p) => !com || p.comunidadeId === com);

  async function atualizarDoJotform() {
    setErro(null); setMsg(null); setOcupado(true);
    try {
      const lotes = (await Promise.all([ano - 1, ano].flatMap((a) => (['contribuir', 'despesas'] as const).map((o) => listarLotes(acesso!, o, a, true))))).flat();
      const r = fundirComJotform(pessoas.dados ?? [], pessoasDoJotform(lotes), acesso!.email, new Date().toISOString());
      if (!r.novas.length && !r.atualizadas.length) { setMsg(`Sem alterações: ${r.semAlteracao} pessoas já estão atualizadas (Contribuir e Despesas de ${ano - 1} e ${ano}).`); return; }
      if (!confirm(`Atualizar a base a partir do Jotform (Contribuir e Despesas de ${ano - 1} e ${ano})?\n\n${r.novas.length} linhas novas e ${r.atualizadas.length} atualizadas. Uma linha por nome + telemóvel + e-mail; sem nome, sem telemóvel ou da Geral não entram. As editadas à mão não mudam.`)) return;
      await gravarPessoas([...r.novas, ...r.atualizadas]);
      await auditar(acesso!.email, 'pessoas', `Atualizadas a partir do Jotform (${ano - 1}-${ano}): ${r.novas.length} novas, ${r.atualizadas.length} atualizadas`);
      await pessoas.recarregar();
      setMsg(`${r.novas.length} pessoas novas e ${r.atualizadas.length} atualizadas a partir do Jotform.`);
    } catch (e) { setErro(mensagemErro(e)); } finally { setOcupado(false); }
  }

  async function guardar() {
    if (!edit) return;
    setErro(null);
    const e = validarPessoa(edit);
    if (e) return setErro(e);
    const nome = edit.nome.replace(/\s+/g, ' ').trim();
    const telefone = normalizarTelefones(edit.telefone)[0];
    const email = normEmail(edit.email);
    const nif = normNif(edit.nif);
    const repetida = (pessoas.dados ?? []).find((p) => p.id !== edit.id && chavePessoa(p) === chavePessoa({ nome, telefone, email }));
    if (repetida) return setErro('Já existe uma linha com este nome, telemóvel e e-mail.');
    const agora = new Date().toISOString();
    const antes = (pessoas.dados ?? []).find((p) => p.id === edit.id);
    const p: Pessoa = {
      ...(antes ?? { fontes: [], criadoEm: agora }), id: edit.id || idNovaPessoa({ nome, telefone, email }), nome, telefone, email, nif,
      comunidadeId: edit.comunidadeId || undefined, notas: edit.notas.trim() || undefined, manual: true, atualizadoEm: agora, atualizadoPor: acesso!.email,
    } as Pessoa;
    delete (p as Partial<Pessoa> & { telefones?: unknown; emails?: unknown }).telefones;
    delete (p as Partial<Pessoa> & { telefones?: unknown; emails?: unknown }).emails;
    try {
      await gravarPessoa(p);
      await auditar(acesso!.email, 'pessoas', `${edit.novo ? 'Criada' : 'Editada'}: ${p.nome}`);
      setEdit(null); await pessoas.recarregar();
    } catch (e) { setErro(mensagemErro(e)); }
  }

  /** Apaga todas as pessoas da base (pede para escrever APAGAR). */
  async function apagarTudo() {
    const n = (pessoas.dados ?? []).length;
    if (prompt(`Apagar definitivamente TODAS as ${n} pessoas da base? Esta ação não se pode desfazer.\n\nEscreva APAGAR para confirmar.`)?.trim().toUpperCase() !== 'APAGAR') return;
    setErro(null); setMsg(null); setOcupado(true);
    try {
      const apagadas = await apagarTodasPessoas();
      await auditar(acesso!.email, 'pessoas', `Apagadas todas as pessoas da base (${apagadas})`);
      await pessoas.recarregar();
      setMsg(`${apagadas} pessoas apagadas. A base está vazia.`);
    } catch (e) { setErro(mensagemErro(e)); } finally { setOcupado(false); }
  }

  /** Apaga de uma vez as pessoas da lista filtrada (pesquisa e/ou comunidade). */
  async function apagarLista() {
    const filtro = [q.trim() && `pesquisa "${q.trim()}"`, com && `comunidade ${nomeCom(com)}`].filter(Boolean).join(' e ');
    if (!confirm(`Apagar definitivamente as ${lista.length} pessoas desta lista (${filtro})? Esta ação não se pode desfazer.`)) return;
    setErro(null); setMsg(null); setOcupado(true);
    try {
      await apagarPessoas(lista.map((p) => p.id));
      await auditar(acesso!.email, 'pessoas', `Apagadas ${lista.length} pessoas da lista (${filtro})`);
      await pessoas.recarregar();
      setMsg(`${lista.length} pessoas apagadas (${filtro}).`);
    } catch (e) { setErro(mensagemErro(e)); } finally { setOcupado(false); }
  }

  /** Funde as linhas de um grupo na escolhida (as outras são apagadas; a fusão pode ser desfeita). */
  async function fundir(linhas: Pessoa[], e: EscolhaFusao): Promise<boolean> {
    if (!confirm(`Fundir ${linhas.length} linhas numa só (${e.nome}, ${telTxt(e.telefone)})? As outras linhas são apagadas; pode desfazer em "Desfazer fusão".`)) return false;
    setErro(null); setMsg(null); setOcupado(true);
    try {
      const r = fundirPessoas(linhas, e, acesso!.email, new Date().toISOString());
      await gravarPessoa(r.pessoa);
      await apagarPessoas(r.apagar);
      await auditar(acesso!.email, 'pessoas', `Fundidas ${linhas.length} linhas em ${r.pessoa.nome} (${r.pessoa.telefone}): ${linhas.map((x) => `${x.nome} ${x.telefone}${x.email ? ` ${x.email}` : ''}`).join('; ')}`);
      await pessoas.recarregar();
      setSelecionadas([]);
      setMsg(`${linhas.length} linhas fundidas em ${r.pessoa.nome}.`);
      return true;
    } catch (x) { setErro(mensagemErro(x)); return false; } finally { setOcupado(false); }
  }

  async function desfazer(p: Pessoa) {
    const originais = desfazerFusao(p);
    if (!confirm(`Desfazer a fusão de ${p.nome}? Voltam as ${originais.length} linhas como estavam antes.`)) return;
    setErro(null); setMsg(null); setOcupado(true);
    try {
      await gravarPessoas(originais);
      await auditar(acesso!.email, 'pessoas', `Desfeita a fusão de ${p.nome}: repostas ${originais.length} linhas`);
      await pessoas.recarregar();
      setMsg(`Fusão desfeita: ${originais.length} linhas repostas.`);
    } catch (x) { setErro(mensagemErro(x)); } finally { setOcupado(false); }
  }

  async function apagar(p: Pessoa) {
    if (!confirm(`Apagar ${p.nome} da base de pessoas? Esta ação não se pode desfazer.`)) return;
    try {
      await apagarPessoa(p.id);
      await auditar(acesso!.email, 'pessoas', `Apagada: ${p.nome}`);
      await pessoas.recarregar();
    } catch (e) { setErro(mensagemErro(e)); }
  }

  return (
    <>
      <div className="linha" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1>Pessoas (dados de referência)</h1>
          <p className="muted">Base confidencial de nome, telemóvel, contribuinte, e-mail e comunidade, para futuras consolidações e registos. Só o Master e o CAF a veem. Uma linha por nome + telemóvel + e-mail (não se agrupa sozinho: a mesma pessoa pode ter várias linhas). Em <b>Procurar repetidos</b> (ou selecionando linhas) junta-se a mesma pessoa numa só linha: os outros telemóveis ficam guardados e contam no MB Way, os outros e-mails vão para as notas, e cada fusão pode ser desfeita. Sem nome ou sem telemóvel não se grava; a proposta do Jotform (Contribuir e Registo de Despesas) deixa de fora a comunidade Geral e não muda as linhas editadas à mão. Todas as alterações ficam na auditoria.</p>
        </div>
        <div className="acoes">
          <button className="sec" disabled={ocupado || !pessoas.dados} onClick={() => void atualizarDoJotform()}>{ocupado ? 'A ler o Jotform…' : `Atualizar a partir do Jotform (${ano - 1} e ${ano})`}</button>
          <button onClick={() => { setErro(null); setEdit({ ...vazia }); }}>Nova pessoa</button>
          <button className="sec" disabled={ocupado || (pessoas.dados ?? []).length < 2} onClick={() => setRepetidos(gruposRepetidos(pessoas.dados ?? []))}>Procurar repetidos</button>
          <button className="sec" disabled={ocupado || !(pessoas.dados ?? []).length} onClick={() => void apagarTudo()}>Apagar tudo</button>
        </div>
      </div>
      {msg && <div className="nota">{msg}</div>}
      {erro && !edit && <div className="aviso">{erro}</div>}

      <div className="acoes">
        <label className="campo">Procurar<input type="search" value={q} placeholder="Nome, telemóvel, 966XXX014, NIF ou e-mail" onChange={(e) => setQ(e.target.value)} /></label>
        <label className="campo">Comunidade
          <select value={com} onChange={(e) => setCom(e.target.value)}>
            <option value="">Todas</option>
            {(coms.dados ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
        <span className="small muted" style={{ alignSelf: 'flex-end' }}>{`${lista.length} de ${(pessoas.dados ?? []).length} pessoas`}</span>
        {selecionadas.length >= 2 && <button style={{ alignSelf: 'flex-end' }} disabled={ocupado} onClick={() => setRepetidos([{ tipo: 'M', motivo: 'Linhas escolhidas à mão', ids: selecionadas }])}>{`Fundir as ${selecionadas.length} selecionadas`}</button>}
        {(q.trim() || com) && lista.length > 0 && <button className="sec" style={{ alignSelf: 'flex-end' }} disabled={ocupado} onClick={() => void apagarLista()}>{`Apagar as ${lista.length} da lista`}</button>}
      </div>

      <Estado aCarregar={pessoas.aCarregar} erro={pessoas.erro} vazio={!pessoas.dados?.length} />
      {!!pessoas.dados?.length && (
        <div className="tabela"><table>
          <thead><tr><th><span className="sr-only">Selecionar</span></th><th>Nome</th><th>Telemóvel</th><th title="Como aparece no extrato: Trf Mbway 966XXX014">MB Way</th><th>Contribuinte</th><th>E-mail</th><th>Comunidade</th><th>Origem</th><th /></tr></thead>
          <tbody>
            {lista.slice(0, 500).map((p) => (
              <tr key={p.id}>
                <td><input type="checkbox" aria-label={`Selecionar ${p.nome}`} checked={selecionadas.includes(p.id)} onChange={(e) => setSelecionadas(e.target.checked ? [...selecionadas, p.id] : selecionadas.filter((x) => x !== p.id))} /></td>
                <td>{p.nome}{p.notas && <div className="small muted">{p.notas}</div>}</td>
                <td className="small">{p.telefone ? telTxt(p.telefone) : '—'}{p.outrosTelefones?.length ? <div className="muted">{`Outros: ${p.outrosTelefones.map(telTxt).join(', ')}`}</div> : null}</td>
                <td className="small">{mascaraMbway(p.telefone) || '—'}</td>
                <td>{p.nif ?? '—'}</td>
                <td className="small">{p.email ?? '—'}</td>
                <td>{nomeCom(p.comunidadeId)}</td>
                <td className="small">{p.fusao ? `Fundida (${p.fusao.originais.length} linhas)` : p.manual ? 'Editada à mão' : 'Jotform'}{p.fontes.length ? <span className="muted">{` · ${p.fontes.length} registo${p.fontes.length === 1 ? '' : 's'}`}</span> : null}</td>
                <td>
                  <div className="acoes" style={{ margin: 0, flexWrap: 'nowrap' }}>
                    <button className="link" onClick={() => { setErro(null); setEdit({ novo: false, id: p.id, nome: p.nome, telefone: p.telefone, nif: p.nif ?? '', email: p.email ?? '', comunidadeId: p.comunidadeId ?? '', notas: p.notas ?? '' }); }}>Editar</button>
                    {p.fusao && <button className="link" disabled={ocupado} onClick={() => void desfazer(p)}>Desfazer fusão</button>}
                    <button className="link" onClick={() => void apagar(p)}>Apagar</button>
                  </div>
                </td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={9} className="muted">Nenhuma pessoa com este filtro.</td></tr>}
          </tbody>
        </table></div>
      )}

      {repetidos && (
        <Modal titulo="Repetidos" onFechar={() => setRepetidos(null)}>
          {erro && <div className="aviso">{erro}</div>}
          {!repetidos.length ? <p className="ok-box small">Não há linhas repetidas.</p> : <>
            <p className="small muted">{`${repetidos.length} grupos. A: mesmo telemóvel e mesmo nome. B: mesmo telemóvel e nome parecido. C: mesmo NIF ou e-mail com telemóveis diferentes (os outros telemóveis ficam na linha que fica, e contam no MB Way). Escolha a linha e os valores que ficam; os outros e-mails vão para as notas. Pode desfazer cada fusão.`}</p>
            {repetidos.map((g) => {
              const linhas = g.ids.map((id) => porId.get(id)).filter((x): x is Pessoa => !!x);
              return linhas.length < 2 ? null : <GrupoFusao key={g.ids.join('|')} grupo={g} linhas={linhas} nomeCom={nomeCom} ocupado={ocupado}
                onFundir={async (e) => { if (await fundir(linhas, e)) setRepetidos((rs) => (rs ?? []).filter((x) => x !== g)); }}
                onIgnorar={() => setRepetidos((rs) => (rs ?? []).filter((x) => x !== g))} />;
            })}
          </>}
        </Modal>
      )}

      {edit && (
        <Modal titulo={edit.novo ? 'Nova pessoa' : `Editar: ${edit.nome}`} onFechar={() => setEdit(null)}>
          {erro && <div className="aviso">{erro}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            <label className="campo">Nome *<input value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} /></label>
            <label className="campo">Telemóvel *<input inputMode="tel" value={edit.telefone} onChange={(e) => setEdit({ ...edit, telefone: e.target.value })} /></label>
            <label className="campo">Contribuinte (NIF)<input inputMode="numeric" value={edit.nif} onChange={(e) => setEdit({ ...edit, nif: e.target.value })} /></label>
            <label className="campo">E-mail<input type="text" inputMode="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></label>
            <label className="campo">Comunidade
              <select value={edit.comunidadeId} onChange={(e) => setEdit({ ...edit, comunidadeId: e.target.value })}>
                <option value="">—</option>
                {(coms.dados ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
            <label className="campo">Notas<input value={edit.notas} onChange={(e) => setEdit({ ...edit, notas: e.target.value })} /></label>
          </div>
          <p className="small muted">Um só telemóvel e um só e-mail por linha: para outro número ou e-mail, crie outra linha. Nome e telemóvel são obrigatórios. Depois de gravada à mão, a atualização a partir do Jotform não muda esta linha.</p>
          <div className="acoes">
            <button onClick={() => void guardar()}>Gravar</button>
            <button className="sec" onClick={() => setEdit(null)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </>
  );
}

const TIPO_GRUPO: Record<GrupoRepetidos['tipo'], string> = { A: 'A · mesmo telemóvel e nome', B: 'B · nome parecido', C: 'C · mesmo NIF ou e-mail', M: 'Selecionadas' };

/** Um grupo de linhas repetidas: escolher a linha que fica e o valor de cada campo, e fundir. */
function GrupoFusao({ grupo, linhas, nomeCom, ocupado, onFundir, onIgnorar }: {
  grupo: GrupoRepetidos; linhas: Pessoa[]; nomeCom: (id?: string) => string; ocupado: boolean;
  onFundir: (e: EscolhaFusao) => void; onIgnorar: () => void;
}) {
  const [e, setE] = useState<EscolhaFusao>(() => propostaFusao(linhas));
  type Campo = 'nome' | 'telefone' | 'email' | 'nif' | 'comunidadeId';
  const campo = (k: Campo, rotulo: string, txt: (v: string) => string = (v) => v, obrigatorio = false) => {
    const vs = [...new Set(linhas.map((x) => x[k]).filter((v): v is string => !!v))];
    return (
      <label className="campo" key={k}>{rotulo}
        <select value={e[k] ?? ''} onChange={(ev) => setE({ ...e, [k]: ev.target.value || undefined })}>
          {!obrigatorio && <option value="">—</option>}
          {vs.map((v) => <option key={v} value={v}>{txt(v)}</option>)}
        </select>
      </label>
    );
  };
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="linha" style={{ justifyContent: 'space-between' }}>
        <b>{grupo.motivo}</b><span className="etiqueta">{TIPO_GRUPO[grupo.tipo]}</span>
      </div>
      <div className="tabela"><table>
        <thead><tr><th>Fica</th><th>Nome</th><th>Telemóvel</th><th>E-mail</th><th>NIF</th><th>Comunidade</th><th>Origem</th></tr></thead>
        <tbody>{linhas.map((x) => (
          <tr key={x.id}>
            <td><input type="radio" name={`manter-${grupo.ids.join('|')}`} aria-label={`Fica a linha de ${x.nome}`} checked={e.manterId === x.id} onChange={() => setE({ ...e, manterId: x.id })} /></td>
            <td>{x.nome}</td><td className="small">{telTxt(x.telefone)}</td><td className="small">{x.email ?? '—'}</td><td>{x.nif ?? '—'}</td>
            <td>{nomeCom(x.comunidadeId)}</td><td className="small">{`${x.manual ? 'Editada à mão' : 'Jotform'} · ${x.fontes.length}`}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, margin: '8px 0' }}>
        {campo('nome', 'Nome', undefined, true)}
        {campo('telefone', 'Telemóvel principal', telTxt, true)}
        {campo('email', 'E-mail')}
        {campo('nif', 'NIF')}
        {campo('comunidadeId', 'Comunidade', nomeCom)}
      </div>
      <div className="acoes" style={{ margin: 0 }}>
        <button disabled={ocupado} onClick={() => onFundir(e)}>{`Fundir ${linhas.length} linhas`}</button>
        <button className="sec" onClick={onIgnorar}>Ignorar</button>
      </div>
    </div>
  );
}
