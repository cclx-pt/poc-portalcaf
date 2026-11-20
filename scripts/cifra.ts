/**
 * Cifra simétrica (AES-256-GCM) para os dados dos pedidos que passam pelo GitHub Actions.
 * O repositório é público: o que vai para artefactos e entradas de workflows tem de ir cifrado.
 * A chave vem de PEDIDOS_CHAVE (segredo do repositório e da tarefa agendada).
 *
 * Uso na linha de comandos:
 *   PEDIDOS_CHAVE=… npx tsx scripts/cifra.ts cifrar   < claro.json   > cifrado.txt
 *   PEDIDOS_CHAVE=… npx tsx scripts/cifra.ts decifrar < cifrado.txt > claro.json
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function chave(): Buffer {
  const k = process.env.PEDIDOS_CHAVE;
  if (!k || k.length < 32) throw new Error('PEDIDOS_CHAVE em falta ou demasiado curta (mínimo 32 caracteres).');
  return createHash('sha256').update(k).digest();
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chave(), iv);
  const dados = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), dados]).toString('base64');
}

export function decifrar(b64: string): string {
  const buf = Buffer.from(b64.trim(), 'base64');
  const d = createDecipheriv('aes-256-gcm', chave(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}

const modo = process.argv[2];
if (modo === 'cifrar' || modo === 'decifrar') {
  const chunks: Buffer[] = [];
  process.stdin.on('data', (c) => chunks.push(c));
  process.stdin.on('end', () => {
    const entrada = Buffer.concat(chunks).toString('utf8');
    process.stdout.write(modo === 'cifrar' ? cifrar(entrada) : decifrar(entrada));
  });
}
