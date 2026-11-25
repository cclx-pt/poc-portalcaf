import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Estado, Modal, mensagemErro, useCarregar, useFiltros } from '../components/ui';
import { auditar, listarComunidades, listarLotes } from '../lib/db';
import {
  apagarPessoa, apagarPessoas, apagarTodasPessoas, chavePessoa, fundirComJotform, gravarPessoa, gravarPessoas, idNovaPessoa, listarPessoas, normEmail, normNif, pessoasDoJotform, procurarPessoas, validarPessoa, type Pessoa,
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
          <p className="muted">Base confidencial de nome, telemóvel, contribuinte, e-mail e comunidade, para futuras consolidações e registos. Só o Master e o CAF a veem. Uma linha por nome + telemóvel + e-mail (não se agrupa: a mesma pessoa pode ter várias linhas). Sem nome ou sem telemóvel não se grava; a proposta do Jotform (Contribuir e Registo de Despesas) deixa de fora a comunidade Geral e não muda as linhas editadas à mão. Todas as alterações ficam na auditoria.</p>
        </div>
        <div className="acoes">
          <button className="sec" disabled={ocupado || !pessoas.dados} onClick={() => void atualizarDoJotform()}>{ocupado ? 'A ler o Jotform…' : `Atualizar a partir do Jotform (${ano - 1} e ${ano})`}</button>
          <button onClick={() => { setErro(null); setEdit({ ...vazia }); }}>Nova pessoa</button>
          <button className="sec" disabled={ocupado || !(pessoas.dados ?? []).length} onClick={() => void apagarTudo()}>Apagar tudo</button>
        </div>
      </div>
      {msg && <div className="nota">{msg}</div>}
      {erro && !edit && <div className="aviso">{erro}</div>}

      <div className="acoes">
        <label className="campo">Procurar<input type="search" value={q} placeholder="Nome, telefone, NIF ou e-mail" onChange={(e) => setQ(e.target.value)} /></label>
        <label className="campo">Comunidade
          <select value={com} onChange={(e) => setCom(e.target.value)}>
            <option value="">Todas</option>
            {(coms.dados ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
        <span className="small muted" style={{ alignSelf: 'flex-end' }}>{`${lista.length} de ${(pessoas.dados ?? []).length} pessoas`}</span>
        {(q.trim() || com) && lista.length > 0 && <button className="sec" style={{ alignSelf: 'flex-end' }} disabled={ocupado} onClick={() => void apagarLista()}>{`Apagar as ${lista.length} da lista`}</button>}
      </div>

      <Estado aCarregar={pessoas.aCarregar} erro={pessoas.erro} vazio={!pessoas.dados?.length} />
      {!!pessoas.dados?.length && (
        <div className="tabela"><table>
          <thead><tr><th>Nome</th><th>Telemóvel</th><th>Contribuinte</th><th>E-mail</th><th>Comunidade</th><th>Origem</th><th /></tr></thead>
          <tbody>
            {lista.slice(0, 500).map((p) => (
              <tr key={p.id}>
                <td>{p.nome}{p.notas && <div className="small muted">{p.notas}</div>}</td>
                <td className="small">{p.telefone ? telTxt(p.telefone) : '—'}</td>
                <td>{p.nif ?? '—'}</td>
                <td className="small">{p.email ?? '—'}</td>
                <td>{nomeCom(p.comunidadeId)}</td>
                <td className="small">{p.manual ? 'Editada à mão' : 'Jotform'}{p.fontes.length ? <span className="muted">{` · ${p.fontes.length} registo${p.fontes.length === 1 ? '' : 's'}`}</span> : null}</td>
                <td>
                  <div className="acoes" style={{ margin: 0, flexWrap: 'nowrap' }}>
                    <button className="link" onClick={() => { setErro(null); setEdit({ novo: false, id: p.id, nome: p.nome, telefone: p.telefone, nif: p.nif ?? '', email: p.email ?? '', comunidadeId: p.comunidadeId ?? '', notas: p.notas ?? '' }); }}>Editar</button>
                    <button className="link" onClick={() => void apagar(p)}>Apagar</button>
                  </div>
                </td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={7} className="muted">Nenhuma pessoa com este filtro.</td></tr>}
          </tbody>
        </table></div>
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
