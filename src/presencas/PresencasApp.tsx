import { useCallback, useMemo, useState } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { ChevronDown, ClipboardList, History, Home, PlusCircle } from 'lucide-react';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import './presencas.css';
import { useAuth } from '../auth/AuthProvider';
import { useComunidadesDoUtilizador, useFaltasPresencas, useLotesPresencas } from '../pages/RegistarPresencas';
import { PAPEL_LABEL } from '../lib/types';
import { hoje } from '../lib/format';
import { Painel, PzCtx, type ContextoPresencas } from './ui';
import { LoginPresencas } from './LoginPresencas';
import { Inicio } from './Inicio';
import { Registar } from './Registar';
import { EmFalta } from './EmFalta';
import { Historico } from './Historico';

const CHAVE_COMUNIDADE = 'caf-portal:presencas:comunidade';
const lerChave = () => { try { return window.localStorage.getItem(CHAVE_COMUNIDADE) ?? ''; } catch { return ''; } };

/**
 * Presenças. (v2): app de registo de presenças para telemóvel (portalcaf.cclx.pt/#/presencas).
 * Mesmas regras, dados e permissões do registo do portal (#/registar); só muda a experiência.
 */
export default function PresencasApp() {
  const { carregando, acesso, pode } = useAuth();
  if (carregando) return <div className="pz"><div className="pz-login"><div className="pz-marca"><b>Presenças.</b></div><p className="pz-muted" role="status">A carregar…</p></div></div>;
  if (!acesso) return <div className="pz"><LoginPresencas /></div>;
  if (!pode('registar')) return <Navigate to="/" replace />;
  return <div className="pz"><Shell /></div>;
}

function Shell() {
  const { acesso, sair } = useAuth();
  const coms = useComunidadesDoUtilizador();
  const comunidades = useMemo(() => coms.dados ?? [], [coms.dados]);
  const [escolha, setEscolha] = useState(lerChave);
  const comunidade = comunidades.length === 1 ? comunidades[0].id : comunidades.some((c) => c.id === escolha) ? escolha : 'todas';
  const setComunidade = useCallback((id: string) => { setEscolha(id); try { window.localStorage.setItem(CHAVE_COMUNIDADE, id); } catch { /* sem armazenamento */ } }, []);
  const doContexto = comunidade === 'todas' ? comunidades : comunidades.filter((c) => c.id === comunidade);
  const ano = Number(hoje().slice(0, 4));
  const lotes = useLotesPresencas(ano);
  const faltas = useFaltasPresencas({ ano, hoje: hoje(), comunidades: doContexto, lotes: lotes.dados ?? [] });
  const [perfil, setPerfil] = useState(false);
  const [escolher, setEscolher] = useState(false);

  const ctx: ContextoPresencas = {
    comunidades, comunidade, setComunidade, doContexto, lotes: lotes.dados ?? [], aCarregar: coms.aCarregar || lotes.aCarregar,
    erro: coms.erro ?? lotes.erro, recarregar: lotes.recarregar, faltas: lotes.aCarregar ? null : faltas?.falta ?? null,
  };
  const nomeContexto = comunidade === 'todas' ? (comunidades.length ? `${comunidades.length} comunidades` : 'Sem comunidades') : comunidades.find((c) => c.id === comunidade)?.nome;
  const nFalta = ctx.faltas?.reduce((s, f) => s + f.emFalta.length, 0) ?? 0;
  const inicial = (acesso?.nome ?? acesso?.email ?? '?').trim().charAt(0).toUpperCase();

  return (
    <PzCtx.Provider value={ctx}>
      <div className="pz-app">
        <header className="pz-topo">
          <div className="pz-marca">
            <b>Presenças.</b>
            <button className="pz-contexto" disabled={comunidades.length < 2} onClick={() => setEscolher(true)} aria-label={comunidades.length > 1 ? `Comunidade: ${nomeContexto}. Mudar comunidade` : undefined}>
              CCLX · {nomeContexto}{comunidades.length > 1 && <ChevronDown size={16} aria-hidden />}
            </button>
          </div>
          <button className="pz-avatar" onClick={() => setPerfil(true)} aria-label="Perfil e sair">{inicial}</button>
        </header>
        <main className="pz-conteudo" id="conteudo">
          {!coms.aCarregar && !comunidades.length
            ? <div className="pz-vazio"><h2>Sem comunidades atribuídas</h2><p>Peça ao administrador do portal que lhe dê acesso a uma comunidade.</p></div>
            : (
              <Routes>
                <Route index element={<Inicio />} />
                <Route path="registar" element={<Registar />} />
                <Route path="em-falta" element={<EmFalta />} />
                <Route path="historico" element={<Historico />} />
                <Route path="*" element={<Navigate to="/presencas" replace />} />
              </Routes>
            )}
        </main>
        <nav className="pz-nav" aria-label="Navegação">
          <ul>
            <li><NavLink to="/presencas" end><span className="pz-nav-ico"><Home size={22} aria-hidden /></span>Início</NavLink></li>
            <li><NavLink to="/presencas/registar"><span className="pz-nav-ico"><PlusCircle size={22} aria-hidden /></span>Registar</NavLink></li>
            <li><NavLink to="/presencas/em-falta"><span className="pz-nav-ico"><ClipboardList size={22} aria-hidden /></span>Em falta{nFalta > 0 && <span className="pz-badge" aria-label={`${nFalta} em falta`}>{nFalta > 99 ? '99+' : nFalta}</span>}</NavLink></li>
            <li><NavLink to="/presencas/historico"><span className="pz-nav-ico"><History size={22} aria-hidden /></span>Histórico</NavLink></li>
          </ul>
        </nav>
      </div>
      {escolher && (
        <Painel titulo="Comunidade" aoFechar={() => setEscolher(false)}>
          <div className="pz-lista">
            {[{ id: 'todas', nome: 'Todas as minhas' }, ...comunidades].map((c) => (
              <button key={c.id} className="pz-chip" aria-pressed={comunidade === c.id} style={{ textAlign: 'left' }} onClick={() => { setComunidade(c.id); setEscolher(false); }}>{c.nome}</button>
            ))}
          </div>
        </Painel>
      )}
      {perfil && (
        <Painel titulo="Perfil" aoFechar={() => setPerfil(false)}>
          <div>
            {acesso?.nome && <p style={{ fontWeight: 700 }}>{acesso.nome}</p>}
            <p className="pz-muted">{acesso?.email}</p>
            <p className="pz-muted pz-peq">{acesso && PAPEL_LABEL[acesso.papel]}</p>
          </div>
          {acesso?.papel !== 'registos' && <a className="pz-btn claro bloco" href="#/">Abrir o portal CAF</a>}
          <a className="pz-btn claro bloco" href="#/registar">Usar a versão anterior</a>
          <button className="pz-btn escuro bloco" onClick={() => void sair()}>Sair</button>
        </Painel>
      )}
    </PzCtx.Provider>
  );
}
