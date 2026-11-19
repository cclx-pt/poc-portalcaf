/** Reduz uma imagem (PNG, JPG, SVG, WebP) a um quadrado de `lado` px, em PNG (data URL), para guardar no Firestore. */
export async function reduzirImagem(f: File, lado = 128): Promise<string> {
  if (!/^image\//.test(f.type)) throw new Error('Escolha uma imagem (PNG, JPG, SVG ou WebP).');
  if (f.size > 3 * 1024 * 1024) throw new Error('A imagem tem mais de 3 MB.');
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((ok, erro) => {
      const i = new Image();
      i.onload = () => ok(i); i.onerror = () => erro(new Error('Não foi possível ler a imagem.'));
      i.src = url;
    });
    const w = img.naturalWidth || lado, h = img.naturalHeight || lado;
    const k = Math.min(lado / w, lado / h, 1);
    const c = document.createElement('canvas');
    c.width = lado; c.height = lado;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, (lado - w * k) / 2, (lado - h * k) / 2, w * k, h * k);
    return c.toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}
