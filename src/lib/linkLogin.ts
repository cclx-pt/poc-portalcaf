/**
 * Login por link de email: o link volta à página onde foi pedido (ex.: #/presencas).
 * A página vai no próprio link (parâmetro `destino`), para funcionar mesmo quando o email se abre noutro browser
 * (ex.: o browser da app de email); a guardada neste browser fica como reserva.
 */

/** Só páginas do próprio portal: "#/" seguido de algo que não seja outra "/" (evita "#//outro-site"). */
const valido = (d: string | null | undefined): d is string => !!d && /^#\/[^/]/.test(d);

/** Endereço de regresso do link, com a página de onde foi pedido (sem ela, a raiz do portal). */
export function urlComDestino(base: string, destino: string): string {
  return valido(destino) ? `${base}?destino=${encodeURIComponent(destino)}` : base;
}

/** Página para onde ir depois de entrar: a do link; senão a guardada neste browser; senão nenhuma (""). */
export function destinoDoLink(href: string, guardado: string | null): string {
  let doLink: string | null = null;
  try { doLink = new URL(href).searchParams.get('destino'); } catch { /* endereço inválido */ }
  return valido(doLink) ? doLink : valido(guardado) ? guardado : '';
}
