import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Estado, Modal, mensagemErro, useCarregar, useFiltros } from '../components/ui';
import { auditar, listarComunidades, listarLotes } from '../lib/db';
import {
  apagarPessoa, fundirComJotform, gravarPessoa, gravarPessoas, listarPessoas, normEmail, normNif, pessoasDoJotform, procurarPessoas, type Pessoa,
} from '../lib/pessoas';
import { normalizarTelefones } from '../lib/reconciliacaoReembolsos';

type Edicao = { novo: boolean; id: string; nome: string; telefones: string; nif: string; emails: string; comunidadeId: string; notas: string };
const vazia: Edicao = { novo: true, id: '', nome: '', telefones: '', nif: '', emails: '', comunidadeId: '', notas: '' };
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
      if (!confirm(`Atualizar a base a partir do Jotform (Contribuir e Despesas de ${ano - 1} e ${ano})?\n\n${r.novas.length} pessoas novas e ${r.atualizadas.length} atualizadas. As editadas à mão só recebem telefones e e-mails novos.`)) return;
      await gravarPessoas([...r.novas, ...r.atualizadas]);
      await auditar(acesso!.email, 'pessoas', `Atualizadas a partir do Jotform (${ano - 1}-${ano}): ${r.novas.length} novas, ${r.atualizadas.length} atualizadas`);
      await pessoas.recarregar();
      setMsg(`${r.novas.length} pessoas novas e ${r.atualizadas.length} atualizadas a partir do Jotform.`);
    } catch (e) { setErro(mensagemErro(e)); } finally { setOcupado(false); }
  }

  async function guardar() {
    if (!edit) return;
    setErro(null);
    const telefones = normalizarTelefones(edit.telefones.replace(/[,;/]+/g, ''));
    const emails = [...new Set(edit.emails.split(/[,;\s]+/).map((e) => normEmail(e)).filter(Boolean) as string[])];
    const nif = edit.nif.trim() ? normNif(edit.nif) : undefined;
    if (!edit.nome.trim()) return setErro('Indique o nome.');
    if (edit.nif.trim() && !nif) return setErro('O contribuinte (NIF) tem de ter 9 dígitos.');
    if (edit.telefones.trim() && !telefones.length) return setErro('Os telefones têm de ter 9 dígitos começados por 9 (pode separar vários por vírgula).');
    if (edit.emails.trim() && !emails.length) return setErro('E-mail inválido.');
    const outra = (pessoas.dados ?? []).find((p) => p.id !== edit.id && ((nif && p.nif === nif) || p.emails.some((e) => emails.includes(e))));
    if (outra && !confirm(`${outra.nome} já tem este NIF ou e-mail. Gravar mesmo assim?`)) return;
    const agora = new Date().toISOString();
    const antes = (pessoas.dados ?? []).find((p) => p.id === edit.id);
    const id = edit.id || (nif ? `nif-${nif}` : `manual-${Date.now()}`);
    const p: Pessoa = {
      ...(antes ?? { fontes: [], criadoEm: agora }), id, nome: edit.nome.replace(/\s+/g, ' ').trim(), telefones, emails, nif,
      comunidadeId: edit.comunidadeId || undefined, notas: edit.notas.trim() || undefined, manual: true, atualizadoEm: agora, atualizadoPor: acesso!.email,
    } as Pessoa;
    try {
      await gravarPessoa(p);
      await auditar(acesso!.email, 'pessoas', `${edit.novo ? 'Criada' : 'Editada'}: ${p.nome}`);
      setEdit(null); await pessoas.recarregar();
    } catch (e) { setErro(mensagemErro(e)); }
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
          <p className="muted">Base confidencial de nome, telefone, contribuinte, e-mail e comunidade, para futuras consolidações e registos. Só o Master e o CAF a veem. A proposta vem do Jotform (Contribuir e Registo de Despesas) e junta a mesma pessoa pelo NIF, e-mail ou telefone; as pessoas editadas à mão não são substituídas. Todas as alterações ficam na auditoria.</p>
        </div>
        <div className="acoes">
          <button className="sec" disabled={ocupado || !pessoas.dados} onClick={() => void atualizarDoJotform()}>{ocupado ? 'A ler o Jotform…' : `Atualizar a partir do Jotform (${ano - 1} e ${ano})`}</button>
          <button onClick={() => { setErro(null); setEdit({ ...vazia }); }}>Nova pessoa</button>
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
      </div>

      <Estado aCarregar={pessoas.aCarregar} erro={pessoas.erro} vazio={!pessoas.dados?.length} />
      {!!pessoas.dados?.length && (
        <div className="tabela"><table>
          <thead><tr><th>Nome</th><th>Telefones</th><th>Contribuinte</th><th>E-mail</th><th>Comunidade</th><th>Origem</th><th /></tr></thead>
          <tbody>
            {lista.slice(0, 500).map((p) => (
              <tr key={p.id}>
                <td>{p.nome}{p.notas && <div className="small muted">{p.notas}</div>}</td>
                <td className="small">{p.telefones.map(telTxt).join(', ') || '—'}</td>
                <td>{p.nif ?? '—'}</td>
                <td className="small">{p.emails.join(', ') || '—'}</td>
                <td>{nomeCom(p.comunidadeId)}</td>
                <td className="small">{p.manual ? 'Editada à mão' : 'Jotform'}{p.fontes.length ? <span className="muted">{` · ${p.fontes.length} registo${p.fontes.length === 1 ? '' : 's'}`}</span> : null}</td>
                <td>
                  <div className="acoes" style={{ margin: 0, flexWrap: 'nowrap' }}>
                    <button className="link" onClick={() => { setErro(null); setEdit({ novo: false, id: p.id, nome: p.nome, telefones: p.telefones.join(', '), nif: p.nif ?? '', emails: p.emails.join(', '), comunidadeId: p.comunidadeId ?? '', notas: p.notas ?? '' }); }}>Editar</button>
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
            <label className="campo">Nome<input value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} /></label>
            <label className="campo">Telefones (separe por vírgula)<input inputMode="tel" value={edit.telefones} onChange={(e) => setEdit({ ...edit, telefones: e.target.value })} /></label>
            <label className="campo">Contribuinte (NIF)<input inputMode="numeric" value={edit.nif} onChange={(e) => setEdit({ ...edit, nif: e.target.value })} /></label>
            <label className="campo">E-mail (separe por vírgula)<input type="text" inputMode="email" value={edit.emails} onChange={(e) => setEdit({ ...edit, emails: e.target.value })} /></label>
            <label className="campo">Comunidade
              <select value={edit.comunidadeId} onChange={(e) => setEdit({ ...edit, comunidadeId: e.target.value })}>
                <option value="">—</option>
                {(coms.dados ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
            <label className="campo">Notas<input value={edit.notas} onChange={(e) => setEdit({ ...edit, notas: e.target.value })} /></label>
          </div>
          <p className="small muted">Depois de gravada à mão, a atualização a partir do Jotform só acrescenta telefones e e-mails novos.</p>
          <div className="acoes">
            <button onClick={() => void guardar()}>Gravar</button>
            <button className="sec" onClick={() => setEdit(null)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </>
  );
}
