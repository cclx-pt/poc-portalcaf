import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ChevronDown, PanelLeftClose, PanelLeftOpen, type LucideIcon, Banknote, Bug, Building2, Percent, Contact, CalendarCheck, CalendarX, ChartColumn, ClipboardList, Droplets, FileSpreadsheet, FileText, Globe, HandCoins, HeartHandshake, Landmark, LayoutDashboard, ListChecks, LockKeyhole, PiggyBank, Receipt, Scale, Settings, ShieldCheck, Users, Wallet, X, Menu as MenuIcon } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { useCarregar, useFiltros, Rodape } from './ui';
import { BotaoReportar } from './Reportar';
import { listarComunidades } from '../lib/db';
import { NIVEL_LABEL, PAPEL_LABEL } from '../lib/types';

const BASE = import.meta.env.BASE_URL;

type Perm = { pode: (a: Parameters<ReturnType<typeof useAuth>['pode']>[0]) => boolean; temNivel: (n: 'privado' | 'confidencial') => boolean };
interface Item { to: string; nome: string; Icone: LucideIcon; ver: (p: Perm) => boolean; end?: boolean; etiqueta?: string; secao?: string }
const privado = (p: Perm) => p.temNivel('privado');
/** Menu lateral, por grupos. Cada grupo abre e fecha; o da página atual fica sempre aberto. */
const GRUPOS: { id: string; titulo?: string; itens: Item[] }[] = [
  { id: 'inicio', itens: [{ to: '/', nome: 'Painel', Icone: LayoutDashboard, ver: () => true, end: true }] },
  { id: 'dados', titulo: 'Dados (Jotform)', itens: [
    { to: '/entradas-conjunto', nome: 'Entradas: contribuições e depósitos', Icone: Wallet, ver: privado },
    { to: '/entradas', nome: 'Contribuir', Icone: HandCoins, ver: privado },
    { to: '/depositos', nome: 'Depósitos de coletas', Icone: Banknote, ver: privado },
    { to: '/reembolsos', nome: 'Reembolsos e despesas', Icone: Receipt, ver: privado },
  ] },
  { id: 'tesouraria', titulo: 'Tesouraria', itens: [
    { to: '/bancos', nome: 'Bancos (extratos e saldos)', Icone: Landmark, ver: (p) => p.pode('bancos') },
    { to: '/reconciliacao', nome: 'Reconciliação bancária', Icone: ListChecks, ver: (p) => p.pode('bancos') },
    { to: '/custos-fixos', nome: 'Custos Fixos', Icone: Building2, ver: privado },
    { to: '/orcamento', nome: 'Orçamento', Icone: PiggyBank, ver: privado },
    { to: '/fecho', nome: 'Fecho mensal e publicação', Icone: LockKeyhole, ver: (p) => p.pode('publicar') },
    { to: '/exportacao', nome: 'Exportação contabilista', Icone: FileSpreadsheet, ver: (p) => p.pode('exportar') },
  ] },
  { id: 'analise', titulo: 'Análise', itens: [
    { to: '/analise/resultados', nome: 'Demonstração de resultados', Icone: Scale, ver: privado },
    { to: '/analise/comparacao', nome: 'Comparação entre comunidades', Icone: ChartColumn, ver: privado },
    { to: '/analise/relatorio', nome: 'Relatório custos x entradas', Icone: FileText, ver: privado },
  ] },
  { id: 'registos', titulo: 'Registos', itens: [
    { to: '/registos/presencas', nome: 'Presenças por evento', Icone: CalendarCheck, ver: privado, end: true },
    { to: '/registos/presencas/novo', nome: 'Registar presenças', Icone: ClipboardList, ver: (p) => privado(p) && p.pode('registar') },
    { to: '/registos/presencas/em-falta', nome: 'Registos em falta', Icone: CalendarX, ver: (p) => privado(p) && p.pode('registar') },
    { to: '/registos/batismos', nome: 'Batismos', Icone: Droplets, ver: privado, etiqueta: 'em desenvolvimento' },
    { to: '/registos/conversoes', nome: 'Conversões', Icone: HeartHandshake, ver: privado, etiqueta: 'em desenvolvimento' },
  ] },
  { id: 'admin', titulo: 'Administração', itens: [
    { to: '/configuracao', nome: 'Configuração', Icone: Settings, ver: (p) => p.pode('configurar') },
    { to: '/utilizadores', nome: 'Utilizadores', Icone: Users, ver: (p) => p.pode('utilizadores') },
    { to: '/auditoria', nome: 'Auditoria', Icone: ShieldCheck, ver: (p) => p.pode('auditoria') },
    { to: '/pesos', nome: 'Peso das comunidades', Icone: Percent, ver: (p) => p.pode('configurar') },
    { to: '/pessoas', nome: 'Pessoas (dados de referência)', Icone: Contact, ver: (p) => p.pode('configurar') },
    { to: '/pedidos', nome: 'Bugs e melhorias', Icone: Bug, ver: (p) => p.pode('configurar') },
  ] },
];

const CHAVE_MENU = 'caf-portal:menu';
function lerPreferencias(): { recolhido: boolean; abertos: string[] } {
  try { const v = JSON.parse(localStorage.getItem(CHAVE_MENU) ?? '{}'); return { recolhido: !!v.recolhido, abertos: Array.isArray(v.abertos) ? v.abertos : [] }; }
  catch { return { recolhido: false, abertos: [] }; }
}
function gravarPreferencias(p: { recolhido: boolean; abertos: string[] }) {
  try { localStorage.setItem(CHAVE_MENU, JSON.stringify(p)); } catch { /* sem armazenamento: fica só nesta visita */ }
}

