import { useEffect, useState } from 'react';
import { SyncEstado } from '../components/SyncEstado';
import { useAuth } from '../auth/AuthProvider';
import { CampoData, Estado, Modal, mensagemErro, useCarregar } from '../components/ui';
import { apagar, auditar, gravar, gravarSegredoJotform, lerSegredoJotform, listarCategorias, listarComunidades, listarContas, listarDimensoes, listarRegrasBanco, listarResumos, listarLotes, lerConfigAssistencia, gravarConfigAssistencia, listarExcecoes, gravarExcecao, apagarExcecao } from '../lib/db';
import { COMUNIDADES, CONTAS, JOTFORM_FORMS } from '../lib/seed';
import { categoriasDoPlano, dimensoesDoPlano } from '../lib/plano';
import { REGRAS_INICIAIS, type RegraBanco } from '../lib/classificacaoBanco';
import { NIVEIS, NIVEL_LABEL, type Categoria, type Comunidade, type Conta, type Dimensao, type Nivel } from '../lib/types';
import { formatarIban, ibanValido, limparIban } from '../lib/iban';
import { usosCategoria, usosComunidade, usosConta } from '../lib/uso';
import { dataPT, parseData, slug } from '../lib/format';
import { eventosEfetivos } from '../lib/eventos';
import ConfigEventos from './ConfigEventos';
import type { ExcecaoAssistencia } from '../lib/types';
import { testarChave, type ResultadoTeste } from '../lib/jotform';
import { sincronizarAgora } from '../lib/syncWeb';
import { categoriasEmFalta, rubricaInicial } from '../lib/rubricas';
import { recalcularAno } from '../lib/recalcular';
import { EditorConta, resumoMapa } from '../components/MapaExtratoEditor';
import { LogoConta } from '../components/LogoBanco';
import { NOME_BANCO, bancoDaConta } from '../lib/banco';

type Edicao =
  | { tipo: 'comunidade'; novo: boolean; v: Comunidade }
  | { tipo: 'conta'; novo: boolean; v: Conta }
  | { tipo: 'categoria'; novo: boolean; v: Categoria }
  | { tipo: 'dimensao'; novo: boolean; v: Dimensao };

const TIPO_CAT: Record<Categoria['tipo'], string> = { saida: 'Despesa', entrada: 'Receita', financeiro: 'Financeiro' };
const TIPO_DIM: Record<Dimensao['tipo'], string> = { centro: 'Centros de custo', projeto: 'Projetos e eventos', fornecedor: 'Fornecedores', conta: 'Contas analíticas' };
const colecao = (t: Edicao['tipo']) => (t === 'comunidade' ? 'comunidades' : t === 'conta' ? 'contas' : t === 'dimensao' ? 'dimensoes' : 'categorias');

const ativoTxt = (a?: boolean) => (a === false ? <span className="etiqueta">Inativa</span> : null);

