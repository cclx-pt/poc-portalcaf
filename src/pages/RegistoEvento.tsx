import { useAuth } from '../auth/AuthProvider';
import { Estado, Kpi, useCarregar, useFiltros } from '../components/ui';
import { listarComunidades, listarLotes } from '../lib/db';
import { MESES_CURTOS, norm, num } from '../lib/format';

/**
 * Páginas do grupo Registos que, para já, mostram os eventos do Registo de Presenças (Jotform)
 * cujo tipo corresponde ao registo (batismos, conversões). O registo individual fica para uma fase seguinte.
 */
const DEFINICOES = {
  batismos: {
    titulo: 'Batismos',
    intro: 'Registo e acompanhamento dos batismos realizados.',
    palavras: ['batismo', 'batismos', 'batizado', 'batizados'],
  },
  conversoes: {
    titulo: 'Conversões',
    intro: 'Registo das decisões de fé e conversões.',
    palavras: ['conversao', 'conversoes', 'decisao', 'decisoes'],
  },
} as const;
export type TipoRegisto = keyof typeof DEFINICOES;

const dataPt = (d: string) => d.split('-').reverse().join('/');

export default function RegistoEvento({ registo }: { registo: TipoRegisto }) {
  const { acesso } = useAuth();
  const { ano, comunidade } = useFiltros();
  const def = DEFINICOES[registo];
  const lotes = useCarregar(() => listarLotes(acesso!, 'assistencia', ano, false), [ano, acesso?.email]);
  const coms = useCarregar(listarComunidades, []);
  const nomes = new Map((coms.dados ?? []).map((c) => [c.id, c.nome]));

  const corresponde = (evento?: string) => {
    const n = norm(evento ?? '');
    return !!n && def.palavras.some((p) => n.includes(p));
  };
  const linhas = (lotes.dados ?? [])
    .filter((l) => comunidade === 'todas' || l.comunidadeId === comunidade)
    .flatMap((l) => l.registos.filter((r) => corresponde(r.evento)).map((r) => {
      const x = (k: string) => Number(r.extra?.[k] ?? 0) || 0;
      return { data: r.data, mes: l.mes, comunidadeId: l.comunidadeId, evento: r.evento ?? '', adultos: r.valor, criancas: x('jump') + x('criancas') + x('connects') };
    }))
    .sort((a, b) => b.data.localeCompare(a.data));
  const porCom = new Map<string, number>();
  for (const l of linhas) porCom.set(l.comunidadeId, (porCom.get(l.comunidadeId) ?? 0) + 1);

  return (
    <>
      <h1>{def.titulo} {ano}</h1>
      <p className="muted">{def.intro}</p>
      <div className="nota">
        <b>Fase atual:</b> estes dados vêm do Registo de Presenças do Jotform (campo "Evento") e mostram os eventos
        de {def.titulo.toLowerCase()} e as presenças nesses eventos. O registo individual (quem, quando, acompanhamento)
        fica para uma fase seguinte, com um formulário próprio.
      </div>
      <Estado aCarregar={lotes.aCarregar} erro={lotes.erro} vazio={!linhas.length} />
      {!!linhas.length && <>
        <div className="cards">
          <Kpi titulo={`Eventos de ${def.titulo.toLowerCase()}`} valor={num(linhas.length)} sub={`em ${ano}`} />
          <Kpi titulo="Comunidades" valor={num(porCom.size)} />
          <Kpi titulo="Último" valor={linhas[0] ? dataPt(linhas[0].data) : '—'} sub={linhas[0] ? nomes.get(linhas[0].comunidadeId) ?? linhas[0].comunidadeId : undefined} />
        </div>
        {porCom.size > 1 && (
          <div className="sec">
            <h2>Por comunidade</h2>
            <div className="tabela"><table>
              <thead><tr><th>Comunidade</th><th className="num">Eventos</th></tr></thead>
              <tbody>{[...porCom.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => (
                <tr key={c}><td>{nomes.get(c) ?? c}</td><td className="num">{num(n)}</td></tr>
              ))}</tbody>
            </table></div>
          </div>
        )}
        <div className="sec">
          <h2>Eventos registados ({num(linhas.length)})</h2>
          <div className="tabela"><table>
            <thead><tr><th>Data</th><th>Mês</th><th>Comunidade</th><th>Evento</th><th className="num">Jovens e adultos presentes</th><th className="num">Jump, crianças e Connect's</th></tr></thead>
            <tbody>{linhas.map((l, i) => (
              <tr key={i}><td>{dataPt(l.data)}</td><td>{MESES_CURTOS[l.mes - 1]}</td><td>{nomes.get(l.comunidadeId) ?? l.comunidadeId}</td><td>{l.evento}</td><td className="num">{num(l.adultos)}</td><td className="num">{num(l.criancas)}</td></tr>
            ))}</tbody>
          </table></div>
          <p className="muted small">Presenças nos eventos, não o número de {def.titulo.toLowerCase()}.</p>
        </div>
      </>}
    </>
  );
}
