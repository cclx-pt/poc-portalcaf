import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth, type Acao } from './auth/AuthProvider';
import { FiltrosProvider } from './components/ui';
import { SaidaSemGravarProvider } from './components/SaidaSemGravar';
import Layout from './components/Layout';
import Login from './pages/Login';
import Publico from './pages/Publico';
import Painel from './pages/Painel';
import Fonte from './pages/Fonte';
import EntradasConjunto from './pages/EntradasConjunto';
import Assistencia from './pages/Assistencia';
import DemonstracaoResultados from './pages/DemonstracaoResultados';
import RegistoEvento from './pages/RegistoEvento';
import RegistarPresencas from './pages/RegistarPresencas';
import RegistoRapido from './pages/RegistoRapido';
import RegistosEmFalta from './pages/RegistosEmFalta';
import Comparacao from './pages/Comparacao';
import Relatorio from './pages/Relatorio';
import Bancos from './pages/Bancos';
import Reconciliacao from './pages/Reconciliacao';
import CustosFixos from './pages/CustosFixos';
import Orcamento from './pages/Orcamento';
import Fecho from './pages/Fecho';
import Exportacao from './pages/Exportacao';
import Configuracao from './pages/Configuracao';
import Utilizadores from './pages/Utilizadores';
import Auditoria from './pages/Auditoria';
import Pedidos from './pages/Pedidos';
import Pesos from './pages/Pesos';
import type { ReactElement } from 'react';

function Protegido() {
  const { carregando, acesso } = useAuth();
  if (carregando) return <div className="login"><p className="muted">A carregar…</p></div>;
  if (!acesso) return <Login />;
  // O perfil Registos só tem a área de registo de presenças (link direto, sem menu).
  if (acesso.papel === 'registos') return <Navigate to="/registar" replace />;
  return <FiltrosProvider><Layout /></FiltrosProvider>;
}

/** Link direto /registar: pede login se preciso e volta ao formulário; layout mínimo (telemóvel e computador). */
function ProtegidoRegisto() {
  const { carregando, acesso, pode } = useAuth();
  if (carregando) return <div className="login"><p className="muted">A carregar…</p></div>;
  if (!acesso) return <Login />;
  if (!pode('registar')) return <Navigate to="/" replace />;
  return <RegistoRapido />;
}

function Se({ acao, nivel, children }: { acao?: Acao; nivel?: 'privado' | 'confidencial'; children: ReactElement }) {
  const { pode, temNivel } = useAuth();
  if ((acao && !pode(acao)) || (nivel && !temNivel(nivel))) return <div className="aviso">Sem permissão para esta área.</div>;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
      <SaidaSemGravarProvider>
        <Routes>
          <Route path="/publico" element={<Publico />} />
          <Route path="/registar" element={<ProtegidoRegisto />} />
          <Route element={<Protegido />}>
            <Route index element={<Painel />} />
            <Route path="entradas" element={<Se nivel="privado"><Fonte key="c" origem="contribuir" /></Se>} />
            <Route path="depositos" element={<Se nivel="privado"><Fonte key="d" origem="depositos" /></Se>} />
            <Route path="reembolsos" element={<Se nivel="privado"><Fonte key="r" origem="despesas" /></Se>} />
            <Route path="registos/presencas" element={<Se nivel="privado"><Assistencia /></Se>} />
            <Route path="registos/presencas/novo" element={<Se acao="registar"><RegistarPresencas /></Se>} />
            <Route path="registos/presencas/em-falta" element={<Se acao="registar"><RegistosEmFalta /></Se>} />
            <Route path="registos/batismos" element={<Se nivel="privado"><RegistoEvento key="b" registo="batismos" /></Se>} />
            <Route path="registos/conversoes" element={<Se nivel="privado"><RegistoEvento key="c2" registo="conversoes" /></Se>} />
            <Route path="entradas-conjunto" element={<Se nivel="privado"><EntradasConjunto /></Se>} />
            <Route path="assistencia" element={<Navigate to="/registos/presencas" replace />} />
            <Route path="analise/resultados" element={<Se nivel="privado"><DemonstracaoResultados /></Se>} />
            <Route path="analise/comparacao" element={<Se nivel="privado"><Comparacao /></Se>} />
            <Route path="analise/relatorio" element={<Se nivel="privado"><Relatorio /></Se>} />
            <Route path="bancos" element={<Se acao="bancos"><Bancos /></Se>} />
            <Route path="reconciliacao" element={<Se acao="bancos"><Reconciliacao /></Se>} />
            <Route path="custos-fixos" element={<Se nivel="privado"><CustosFixos /></Se>} />
            <Route path="orcamento" element={<Se nivel="privado"><Orcamento /></Se>} />
            <Route path="fecho" element={<Se acao="publicar"><Fecho /></Se>} />
            <Route path="exportacao" element={<Se acao="exportar"><Exportacao /></Se>} />
            <Route path="configuracao" element={<Se acao="configurar"><Configuracao /></Se>} />
            <Route path="utilizadores" element={<Se acao="utilizadores"><Utilizadores /></Se>} />
            <Route path="auditoria" element={<Se acao="auditoria"><Auditoria /></Se>} />
            <Route path="pedidos" element={<Se acao="configurar"><Pedidos /></Se>} />
            <Route path="pesos" element={<Se acao="configurar"><Pesos /></Se>} />
            <Route path="*" element={<Navigate to="/" />} />
          </Route>
        </Routes>
      </SaidaSemGravarProvider>
      </HashRouter>
    </AuthProvider>
  );
}