export default function Configuracao() {
  const { acesso } = useAuth();
  const coms = useCarregar(listarComunidades, []);
  const contas = useCarregar(listarContas, []);
  const cats = useCarregar(listarCategorias, []);
  const dims = useCarregar(listarDimensoes, []);
  const regras = useCarregar(listarRegrasBanco, []);
  const [regra, setRegra] = useState<RegraBanco | null>(null);
  const [contaExt, setContaExt] = useState<Conta | null>(null);
  const [tipoDim, setTipoDim] = useState<Dimensao['tipo']>('centro');
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [edit, setEdit] = useState<Edicao | null>(null);
  const [jot, setJot] = useState({ apiKey: '', base: 'https://eu-api.jotform.com' });
  useEffect(() => { if (acesso?.papel === 'master') void lerSegredoJotform().then((j) => j && setJot({ apiKey: j.apiKey ? '••••••••' : '', base: j.base })); }, [acesso?.papel]);
  async function guardarJotform() {
    if (jot.apiKey.startsWith('•')) { setMsg('Introduza a nova chave para a substituir.'); return; }
    try {
      await gravarSegredoJotform(jot);
      await auditar(acesso!.email, 'configurar jotform', jot.base);
      setJot({ ...jot, apiKey: '••••••••' }); setMsg('Chave Jotform guardada (só o Master a pode ler). A próxima sincronização automática já a usa.');
    } catch (e) { setMsg(mensagemErro(e)); }
  }
  const [syncVersao, setSyncVersao] = useState(0);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [aSincronizar, setASincronizar] = useState(false);
  async function forcarSync(modo: 'incremental' | 'completo' = 'incremental') {
    let desde: string | undefined;
    if (modo === 'completo') {
      // Data de referência da releitura: só entram submissões e movimentos a partir dela.
      const resposta = prompt('Reler tudo do Jotform a partir de que data de referência?\n\nFormato: DD/MM/AAAA. Só entram registos a partir desta data.', '01/01/2015');
      if (resposta == null) return;
      desde = parseData(resposta.trim()) ?? undefined;
      if (!desde) { setSyncMsg('Data inválida. Use o formato DD/MM/AAAA (ex.: 01/01/2015).'); return; }
      if (!confirm(`Reler tudo do Jotform desde ${desde.split('-').reverse().join('/')}?\n\nOs lotes dos meses abertos são substituídos: sai o que deixou de cumprir as regras (ex.: contribuições com o campo Pago em branco), o que foi apagado no Jotform e o que ficou anterior à data de referência. Meses fechados não mudam. Pode demorar alguns minutos.`)) return;
    } else if (!confirm('Sincronizar agora com o Jotform? Só são integradas as submissões novas desde a última sincronização.')) return;
    setASincronizar(true); setSyncMsg('A iniciar…');
    try {
      const e = await sincronizarAgora(acesso!, setSyncMsg, modo, desde);
      const novos = Object.values(e.resultado).reduce((s, r) => s + r.novos, 0);
      const naoPagas = e.resultado.contribuir?.naoPagas ?? 0;
      const removidos = Object.values(e.resultado).reduce((s, r) => s + r.removidos, 0);
      if (!e.ok) setSyncMsg(`Terminou com erros: ${e.erros.join('; ')}`);
      else if (modo === 'completo') setSyncMsg(`Releitura concluída: ${novos} registos integrados, ${naoPagas} contribuições por pagar excluídas, ${removidos} lote(s) removidos; resumos recalculados.`);
      else setSyncMsg(novos ? `Concluído: ${novos} registo${novos === 1 ? '' : 's'} novo${novos === 1 ? '' : 's'} integrado${novos === 1 ? '' : 's'}; resumos recalculados.` : 'Concluído: não havia submissões novas.');
    } catch (e) { setSyncMsg(mensagemErro(e)); }
    finally { setASincronizar(false); setSyncVersao((v) => v + 1); }
  }
  // Tipo de evento que conta como celebração de domingo (médias da bolsa geral, dos gerais e por pessoa).
  const anoCfg = new Date().getFullYear();
  const configAss = useCarregar(lerConfigAssistencia, []);
  const tiposEvento = useCarregar(async () => {
    const ls = [...await listarLotes(acesso!, 'assistencia', anoCfg - 1), ...await listarLotes(acesso!, 'assistencia', anoCfg)];
    const conta = new Map<string, number>();
    for (const l of ls) for (const r of l.registos) { const e = r.evento?.trim(); if (e) conta.set(e, (conta.get(e) ?? 0) + 1); }
    return [...conta.entries()].sort((a, b) => b[1] - a[1]);
  }, [acesso?.email]);
  const [tipoNovo, setTipoNovo] = useState<string | null>(null);
  const [msgTipo, setMsgTipo] = useState<string | null>(null);
  async function guardarTipo() {
    const v = tipoNovo ?? configAss.dados?.eventoCelebracao ?? '';
    setMsgTipo('A guardar e a recalcular resumos…');
    try {
      await gravarConfigAssistencia({ ...(configAss.dados ?? { eventoCelebracao: null }), eventoCelebracao: v || null, atualizadoPor: acesso!.email, atualizadoEm: new Date().toISOString() });
      await auditar(acesso!.email, 'tipo de celebração', v || '(nenhum: contar os domingos)');
      for (const a of [anoCfg - 1, anoCfg]) await recalcularAno(acesso!, a);
      await configAss.recarregar(); setTipoNovo(null);
      setMsgTipo(`Guardado. Resumos de ${anoCfg - 1} e ${anoCfg} recalculados.`);
    } catch (e) { setMsgTipo(mensagemErro(e)); }
  }
  // Separadores por área, para a página não ficar toda junta.
  const [area, setArea] = useState<'estrutura' | 'assistencia' | 'jotform'>('estrutura');
  // Exceções de assistência (domingos sem culto esperado).
  const excecoes = useCarregar(listarExcecoes, []);
  const [nova, setNova] = useState({ data: '', ambito: 'cclx', motivo: '' });
  const [msgExc, setMsgExc] = useState<string | null>(null);
  const dataPt = (d: string) => d.split('-').reverse().join('/');
  const nomeCom = (id: string) => (coms.dados ?? []).find((c) => c.id === id)?.nome ?? id;
  async function guardarExcecao() {
    setMsgExc(null);
    try {
      if (!nova.motivo.trim()) throw new Error('Indique o motivo.');
      const e: ExcecaoAssistencia = { id: `${nova.data}_${nova.ambito}`, data: nova.data, ambito: nova.ambito, motivo: nova.motivo.trim(), criadoPor: acesso!.email, criadoEm: new Date().toISOString() };
      await gravarExcecao(e);
      await auditar(acesso!.email, 'exceção de assistência', `${dataPT(e.data)} · ${e.ambito === 'cclx' ? 'Toda a CCLX' : nomeCom(e.ambito)} · ${e.motivo}`);
      setNova({ data: '', ambito: 'cclx', motivo: '' });
      await excecoes.recarregar();
    } catch (err) { setMsgExc(err instanceof Error ? err.message : String(err)); }
  }
  async function removerExcecao(e: ExcecaoAssistencia) {
    if (!confirm(`Apagar a exceção de ${dataPt(e.data)}?`)) return;
    await apagarExcecao(e.id);
    await auditar(acesso!.email, 'apagar exceção de assistência', `${dataPT(e.data)} · ${e.ambito}`);
    await excecoes.recarregar();
  }
  // Eventos configurados (Configuração → Assistência → Eventos), para o tipo de celebração.
  const eventosCfg = eventosEfetivos(configAss.dados).map((e) => e.nome);
  const [teste, setTeste] = useState<ResultadoTeste | null>(null);
  const [aTestar, setATestar] = useState(false);
  async function testarJotform() {
    setATestar(true); setTeste(null);
    try {
      // Usa a chave escrita no campo; se estiver mascarada, usa a guardada no Firebase.
      let cfg = jot;
      if (!jot.apiKey || jot.apiKey.startsWith('•')) {
        const g = await lerSegredoJotform();
        if (!g?.apiKey) { setTeste({ ok: false, formularios: [], erro: 'Ainda não há chave guardada.' }); return; }
        cfg = { apiKey: g.apiKey, base: jot.base || g.base };
      }
      const r = await testarChave(cfg, Object.values(JOTFORM_FORMS));
      setTeste(r);
      await auditar(acesso!.email, 'testar chave jotform', r.ok ? 'ok' : (r.erro ?? 'falhou'));
    } catch (e) { setTeste({ ok: false, formularios: [], erro: mensagemErro(e) }); }
    finally { setATestar(false); }
  }
  const [filtroCat, setFiltroCat] = useState<'todas' | Categoria['tipo']>('todas');
  const recarregar = () => Promise.all([coms.recarregar(), contas.recarregar(), cats.recarregar(), dims.recarregar(), regras.recarregar()]);

  async function inicializar() {
    setOcupado(true); setMsg(null);
    try {
      const comEx = new Set((coms.dados ?? []).map((c) => c.id));
      const contaEx = new Set((contas.dados ?? []).map((c) => c.id));
      for (const c of COMUNIDADES) if (!comEx.has(c.id)) await gravar('comunidades', { ...c, ativo: true });
      for (const c of CONTAS) if (!contaEx.has(c.id)) await gravar('contas', { ...c, ativo: true });
      await auditar(acesso!.email, 'inicializar', 'Comunidades e contas (só as que faltavam)');
      await recarregar();
      setMsg('Comunidades e contas criadas. As que já existiam não foram alteradas.');
    } catch (e) { setMsg(mensagemErro(e)); } finally { setOcupado(false); }
  }

  /** Cria as categorias e as dimensões do plano financeiro que ainda não existem (não altera as editadas). */
  async function carregarPlano() {
    setOcupado(true); setMsg(null);
    try {
      const catEx = new Set((cats.dados ?? []).map((c) => c.id));
      const dimEx = new Set((dims.dados ?? []).map((d) => d.id));
      const novasC = categoriasDoPlano().filter((c) => !catEx.has(c.id));
      const novasD = dimensoesDoPlano().filter((d) => !dimEx.has(d.id));
      for (let i = 0; i < novasC.length; i += 20) await Promise.all(novasC.slice(i, i + 20).map((c) => gravar('categorias', c)));
      for (let i = 0; i < novasD.length; i += 20) await Promise.all(novasD.slice(i, i + 20).map((d) => gravar('dimensoes', d)));
      const regEx = new Set((regras.dados ?? []).map((x) => x.id));
      const novasR = REGRAS_INICIAIS.filter((x) => !regEx.has(x.id));
      for (const x of novasR) await gravar('regras_banco', x);
      await auditar(acesso!.email, 'carregar plano financeiro', `${novasC.length} categorias, ${novasD.length} dimensões, ${novasR.length} regras dos extratos`);
      await recarregar();
      setMsg(`Plano financeiro carregado: ${novasC.length} categorias, ${novasD.length} dimensões e ${novasR.length} regras dos extratos novas. O que já existia não foi alterado.`);
    } catch (e) { setMsg(mensagemErro(e)); } finally { setOcupado(false); }
  }

  async function guardarRegra() {
    if (!regra) return;
    try {
      if (!regra.padrao.trim() || !regra.categoria) throw new Error('Indique o texto e a categoria.');
      const v = { ...regra, id: regra.id || slug(regra.padrao), padrao: regra.padrao.trim() };
      await gravar('regras_banco', v);
      await auditar(acesso!.email, 'regra dos extratos', `${v.padrao} → ${v.categoria}`);
      setRegra(null); await regras.recarregar();
    } catch (e) { setMsg(mensagemErro(e)); }
  }
  async function apagarRegra(x: RegraBanco) {
    if (!confirm(`Apagar a regra "${x.padrao}"?`)) return;
    try { await apagar('regras_banco', x.id); await auditar(acesso!.email, 'apagar regra dos extratos', x.padrao); await regras.recarregar(); } catch (e) { setMsg(mensagemErro(e)); }
  }

  /** Lista as categorias usadas nos dados (Jotform) que não correspondem a nenhuma categoria nem sinónimo. */
  async function semCorrespondencia() {
    setOcupado(true); setMsg(null);
    try {
      const ano = new Date().getFullYear();
      const resumos = [...await listarResumos(acesso!, ano - 1), ...await listarResumos(acesso!, ano)];
      const faltam = categoriasEmFalta(cats.dados ?? [], resumos.flatMap((r) => r.meses));
      setMsg(faltam.length
        ? `Sem correspondência no plano (${faltam.length}): ${faltam.map((f) => `${f.nome} (${f.tipo === 'entrada' ? 'receita' : 'despesa'})`).join('; ')}. Acrescente cada nome como sinónimo da categoria certa; até lá entram em "Por classificar".`
        : 'Todas as categorias usadas nos dados correspondem a uma categoria ou sinónimo do plano. (Se os resumos ainda não foram calculados, calcule-os primeiro.)');
    } catch (e) { setMsg(mensagemErro(e)); } finally { setOcupado(false); }
  }

  async function guardar() {
    if (!edit) return;
    setMsg(null);
    let recalcularDepois = false;
    try {
      if (edit.tipo === 'comunidade') {
        const v = { ...edit.v, id: edit.novo ? slug(edit.v.nome) : edit.v.id, inicio: edit.v.inicio || null, fim: edit.v.fim || null, sucessora: edit.v.fim ? edit.v.sucessora || undefined : undefined };
        if (!v.nome.trim()) throw new Error('Indique o nome.');
        if (v.sucessora === v.id) throw new Error('A comunidade sucessora tem de ser outra.');
        const antes = (coms.dados ?? []).find((c) => c.id === v.id);
        if (!edit.novo && (antes?.sucessora !== v.sucessora || antes?.fim !== v.fim)) recalcularDepois = true;
        if (edit.novo && (coms.dados ?? []).some((c) => c.id === v.id)) throw new Error('Já existe uma comunidade com este nome.');
        await gravar('comunidades', v);
      } else if (edit.tipo === 'conta') {
        const iban = edit.v.iban ? limparIban(edit.v.iban) : '';
        if (iban && !ibanValido(iban)) throw new Error('IBAN inválido (verifique os dígitos de controlo).');
        const v = { ...edit.v, iban, id: edit.novo ? slug(edit.v.nome) : edit.v.id };
        if (!v.nome.trim()) throw new Error('Indique o nome.');
        await gravar('contas', v);
      } else if (edit.tipo === 'dimensao') {
        const v = { ...edit.v, id: edit.novo ? `${edit.v.tipo}-${slug(edit.v.codigo || edit.v.nome)}` : edit.v.id };
        if (!v.nome.trim()) throw new Error('Indique o nome.');
        if (edit.novo && (dims.dados ?? []).some((d) => d.id === v.id)) throw new Error('Já existe.');
        await gravar('dimensoes', v);
      } else {
        const v = { ...edit.v, id: edit.novo ? (edit.v.codigo ? `plano-${edit.v.codigo.replace('.', '-').toLowerCase()}` : `${edit.v.tipo}-${slug(edit.v.nome)}`) : edit.v.id };
        v.sinonimos = (v.sinonimos ?? []).map((x) => x.trim()).filter(Boolean);
        if (!v.nome.trim()) throw new Error('Indique o nome.');
        if (edit.novo && (cats.dados ?? []).some((c) => c.id === v.id)) throw new Error('Já existe esta categoria.');
        const antes = (cats.dados ?? []).find((c) => c.id === v.id);
        v.rubrica = v.rubrica || rubricaInicial(v.nome, v.tipo);
        v.ambito = v.ambito ?? 'local';
        await gravar('categorias', v);
        if (!antes || antes.rubrica !== v.rubrica || (antes.ambito ?? 'local') !== v.ambito || antes.nivel !== v.nivel) recalcularDepois = true;
      }
      await auditar(acesso!.email, `${edit.novo ? 'criar' : 'editar'} ${edit.tipo}`, `${edit.v.nome}`);
      setEdit(null); await recarregar();
      if (recalcularDepois) {
        // Rubrica, âmbito ou nível mudam a repartição dos gerais: recalcula o ano atual e o anterior.
        const ano = new Date().getFullYear();
        setMsg('Categoria guardada. A recalcular resumos (repartição dos gerais)…');
        for (const a of [ano - 1, ano]) await recalcularAno(acesso!, a);
        setMsg(`Categoria guardada. Resumos de ${ano - 1} e ${ano} recalculados.`);
      }
    } catch (e) { setMsg(mensagemErro(e)); }
  }

  async function remover(tipo: Edicao['tipo'], id: string, nome: string) {
    setMsg(null);
    try {
      const usos = tipo === 'comunidade' ? await usosComunidade(id) : tipo === 'conta' ? await usosConta(id) : tipo === 'dimensao' ? [] : await usosCategoria(nome);
      if (usos.length) {
        setMsg(`Não é possível apagar "${nome}": tem dados associados (${usos.join(', ')}). Pode desativá-la para deixar de aparecer, mantendo o histórico.`);
        return;
      }
      if (!confirm(`Apagar "${nome}"? Esta ação não se pode desfazer.`)) return;
      await apagar(colecao(tipo), id);
      await auditar(acesso!.email, `apagar ${tipo}`, nome);
      await recarregar();
    } catch (e) { setMsg(mensagemErro(e)); }
  }

  async function alternarAtivo(tipo: Edicao['tipo'], v: Comunidade | Conta | Categoria | Dimensao) {
    try {
      const col = colecao(tipo);
      await gravar(col, { ...v, ativo: v.ativo === false });
      await auditar(acesso!.email, v.ativo === false ? `ativar ${tipo}` : `desativar ${tipo}`, v.nome);
      await recarregar();
    } catch (e) { setMsg(mensagemErro(e)); }
  }

  const acoes = (tipo: Edicao['tipo'], v: Comunidade | Conta | Categoria | Dimensao, especial = false) => (
    <>
      <button className="link" onClick={() => setEdit({ tipo, novo: false, v } as Edicao)}>Editar</button>
      {!especial && <> · <button className="link" onClick={() => alternarAtivo(tipo, v)}>{v.ativo === false ? 'Ativar' : 'Desativar'}</button>
        · <button className="link" onClick={() => remover(tipo, v.id, v.nome)}>Apagar</button></>}
    </>
  );
  const catsVis = (cats.dados ?? []).filter((c) => filtroCat === 'todas' || c.tipo === filtroCat);
  const rubricas = [...new Set((cats.dados ?? []).map((c) => c.rubrica).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt'));
  const dimsVis = (dims.dados ?? []).filter((d) => d.tipo === tipoDim);

  return (
    <>
      <h1>Configuração</h1>
      <p className="muted">Só o Master e o CAF podem criar, alterar ou apagar. Entidades com dados não se apagam: desativam-se, para manter o histórico. Todas as alterações ficam na auditoria.</p>
      {msg && <div className="nota">{msg}</div>}

      <div className="abas" role="tablist">
        {([['estrutura', 'Comunidades, contas e categorias'], ['assistencia', 'Assistência'], ['jotform', 'Jotform e sincronização']] as const).map(([k, rot]) => (
          <button key={k} role="tab" aria-selected={area === k} className={area === k ? 'ativa' : ''} onClick={() => setArea(k)}>{rot}</button>
        ))}
      </div>

      {area === 'estrutura' && <>
      <div className="sec card">
        <h2>Plano financeiro</h2>
        <p className="small">Carrega as categorias com código (despesas 01 a 09, receitas R1 a R3, financeiro F1 a F3), os 15 centros de custo, os fornecedores e as contas analíticas da Proposta de Plano Financeiro (v2.1). Cria só o que ainda não existe; o que foi editado mantém-se. Tudo fica Privado, exceto vencimentos e donativos (Confidencial).</p>
        <div className="acoes" style={{ margin: 0 }}>
          <button disabled={ocupado} onClick={() => void carregarPlano()}>Carregar plano financeiro</button>
          <button className="sec" disabled={ocupado} onClick={inicializar} title="Cria as comunidades e as contas bancárias que faltarem">Criar comunidades e contas em falta</button>
        </div>
      </div>

      <div className="sec">
        <div className="linha" style={{ justifyContent: 'space-between' }}>
          <h2>Comunidades</h2>
          <button onClick={() => setEdit({ tipo: 'comunidade', novo: true, v: { id: '', nome: '', ordem: (coms.dados?.length ?? 0) + 1, ativo: true } })}>Nova comunidade</button>
        </div>
        <Estado aCarregar={coms.aCarregar} erro={coms.erro} vazio={!coms.dados?.length} />
        <div className="tabela"><table>
          <thead><tr><th>Ordem</th><th>Comunidade</th><th>Início</th><th>Fim</th><th>Estado</th><th /></tr></thead>
          <tbody>{(coms.dados ?? []).map((c) => (
            <tr key={c.id}>
              <td>{c.ordem}</td><td>{c.nome}{c.especial && <span className="muted"> (especial)</span>}</td>
              <td>{c.inicio ? c.inicio.split('-').reverse().join('/') : '—'}</td><td>{c.fim ? c.fim.split('-').reverse().join('/') : '—'}{c.sucessora && <div className="small muted">{`passa para ${(coms.dados ?? []).find((x) => x.id === c.sucessora)?.nome ?? c.sucessora}`}</div>}</td>
              <td>{ativoTxt(c.ativo) ?? 'Ativa'}</td><td>{acoes('comunidade', c, c.especial)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>

      <div className="sec">
        <div className="linha" style={{ justifyContent: 'space-between' }}>
          <h2>Contas bancárias</h2>
          <button onClick={() => setEdit({ tipo: 'conta', novo: true, v: { id: '', nome: '', banco: '', tipo: 'corrente', iban: '', ativo: true } })}>Nova conta</button>
        </div>
        <p className="muted">Em <b>Extrato e logótipo</b> indica as colunas do extrato de cada conta (a partir de um ficheiro de exemplo) e carrega o logótipo. Ao importar, o portal reconhece o ficheiro, escolhe a conta e aplica as colunas sozinho. Os extratos da CGD e do Santander são reconhecidos mesmo sem mapeamento.</p>
        <div className="tabela"><table>
          <thead><tr><th /><th>Conta</th><th>Banco</th><th>Tipo</th><th>IBAN</th><th>Colunas do extrato</th><th>Nota</th><th>Estado</th><th /></tr></thead>
          <tbody>{(contas.dados ?? []).map((c) => (
            <tr key={c.id}>
              <td><LogoConta conta={c} tamanho={22} /></td><td>{c.nome}</td><td>{c.banco}</td><td>{c.tipo === 'investimentos' ? 'Investimentos' : c.tipo === 'principal' ? 'Principal' : 'Corrente'}</td>
              <td className="small" style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatarIban(c.iban) || <span className="muted">por preencher</span>}</td>
              <td className="small">{resumoMapa(c) ?? (bancoDaConta(c) ? <span className="muted">Automático ({NOME_BANCO[bancoDaConta(c)!]})</span> : <span className="muted">por definir</span>)}</td>
              <td className="small">{c.etiqueta}</td><td>{ativoTxt(c.ativo) ?? 'Ativa'}</td>
              <td style={{ whiteSpace: 'nowrap' }}><button className="link" onClick={() => setContaExt(c)}>Extrato e logótipo</button> · {acoes('conta', c)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>

      {contaExt && <EditorConta conta={contaExt} email={acesso!.email} onFechar={() => setContaExt(null)} onGuardado={() => { setContaExt(null); void contas.recarregar(); }} />}

      <div className="sec">
        <div className="linha" style={{ justifyContent: 'space-between' }}>
          <h2>Categorias do plano e níveis de privacidade</h2>
          <div className="acoes" style={{ margin: 0 }}>
            <select value={filtroCat} onChange={(e) => setFiltroCat(e.target.value as typeof filtroCat)} aria-label="Filtrar categorias">
              <option value="todas">Todas</option><option value="saida">Despesas</option><option value="entrada">Receitas</option><option value="financeiro">Financeiro</option>
            </select>
            <button onClick={() => setEdit({ tipo: 'categoria', novo: true, v: { id: '', codigo: '', nome: '', tipo: 'saida', atividade: '', nivel: 'privado', snc: '', origem: 'portal', ativo: true, ambito: 'local', sinonimos: [] } })}>Nova categoria</button>
            <button className="sec" onClick={() => void semCorrespondencia()} disabled={ocupado} title="Mostra as categorias do Jotform que não correspondem a nenhuma categoria nem sinónimo">Ver categorias do Jotform sem correspondência</button>
          </div>
        </div>
        <p className="muted">Os <b>sinónimos</b> ligam os nomes usados no Jotform (ex.: Dízimos, Coletas em dinheiro, Limpeza) às categorias do plano. Movimentos <b>financeiros</b> (depósitos, transferências internas, empréstimos, adiantamentos) não entram nos resultados.</p>
        <Estado aCarregar={cats.aCarregar} erro={cats.erro} vazio={!catsVis.length} />
        {!!catsVis.length && <div className="tabela"><table>
          <thead><tr><th>Categoria</th><th>Tipo</th><th>Rubrica</th><th>Âmbito</th><th>Nível</th><th>Sinónimos</th><th>Estado</th><th /></tr></thead>
          <tbody>{catsVis.map((c) => (
            <tr key={c.id}>
              <td>{c.nome}</td><td>{TIPO_CAT[c.tipo]}</td>
              <td>{c.rubrica || <span className="muted">{rubricaInicial(c.nome, c.tipo)} (proposta)</span>}</td>
              <td>{c.ambito === 'geral' ? <span className="etiqueta preta">Geral</span> : 'Local'}</td>
              <td><span className={'etiqueta' + (c.nivel === 'confidencial' ? ' preta' : '')}>{NIVEL_LABEL[c.nivel]}</span></td>
              <td className="small">{(c.sinonimos ?? []).join(', ') || <span className="muted">—</span>}</td>
              <td>{ativoTxt(c.ativo) ?? 'Ativa'}</td><td>{acoes('categoria', c)}</td>
            </tr>
          ))}</tbody>
        </table></div>}
      </div>

      <div className="sec">
        <div className="linha" style={{ justifyContent: 'space-between' }}>
          <h2>Dimensões do plano</h2>
          <div className="acoes" style={{ margin: 0 }}>
            <select value={tipoDim} onChange={(e) => setTipoDim(e.target.value as Dimensao['tipo'])} aria-label="Tipo de dimensão">
              {(Object.keys(TIPO_DIM) as Dimensao['tipo'][]).map((t) => <option key={t} value={t}>{TIPO_DIM[t]}</option>)}
            </select>
            <button onClick={() => setEdit({ tipo: 'dimensao', novo: true, v: { id: '', tipo: tipoDim, nome: '', codigo: '', ativo: true } })}>Novo</button>
          </div>
        </div>
        <p className="muted">Usadas na classificação dos extratos e dos custos fixos: centro de custo (finalidade ou área), projeto ou evento (iniciativa temporária), fornecedor (entidade) e conta analítica (detalhe da categoria).</p>
        <Estado aCarregar={dims.aCarregar} erro={dims.erro} vazio={!dimsVis.length} />
        {!!dimsVis.length && <div className="tabela"><table>
          <thead><tr>{tipoDim === 'centro' && <th>Código</th>}<th>Nome</th>{tipoDim === 'centro' && <th>Âmbito</th>}{tipoDim === 'conta' && <th>Categoria</th>}<th>Estado</th><th /></tr></thead>
          <tbody>{dimsVis.map((d) => (
            <tr key={d.id}>
              {tipoDim === 'centro' && <td>{d.codigo}</td>}<td>{d.nome}</td>{tipoDim === 'centro' && <td>{d.ambito}</td>}
              {tipoDim === 'conta' && <td>{(cats.dados ?? []).find((c) => c.codigo === d.categoria)?.nome ?? d.categoria ?? '—'}</td>}
              <td>{ativoTxt(d.ativo) ?? 'Ativa'}</td><td>{acoes('dimensao', d)}</td>
            </tr>
          ))}</tbody>
        </table></div>}
      </div>

      </>}

      {area === 'estrutura' && <div className="sec">
        <div className="linha" style={{ justifyContent: 'space-between' }}>
          <h2>Regras dos extratos</h2>
          <button onClick={() => setRegra({ id: '', padrao: '', categoria: '', ativo: true })}>Nova regra</button>
        </div>
        <p className="muted">Quando o descritivo do banco contém o texto, a classificação proposta usa esta categoria, fornecedor e centro de custo. A conciliação com o Jotform, os vencimentos previstos e a memória dos movimentos já classificados vêm antes das regras.</p>
        <Estado aCarregar={regras.aCarregar} erro={regras.erro} vazio={!regras.dados?.length} />
        {!!regras.dados?.length && <div className="tabela"><table>
          <thead><tr><th>Texto no banco</th><th>Categoria</th><th>Fornecedor</th><th>Centro de custo</th><th>Estado</th><th /></tr></thead>
          <tbody>{(regras.dados ?? []).map((x) => (
            <tr key={x.id}><td>{x.padrao}</td><td>{x.categoria}</td><td>{x.fornecedor ?? '—'}</td><td>{x.centroCusto ?? '—'}</td><td>{ativoTxt(x.ativo) ?? 'Ativa'}</td>
              <td><button className="link" onClick={() => setRegra(x)}>Editar</button> · <button className="link" onClick={() => void apagarRegra(x)}>Apagar</button></td></tr>
          ))}</tbody>
        </table></div>}
      </div>}

      {regra && (
        <Modal titulo={regra.id ? 'Editar regra dos extratos' : 'Nova regra dos extratos'} onFechar={() => setRegra(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            <label className="campo">Texto no descritivo do banco<input value={regra.padrao} placeholder="MEO" onChange={(e) => setRegra({ ...regra, padrao: e.target.value })} /></label>
            <label className="campo">Categoria
              <select value={regra.categoria} onChange={(e) => setRegra({ ...regra, categoria: e.target.value })}>
                <option value="">—</option>{(cats.dados ?? []).filter((c) => c.codigo && c.ativo !== false).map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
              </select></label>
            <label className="campo">Fornecedor<input value={regra.fornecedor ?? ''} list="forn-regras" onChange={(e) => setRegra({ ...regra, fornecedor: e.target.value || undefined })} />
              <datalist id="forn-regras">{(dims.dados ?? []).filter((d) => d.tipo === 'fornecedor').map((d) => <option key={d.id} value={d.nome} />)}</datalist></label>
            <label className="campo">Centro de custo
              <select value={regra.centroCusto ?? ''} onChange={(e) => setRegra({ ...regra, centroCusto: e.target.value || undefined })}>
                <option value="">—</option>{(dims.dados ?? []).filter((d) => d.tipo === 'centro').map((d) => <option key={d.id} value={d.codigo}>{`${d.codigo} ${d.nome}`}</option>)}
              </select></label>
            <label className="campo">Comunidade (opcional)
              <select value={regra.comunidadeId ?? ''} onChange={(e) => setRegra({ ...regra, comunidadeId: e.target.value || undefined })}>
                <option value="">—</option>{(coms.dados ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select></label>
            <label className="opcao"><input type="checkbox" checked={regra.ativo !== false} onChange={(e) => setRegra({ ...regra, ativo: e.target.checked })} /> Ativa</label>
          </div>
          <div className="acoes" style={{ marginTop: 14 }}>
            <button onClick={() => void guardarRegra()}>Guardar</button>
            <button className="sec" onClick={() => setRegra(null)}>Cancelar</button>
          </div>
        </Modal>
      )}

      {area === 'assistencia' && <>
      <div className="sec card">
        <h2>Tipo de celebração</h2>
        <p className="small">Tipo de evento (campo "Evento" do Registo de Presenças) que conta como <b>celebração de domingo</b>. Só os registos deste tipo entram na média de jovens e adultos usada para repartir a bolsa geral e os gerais, e nos valores por pessoa; os domingos sem registo deste tipo aparecem como em falta.</p>
        {acesso?.papel === 'master' ? (
          <div className="linha">
            <label className="campo">Tipo de celebração
              <select value={tipoNovo ?? configAss.dados?.eventoCelebracao ?? ''} onChange={(e) => setTipoNovo(e.target.value)}>
                <option value="">Nenhum (contar os registos feitos ao domingo)</option>
                {[...new Map([...eventosCfg.map((t) => [t, 0] as [string, number]), ...(tiposEvento.dados ?? [])]).entries()].map(([t, n]) => <option key={t} value={t}>{t}{n ? ` (${n} registos)` : ''}</option>)}
                {configAss.dados?.eventoCelebracao && !(tiposEvento.dados ?? []).some(([t]) => t === configAss.dados?.eventoCelebracao) && <option value={configAss.dados.eventoCelebracao}>{configAss.dados.eventoCelebracao}</option>}
              </select>
            </label>
            <button onClick={() => void guardarTipo()} disabled={tipoNovo == null || tipoNovo === (configAss.dados?.eventoCelebracao ?? '')}>Guardar e recalcular</button>
          </div>
        ) : <p className="muted">Atual: {configAss.dados?.eventoCelebracao ? `"${configAss.dados.eventoCelebracao}"` : 'nenhum (contam os registos feitos ao domingo)'}. Só o Master altera.</p>}
        {msgTipo && <p className="small" style={{ marginTop: 8 }}>{msgTipo}</p>}
      </div>

      <ConfigEventos />

      <div className="sec">
        <h2>Datas sem assistência esperada (exceções)</h2>
        <p className="muted small">Por exemplo: culto conjunto, retiro ou encerramento. Podem valer para toda a CCLX ou só para uma comunidade. Nessa data, nenhum evento obrigatório aparece nos registos em falta.</p>
        <div className="filtros" style={{ alignItems: 'flex-end', marginBottom: 10 }}>
            <CampoData rotulo="Data" valor={nova.data} onChange={(d) => setNova({ ...nova, data: d })} />
            <label className="campo">Âmbito
              <select value={nova.ambito} onChange={(e) => setNova({ ...nova, ambito: e.target.value })}>
                <option value="cclx">Toda a CCLX</option>
                {(coms.dados ?? []).filter((c) => !c.especial).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
            <label className="campo">Motivo<input value={nova.motivo} onChange={(e) => setNova({ ...nova, motivo: e.target.value })} style={{ width: 240 }} /></label>
            <button onClick={() => void guardarExcecao()} disabled={!nova.data}>Acrescentar</button>
          </div>
        {msgExc && <div className="aviso">{msgExc}</div>}
        {(excecoes.dados ?? []).length ? (
          <div className="tabela"><table>
            <thead><tr><th>Data</th><th>Âmbito</th><th>Motivo</th><th>Registado por</th><th /></tr></thead>
            <tbody>{(excecoes.dados ?? []).map((e) => (
              <tr key={e.id}>
                <td>{dataPt(e.data)}</td><td>{e.ambito === 'cclx' ? 'Toda a CCLX' : nomeCom(e.ambito)}</td><td>{e.motivo}</td>
                <td className="small muted">{e.criadoPor}</td>
                <td><button className="link" onClick={() => void removerExcecao(e)}>Apagar</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <p className="muted">Sem exceções registadas.</p>}
      </div>

      </>}

      {area === 'jotform' && <>
      <div className="sec card">
        <h2>Sincronização automática com o Jotform (só leitura)</h2>
        <p className="small">Formulários: {Object.values(JOTFORM_FORMS).map((f) => `${f.nome} (${f.id})`).join(' · ')}.</p>
        <p className="small">Uma tarefa agendada no GitHub Actions lê os formulários 4 vezes por dia, grava os lotes mensais (sem tocar em meses fechados) e recalcula os resumos e a página pública.</p>
        <SyncEstado detalhe versao={syncVersao} />
        {acesso?.papel === 'master' ? (
          <div className="linha" style={{ alignItems: 'center' }}>
            <button onClick={() => void forcarSync()} disabled={aSincronizar}>{aSincronizar ? 'A sincronizar…' : 'Sincronizar agora'}</button>
            <button className="sec" onClick={() => void forcarSync('completo')} disabled={aSincronizar} title="Relê tudo desde 01/01/2025 e substitui os meses abertos">Reler tudo</button>
            <span className="small">{syncMsg ?? 'Força uma sincronização já, sem esperar pela próxima automática. Só integra dados novos.'}</span>
          </div>
        ) : <p className="muted">A sincronização forçada é feita pelo Master (é o único que acede à chave do Jotform).</p>}
        {acesso?.papel === 'master' && <>
          <p className="small"><b>Decisão tomada:</b> a chave da API fica guardada no Firebase, legível só pelo Master e pela sincronização automática. Use uma chave <b>só de leitura</b> (jotform.com → Definições → API).</p>
          <div className="linha">
            <label className="campo">Servidor
              <select value={jot.base} onChange={(e) => setJot({ ...jot, base: e.target.value })}>
                <option value="https://eu-api.jotform.com">Jotform EU (eu-api.jotform.com)</option>
                <option value="https://api.jotform.com">Jotform global (api.jotform.com)</option>
              </select>
            </label>
            <label className="campo">Chave da API (só leitura)<input type="password" value={jot.apiKey} onChange={(e) => setJot({ ...jot, apiKey: e.target.value })} style={{ width: 280 }} /></label>
            <button onClick={guardarJotform} disabled={!jot.apiKey}>Guardar chave</button>
            <button className="sec" onClick={testarJotform} disabled={aTestar}>{aTestar ? 'A testar…' : 'Testar chave'}</button>
          </div>
          <p className="muted">O teste só lê: confirma a conta e o acesso aos 4 formulários. Não importa nem grava dados.</p>
          {teste && (
            <div className={teste.ok ? 'ok-box' : 'aviso'}>
              <b>{teste.ok ? '✓ A chave funciona.' : '✗ A chave não está a funcionar.'}</b>
              {teste.conta && <> Conta Jotform: {teste.conta.utilizador}{teste.conta.plano ? ` (${teste.conta.plano})` : ''}.</>}
              {teste.erro && <> {teste.erro}</>}
              {teste.sugestaoServidor && <> A chave funciona no servidor <b>{teste.sugestaoServidor.replace('https://', '')}</b>: escolha-o acima e guarde de novo.</>}
              {teste.formularios.length > 0 && (
                <ul style={{ margin: '6px 0 0 18px' }}>
                  {teste.formularios.map((f) => (
                    <li key={f.id}>{f.ok ? '✓' : '✗'} {f.nome}: {f.ok ? `${f.submissoes} submissões` : f.erro}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>}
      </div>

      </>}

      {edit && (
        <Modal titulo={`${edit.novo ? 'Novo registo' : 'Editar'}: ${edit.tipo === 'comunidade' ? 'comunidade' : edit.tipo === 'conta' ? 'conta bancária' : edit.tipo === 'dimensao' ? TIPO_DIM[edit.v.tipo].toLowerCase() : 'categoria'}`} onFechar={() => setEdit(null)}>
          {msg && <div className="aviso">{msg}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {edit.tipo === 'comunidade' && <>
              <label className="campo">Nome<input value={edit.v.nome} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, nome: e.target.value } })} /></label>
              <label className="campo">Ordem<input type="number" value={edit.v.ordem} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, ordem: Number(e.target.value) } })} /></label>
              <CampoData rotulo="Início (opcional)" valor={edit.v.inicio ?? ''} onChange={(d) => setEdit({ ...edit, v: { ...edit.v, inicio: d } })} />
              <CampoData rotulo="Fim (opcional)" valor={edit.v.fim ?? ''} onChange={(d) => setEdit({ ...edit, v: { ...edit.v, fim: d } })} />
              {edit.v.fim && <label className="campo">Passa para (fusão)
                <select value={edit.v.sucessora ?? ''} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, sucessora: e.target.value || undefined } })}>
                  <option value="">— (nenhuma)</option>
                  {(coms.dados ?? []).filter((c) => !c.especial && c.id !== edit.v.id).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <span className="small muted">Depois do fim, os custos fixos, os registos do Jotform, os movimentos do banco e a assistência desta comunidade contam na escolhida; a assistência anterior soma-se à dela no peso dos últimos 12 meses.</span>
              </label>}
              {edit.novo && <p className="muted" style={{ gridColumn: '1 / -1' }}>Identificador: {slug(edit.v.nome) || '—'} (não muda depois de criado).</p>}
            </>}
            {edit.tipo === 'conta' && <>
              <label className="campo">Nome<input value={edit.v.nome} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, nome: e.target.value } })} /></label>
              <label className="campo">Banco<input value={edit.v.banco} list="bancos" onChange={(e) => setEdit({ ...edit, v: { ...edit.v, banco: e.target.value } })} />
                <datalist id="bancos"><option value="Caixa Geral de Depósitos" /><option value="Santander" /></datalist></label>
              <label className="campo">Tipo
                <select value={edit.v.tipo} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, tipo: e.target.value as Conta['tipo'], etiqueta: e.target.value === 'investimentos' ? '(Conta investimentos)' : edit.v.etiqueta } })}>
                  <option value="principal">Principal</option><option value="corrente">Corrente</option><option value="investimentos">Investimentos</option>
                </select></label>
              <label className="campo">IBAN<input value={edit.v.iban ?? ''} placeholder="PT50 0000 0000 0000 0000 0000 0" onChange={(e) => setEdit({ ...edit, v: { ...edit.v, iban: e.target.value } })} />
                {edit.v.iban && <span className="small">{ibanValido(edit.v.iban) ? '✓ IBAN válido' : 'IBAN inválido'}</span>}</label>
              <label className="campo" style={{ gridColumn: '1 / -1' }}>Nota<input value={edit.v.etiqueta ?? ''} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, etiqueta: e.target.value } })} /></label>
            </>}
            {edit.tipo === 'categoria' && <>
              <label className="campo">Código<input value={edit.v.codigo ?? ''} disabled={!edit.novo} placeholder="02.03" onChange={(e) => setEdit({ ...edit, v: { ...edit.v, codigo: e.target.value } })} /></label>
              <label className="campo">Nome (com o código)<input value={edit.v.nome} disabled={!edit.novo} placeholder="02.03 Comunicações" onChange={(e) => setEdit({ ...edit, v: { ...edit.v, nome: e.target.value } })} /></label>
              <label className="campo">Tipo
                <select value={edit.v.tipo} disabled={!edit.novo} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, tipo: e.target.value as Categoria['tipo'] } })}>
                  <option value="saida">Despesa</option><option value="entrada">Receita</option><option value="financeiro">Financeiro</option>
                </select></label>
              <label className="campo">Rubrica<input value={edit.v.rubrica ?? ''} list="rubricas-plano" placeholder="02 Instalações" onChange={(e) => setEdit({ ...edit, v: { ...edit.v, rubrica: e.target.value } })} />
                <datalist id="rubricas-plano">{rubricas.map((r) => <option key={r} value={r} />)}</datalist></label>
              <label className="campo">Nível de privacidade
                <select value={edit.v.nivel} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, nivel: e.target.value as Nivel } })}>{NIVEIS.map((n) => <option key={n} value={n}>{NIVEL_LABEL[n]}</option>)}</select></label>
              <label className="campo">Âmbito
                <select value={edit.v.ambito ?? 'local'} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, ambito: e.target.value as 'local' | 'geral' } })}>
                  <option value="local">Local (fica na comunidade)</option>
                  <option value="geral">Geral (reparte pela assistência dos últimos 12 meses)</option>
                </select></label>
              <label className="campo" style={{ gridColumn: '1 / -1' }}>Sinónimos (separados por ponto e vírgula)<input value={(edit.v.sinonimos ?? []).join('; ')} placeholder="Dízimos; Dízimo" onChange={(e) => setEdit({ ...edit, v: { ...edit.v, sinonimos: e.target.value.split(';') } })} /></label>
              <label className="campo">Conta SNC-ESNL<input value={edit.v.snc ?? ''} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, snc: e.target.value } })} /></label>
              {!edit.novo && <p className="muted" style={{ gridColumn: '1 / -1' }}>O código, o nome e o tipo não mudam depois de criados, porque os movimentos classificados usam o nome.</p>}
            </>}
            {edit.tipo === 'dimensao' && <>
              {edit.v.tipo === 'centro' && <label className="campo">Código<input value={edit.v.codigo ?? ''} disabled={!edit.novo} placeholder="CC16" onChange={(e) => setEdit({ ...edit, v: { ...edit.v, codigo: e.target.value } })} /></label>}
              <label className="campo">Nome<input value={edit.v.nome} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, nome: e.target.value } })} /></label>
              {edit.v.tipo === 'centro' && <label className="campo">Âmbito<input value={edit.v.ambito ?? ''} list="ambitos-cc" onChange={(e) => setEdit({ ...edit, v: { ...edit.v, ambito: e.target.value } })} />
                <datalist id="ambitos-cc">{['Central', 'Local', 'Transversal', 'Ministério', 'Evento', 'Atividade', 'Projeto'].map((a) => <option key={a} value={a} />)}</datalist></label>}
              {edit.v.tipo === 'conta' && <label className="campo">Categoria
                <select value={edit.v.categoria ?? ''} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, categoria: e.target.value || undefined } })}>
                  <option value="">—</option>
                  {(cats.dados ?? []).filter((c) => c.codigo).map((c) => <option key={c.id} value={c.codigo}>{c.nome}</option>)}
                </select></label>}
            </>}
          </div>
          <div className="acoes" style={{ marginTop: 14 }}>
            <button onClick={guardar}>Guardar</button>
            <button className="sec" onClick={() => setEdit(null)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </>
  );
}
