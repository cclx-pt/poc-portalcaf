import { describe, expect, it } from 'vitest';
import { destinoDoLink, urlComDestino } from '../../src/lib/linkLogin';

describe('link de acesso: voltar à página onde foi pedido', () => {
  const base = 'https://portalcaf.cclx.pt/';
  it('o endereço do link leva a página de onde foi pedido', () => {
    expect(urlComDestino(base, '#/presencas')).toBe('https://portalcaf.cclx.pt/?destino=%23%2Fpresencas');
    expect(urlComDestino(base, '#/presencas/registar?x=1')).toBe('https://portalcaf.cclx.pt/?destino=%23%2Fpresencas%2Fregistar%3Fx%3D1');
  });
  it('sem página (ou na raiz) o link é só o portal', () => {
    expect(urlComDestino(base, '')).toBe(base);
    expect(urlComDestino(base, '#/')).toBe(base);
    expect(urlComDestino(base, 'javascript:alert(1)')).toBe(base);
  });
  it('ao abrir o link, a página vem do próprio link (funciona noutro browser); senão da guardada neste browser', () => {
    const link = 'https://portalcaf.cclx.pt/?destino=%23%2Fpresencas&apiKey=k&oobCode=c&mode=signIn&lang=pt';
    expect(destinoDoLink(link, null)).toBe('#/presencas');
    expect(destinoDoLink(link, '#/registar')).toBe('#/presencas');
    expect(destinoDoLink('https://portalcaf.cclx.pt/?apiKey=k&oobCode=c&mode=signIn', '#/registar')).toBe('#/registar');
    expect(destinoDoLink('https://portalcaf.cclx.pt/?apiKey=k&oobCode=c&mode=signIn', null)).toBe('');
  });
  it('só aceita páginas do próprio portal (#/...)', () => {
    expect(destinoDoLink('https://portalcaf.cclx.pt/?destino=https%3A%2F%2Fmau.pt&oobCode=c', null)).toBe('');
    expect(destinoDoLink('https://portalcaf.cclx.pt/?destino=%23%2F%2Fmau.pt&oobCode=c', null)).toBe('');
  });
});