export default function Layout() {
  const { acesso, sair, pode, temNivel } = useAuth();
  const { ano, setAno, comunidade, setComunidade } = useFiltros();
  const { dados: comunidades } = useCarregar(listarComunidades, []);
  const anoAtual = new Date().getFullYear();
  // Telemóvel e tablet: o menu fica recolhido atrás de um botão e fecha ao mudar de página.
  const [menuAberto, setMenuAberto] = useState(false);
  const local = useLocation();
  useEffect(() => { setMenuAberto(false); }, [local.pathname]);
  // Computador: painel recolhível (só ícones) e grupos que abrem e fecham; a escolha fica guardada neste browser.
  const [pref, setPref] = useState(lerPreferencias);
  const recolhido = pref.recolhido;
  const gruposAbertos = pref.abertos;
  const mudar = (p: typeof pref) => { setPref(p); gravarPreferencias(p); };
  const setRecolhido = (v: boolean) => mudar({ ...pref, recolhido: v });
  const alternarGrupo = (id: string) => mudar({ ...pref, abertos: gruposAbertos.includes(id) ? gruposAbertos.filter((x) => x !== id) : [...gruposAbertos, id] });
  const perm: Perm = { pode, temNivel };
  const eAtivo = (to: string) => (to === '/' ? local.pathname === '/' : local.pathname === to || local.pathname.startsWith(`${to}/`));
  // A comunidade Geral (especial) é só financeira: não aparece no filtro das páginas de Registos (presenças, batismos…).
  const emRegistos = local.pathname.startsWith('/registos');
  const visiveis = (comunidades ?? []).filter((c) => c.ativo !== false && !(emRegistos && c.especial) && (acesso?.comunidades.includes('*') || acesso?.comunidades.includes(c.id)));
  useEffect(() => {
    if (emRegistos && comunidade !== 'todas' && (comunidades ?? []).some((c) => c.id === comunidade && c.especial)) setComunidade('todas');
  }, [emRegistos, comunidade, comunidades]); // eslint-disable-line react-hooks/exhaustive-deps

  // Master: mantém o índice de acessos do login em dia (uma vez por sessão do browser).
  useEffect(() => {
    if (acesso?.papel !== 'master') return;
    try { if (sessionStorage.getItem('caf-portal:acessos-sincronizados')) return; } catch { /* sem armazenamento */ }
    void (async () => {
      try {
        const [{ listarPerfis }, { sincronizarAcessos }] = await Promise.all([import('../lib/db'), import('../lib/acessos')]);
        await sincronizarAcessos(await listarPerfis());
        try { sessionStorage.setItem('caf-portal:acessos-sincronizados', '1'); } catch { /* sem armazenamento */ }
      } catch (e) { console.warn('índice de acessos', e); }
    })();
  }, [acesso?.papel]);

  return (
    <div className={`app${recolhido ? ' app-recolhido' : ''}`}>
      <nav className={`side${recolhido ? ' recolhido' : ''}`} aria-label="Navegação principal">
        <div className="side-cabeca">
          <img className="logo" src={`${BASE}caf-logo-negativo.png`} alt="CAF, Conselho Administrativo e Financeiro, CCLX" />
          <img className="simbolo" src={`${BASE}caf-simbolo-branco.svg`} alt="" aria-hidden />
          <button className="recolher-botao" aria-label={recolhido ? 'Mostrar o menu' : 'Recolher o menu'} title={recolhido ? 'Mostrar o menu' : 'Recolher o menu'} aria-expanded={!recolhido} onClick={() => setRecolhido(!recolhido)}>
            {recolhido ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
          </button>
          <button className="menu-botao" aria-expanded={menuAberto} aria-controls="menu-principal" onClick={() => setMenuAberto((v) => !v)}>
            {menuAberto ? <><X size={18} aria-hidden /> Fechar</> : <><MenuIcon size={18} aria-hidden /> Menu</>}
          </button>
        </div>
        <div id="menu-principal" className={`side-links${menuAberto ? ' aberto' : ''}`}>
          {GRUPOS.map((g) => {
            const itens = g.itens.filter((it) => it.ver(perm));
            if (!itens.length) return null;
            const ativo = itens.some((it) => eAtivo(it.to));
            const aberto = (recolhido && !menuAberto) || !g.titulo || ativo || gruposAbertos.includes(g.id);
            return (
              <div key={g.id} className="grupo-menu">
                {g.titulo && (
                  <button className="grupo-botao" aria-expanded={aberto} aria-controls={`grupo-${g.id}`} onClick={() => !ativo && alternarGrupo(g.id)} title={ativo ? 'Contém a página atual' : undefined}>
                    <span>{g.titulo}</span><ChevronDown className={`seta${aberto ? ' aberta' : ''}`} size={14} aria-hidden />
                  </button>
                )}
                {aberto && (
                  <div id={`grupo-${g.id}`} className="grupo-itens">
                    {itens.map((it, i) => (
                      <div key={it.to} className="item-menu">
                        {it.secao && it.secao !== itens[i - 1]?.secao && <div className="secao-menu">{it.secao}</div>}
                        <NavLink to={it.to} end={it.end} title={it.secao ? `${it.secao} › ${it.nome}` : it.nome}>
                          <it.Icone className="ico" size={18} aria-hidden /><span className="texto">{it.nome}</span>
                          {it.etiqueta && <span className="etiqueta-menu">{it.etiqueta}</span>}
                        </NavLink>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <a href={`${BASE}#/publico`} target="_blank" rel="noreferrer" title="Página pública"><Globe className="ico" size={18} aria-hidden /><span className="texto">Página pública ↗</span></a>
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
        <Rodape acao={<BotaoReportar />} />
      </main>
    </div>
  );
}
