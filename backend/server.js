'use strict';

const http = require('node:http');

const PORT = Number(process.env.PORT || 10000);
const UPSTREAM = 'https://pokeapi.co/api/v2';
const REQUEST_TIMEOUT_MS = 10000;
const MAX_CACHE_ITEMS = 350;
const TTL = {
  pokemon: 6 * 60 * 60 * 1000,
  'pokemon-species': 24 * 60 * 60 * 1000,
  'evolution-chain': 24 * 60 * 60 * 1000
};
const STALE_TTL = 7 * 24 * 60 * 60 * 1000;

const cache = new Map();
const pending = new Map();

function send(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=30, s-maxage=120, stale-while-revalidate=300',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  });
  res.end(body);
}

function normalizeKey(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

function buildUpstreamPath(pathname) {
  const match = pathname.match(/^\/api\/v2\/(pokemon|pokemon-species|evolution-chain)\/([^/]+)\/?$/);
  if (!match) return null;

  const resource = match[1];
  const key = normalizeKey(match[2]).toLowerCase();
  if (!/^[a-z0-9-]{1,80}$/.test(key)) return null;

  return { resource, key, url: UPSTREAM + '/' + resource + '/' + encodeURIComponent(key) + '/' };
}

async function fetchUpstream(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      const error = new Error('A PokéAPI respondeu com HTTP ' + response.status + '.');
      error.statusCode = response.status;
      throw error;
    }

    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Tempo limite excedido ao consultar a PokéAPI.');
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    if (error instanceof TypeError) {
      const networkError = new Error('Não foi possível alcançar a PokéAPI.');
      networkError.statusCode = 502;
      throw networkError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function getCachedJson(resource, url) {
  const now = Date.now();
  const existing = cache.get(url);
  if (existing && existing.expiresAt > now) {
    // Atualiza a ordem do Map para manter os itens usados recentemente.
    cache.delete(url);
    cache.set(url, existing);
    return { data: existing.data, cacheStatus: 'HIT' };
  }

  if (pending.has(url)) {
    const result = await pending.get(url);
    return { ...result, cacheStatus: result.cacheStatus === 'STALE' ? 'STALE' : 'COALESCED' };
  }

  const task = (async () => {
    try {
      const data = await fetchUpstream(url);
      const ttl = TTL[resource] || 60 * 60 * 1000;
      const entry = { data, expiresAt: Date.now() + ttl, staleUntil: Date.now() + ttl + STALE_TTL };
      cache.set(url, entry);
      while (cache.size > MAX_CACHE_ITEMS) {
        cache.delete(cache.keys().next().value);
      }
      return { data, cacheStatus: 'MISS' };
    } catch (error) {
      const stale = cache.get(url);
      if (stale && stale.staleUntil > Date.now()) {
        return { data: stale.data, cacheStatus: 'STALE' };
      }
      throw error;
    } finally {
      pending.delete(url);
    }
  })();

  pending.set(url, task);
  return task;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  let requestUrl;
  try {
    requestUrl = new URL(req.url, 'http://localhost');
  } catch {
    return send(res, 400, { error: 'URL inválida.' });
  }

  if (req.method === 'GET' && (requestUrl.pathname === '/health' || requestUrl.pathname === '/healthz')) {
    return send(res, 200, {
      status: 'ok',
      service: 'pokedexapi-render',
      cacheEntries: cache.size,
      upstream: 'https://pokeapi.co/api/v2'
    }, { 'Cache-Control': 'no-store' });
  }

  if (req.method !== 'GET') {
    return send(res, 405, { error: 'Método não permitido.' }, { Allow: 'GET, OPTIONS' });
  }

  const target = buildUpstreamPath(requestUrl.pathname);
  if (!target) {
    return send(res, 404, {
      error: 'Rota não encontrada.',
      available: ['/health', '/api/v2/pokemon/:id-ou-nome', '/api/v2/pokemon-species/:id-ou-nome', '/api/v2/evolution-chain/:id']
    });
  }

  try {
    const result = await getCachedJson(target.resource, target.url);
    return send(res, 200, result.data, { 'X-Cache': result.cacheStatus });
  } catch (error) {
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 502;
    return send(res, status, {
      error: 'Não foi possível obter os dados da PokéAPI.',
      message: error.message,
      retryable: status === 429 || status >= 500
    }, { 'Cache-Control': 'no-store' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Pokédex API intermediária ouvindo na porta ' + PORT);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
