import { useFiltros } from '../components/ui';

/** Páginas do grupo Registos ainda em desenvolvimento: só a descrição, sem dados por agora. */
const DEFINICOES = {
  batismos: { titulo: 'Batismos', intro: 'Registo e acompanhamento dos batismos realizados.' },
  conversoes: { titulo: 'Conversões', intro: 'Registo das decisões de fé e conversões.' },
} as const;
export type TipoRegisto = keyof typeof DEFINICOES;

export default function RegistoEvento({ registo }: { registo: TipoRegisto }) {
  const { ano } = useFiltros();
  const def = DEFINICOES[registo];
  return (
    <>
      <h1>{def.titulo} {ano}</h1>
      <p className="muted">{def.intro}</p>
      <div className="nota">
        <b>Em desenvolvimento.</b> Esta área ainda não tem dados no portal. O formulário de registo e os indicadores
        ficam definidos numa fase seguinte.
      </div>
    </>
  );
}
