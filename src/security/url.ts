import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
export class SafeError extends Error {}
export function publicAddress(address: string): boolean {
  try {
    const ip = ipaddr.process(address);
    return ip.range() === 'unicast';
  } catch {
    return false;
  }
}
export function validateURL(input: string): URL {
  if (input.length > 2048 || /[\s\\]/.test(input) || [...input].some((c) => c.charCodeAt(0) < 32))
    throw new SafeError('URL inválida.');
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new SafeError('Informe uma URL HTTP ou HTTPS válida.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new SafeError('Somente URLs públicas HTTP/HTTPS, sem credenciais.');
  if (url.port && !['80', '443'].includes(url.port))
    throw new SafeError('Somente as portas 80 e 443 são permitidas.');
  const host = url.hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
  if (
    (!host.includes('.') && !host.includes(':')) ||
    /(^|\.)(localhost|local|internal|test|invalid|onion)$/.test(host) ||
    host === 'metadata.google.internal'
  )
    throw new SafeError('Endereço interno ou reservado bloqueado.');
  if (ipaddr.isValid(host) && !publicAddress(host))
    throw new SafeError('Endereço não público bloqueado.');
  url.hash = '';
  return url;
}
export type Resolver = (host: string) => Promise<{ address: string; family: number }[]>;
export async function resolvePublic(
  url: URL,
  resolver: Resolver = (host) => lookup(host, { all: true, verbatim: true }),
) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: { address: string; family: number }[];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    addresses = await Promise.race([
      resolver(host),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('DNS timeout')), 5000);
      }),
    ]);
  } catch {
    throw new SafeError('Não foi possível resolver o domínio.');
  } finally {
    clearTimeout(timer);
  }
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new SafeError('O domínio resolve para uma rede não pública.');
  return addresses[0]!;
}
