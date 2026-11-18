import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Banknote, Building2, CalendarCheck, ChartColumn, ClipboardList, Droplets, FileSpreadsheet, FileText, Globe, HandCoins, HeartHandshake, Landmark, LayoutDashboard, LockKeyhole, PiggyBank, Receipt, Scale, Settings, ShieldCheck, Users, Wallet, X, Menu as MenuIcon } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { useCarregar, useFiltros, Rodape } from './ui';
import { listarComunidades } from '../lib/db';
import { NIVEL_LABEL, PAPEL_LABEL } from '../lib/types';

const BASE = import.meta.env.BASE_URL;

export default function Layout() {
  const { acesso, sair, pode, temNivel } = useAuth();
  const { ano, setAno, comunidade, setComunidade } = useFiltros();
  const { dados: comunidades } = useCarregar(listarComunidades, []);
  const anoAtual = new Date().getFullYear();
  // Telemóvel e tablet: o menu fica recolhido atrás de um botão e fecha ao mudar de página.
  const [menuAberto, setMenuAberto] = useState(false);
  const local = useLocation();
  useEffect(() => { setMenuAberto(false); }, [local.pathname]);
  const visiveis = (comunidades ?? []).filter((c) => c.ativo !== false && (acesso?.comunidades.includes('*') || acesso?.comunidades.includes(c.id)));

  return (
    <div className="app">
      <nav className="side" aria-label="Navegação principal">
        <div className="side-cabeca">
          <img src={`${BASE}caf-logo-negativo.png`} alt="CAF, Conselho Administrativo e Financeiro, CCLX" />
          <button className="menu-botao" aria-expanded={menuAberto} aria-controls="menu-principal" onClick={() => setMenuAberto((v) => !v)}>
            {menuAberto ? <><X size={18} aria-hidden /> Fechar</> : <><MenuIcon size={18} aria-hidden /> Menu</>}
          </button>
        </div>
        <div id="menu-principal" className={`side-links${menuAberto ? ' aberto' : ''}`}>
        <NavLink to="/" end><LayoutDashboard className="ico" size={18} aria-hidden /><span>Painel</span></NavLink>
        {temNivel('privado') && <>
          <div className="grupo">Dados (Jotform)</div>
          <NavLink to="/entradas-conjunto"><Wallet className="ico" size={18} aria-hidden /><span>Entradas: contribuições e depósitos</span></NavLink>
          <NavLink to="/entradas"><HandCoins className="ico" size={18} aria-hidden /><span>Contribuições</span></NavLink>
          <NavLink to="/depositos"><Banknote className="ico" size={18} aria-hidden /><span>Depósitos de coletas</span></NavLink>
          <NavLink to="/reembolsos"><Receipt className="ico" size={18} aria-hidden /><span>Reembolsos e despesas</span></NavLink>
        </>}
        {temNivel('privado') && <>
          <div className="grupo">Registos</div>
          <NavLink to="/registos/presencas" end><CalendarCheck className="ico" size={18} aria-hidden /><span>Presenças por evento</span></NavLink>
          {pode('registar') && <NavLink to="/registos/presencas/novo"><ClipboardList className="ico" size={18} aria-hidden /><span>Registar presenças</span></NavLink>}
          <NavLink to="/registos/batismos"><Droplets className="ico" size={18} aria-hidden /><span>Batismos</span><span className="etiqueta-menu">em desenvolvimento</span></NavLink>
          <NavLink to="/registos/conversoes"><HeartHandshake className="ico" size={18} aria-hidden /><span>Conversões</span><span className="etiqueta-menu">em desenvolvimento</span></NavLink>
        </>}
        {temNivel('privado') && <>
          <div className="grupo">Análise</div>
          <NavLink to="/analise/resultados"><Scale className="ico" size={18} aria-hidden /><span>Demonstração de resultados</span></NavLink>
          <NavLink to="/analise/comparacao"><ChartColumn className="ico" size={18} aria-hidden /><span>Comparação entre comunidades</span></NavLink>
          <NavLink to="/analise/relatorio"><FileText className="ico" size={18} aria-hidden /><span>Relatório custos x entradas</span></NavLink>
        </>}
        {pode('bancos') && <><div className="grupo">Tesouraria</div><NavLink to="/bancos"><Landmark className="ico" size={18} aria-hidden /><span>Bancos e bolsa geral</span></NavLink></>}
        {temNivel('privado') && <NavLink to="/custos-fixos"><Building2 className="ico" size={18} aria-hidden /><span>Custos fixos</span></NavLink>}
        {temNivel('privado') && <NavLink to="/orcamento"><PiggyBank className="ico" size={18} aria-hidden /><span>Orçamento</span></NavLink>}
        {pode('publicar') && <NavLink to="/fecho"><LockKeyhole className="ico" size={18} aria-hidden /><span>Fecho mensal e publicação</span></NavLink>}
        {pode('exportar') && <NavLink to="/exportacao"><FileSpreadsheet className="ico" size={18} aria-hidden /><span>Exportação contabilista</span></NavLink>}
        {(pode('configurar') || pode('auditoria')) && <div className="grupo">Administração</div>}
        {pode('configurar') && <NavLink to="/configuracao"><Settings className="ico" size={18} aria-hidden /><span>Configuração</span></NavLink>}
        {pode('utilizadores') && <NavLink to="/utilizadores"><Users className="ico" size={18} aria-hidden /><span>Utilizadores</span></NavLink>}
        {pode('auditoria') && <NavLink to="/auditoria"><ShieldCheck className="ico" size={18} aria-hidden /><span>Auditoria</span></NavLink>}
        <a href={`${BASE}#/publico`} target="_blank" rel="noreferrer"><Globe className="ico" size={18} aria-hidden /><span>Página pública ↗</span></a>
        <div className="rodape">Portal CAF · PoC</div>
        </div>
      </nav>
      <main className="main">
        <div className="topo">
          <div>
            <div className="kicker">CCLX · Conselho Administrativo e Financeiro</div>
          </div>
          <div className="filtros">
            <label className="campo">Ano
              <select value={ano} onChange={(e) => setAno(Number(e.target.value))}>
                {[anoAtual + 1, anoAtual, anoAtual - 1, anoAtual - 2].map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label className="campo">Comunidade
              <select value={comunidade} onChange={(e) => setComunidade(e.target.value)}>
                <option value="todas">Todas</option>
                {visiveis.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
          </div>
          <div className="utilizador">
            <div>{acesso?.email}</div>
            <div className="muted">{acesso && `${PAPEL_LABEL[acesso.papel]} · nível ${NIVEL_LABEL[acesso.nivel]}`}</div>
            <button className="link" onClick={() => void sair()}>Terminar sessão</button>
          </div>
        </div>
        <Outlet />
        <Rodape />
      </main>
    </div>
  );
}
