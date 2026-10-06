import http from 'node:http';
import https from 'node:https';
import { SafeError, resolvePublic, validateURL } from './url.js';
export interface Resource {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}
export interface Budget {
  requests: number;
  bytes: number;
}
/** Fetch to the vetted IP itself, preserving Host and TLS SNI: no second DNS lookup. */
export async function safeFetch(
  input: string,
  budget: Budget,
  signal: AbortSignal,
): Promise<Resource> {
  if (++budget.requests > 240) throw new SafeError('Limite de recursos atingido.');
  const url = validateURL(input);
  const address = await resolvePublic(url);
  if (signal.aborted) throw new SafeError('Análise cancelada.');
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(
      {
        hostname: address.address,
        family: address.family,
        port: url.port || undefined,
        protocol: url.protocol,
        path: url.pathname + url.search,
        method: 'GET',
        servername: url.hostname.replace(/^\[|\]$/g, ''),
        headers: {
          Host: url.host,
          'User-Agent': 'VisDNA/1.0 (public visual analysis)',
          'Accept-Encoding': 'identity',
          Accept: '*/*',
        },
        agent: false,
        signal,
        timeout: 10000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let length = 0;
        if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') {
          res.destroy();
          reject(new SafeError('Recurso comprimido não suportado pelo coletor seguro.'));
          return;
        }
        if (/attachment/i.test(String(res.headers['content-disposition'] || ''))) {
          res.destroy();
          reject(new SafeError('Download bloqueado.'));
          return;
        }
        res.on('data', (chunk: Buffer) => {
          length += chunk.length;
          budget.bytes += chunk.length;
          if (length > 5 * 1024 * 1024 || budget.bytes > 30 * 1024 * 1024) {
            res.destroy(new SafeError('Limite de bytes atingido.'));
          } else chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () => {
          const headers: Record<string, string> = {};
          // Never replay cookies, auth headers, client hints, or hop-by-hop headers.
          for (const name of [
            'content-type',
            'location',
            'content-security-policy',
            'access-control-allow-origin',
          ]) {
            const v = res.headers[name];
            if (typeof v === 'string') headers[name] = v;
          }
          resolve({ status: res.statusCode || 502, headers, body: Buffer.concat(chunks) });
        });
      },
    );
    req.on('timeout', () => req.destroy(new SafeError('Tempo limite ao buscar recurso.')));
    req.on('error', reject);
    req.end();
  });
}
