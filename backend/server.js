'use strict';

const http = require('node:http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');
const Sim = require('pokemon-showdown');

const PORT = Number(process.env.PORT || 10000);
const UPSTREAM = 'https://pokeapi.co/api/v2';
const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || 'https://pokedexapi-eight.vercel.app').split(',').map(v => v.trim());
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jqaverqnhpbnrheirbqo.supabase.co';
const SUPABASE_PUBLIC_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabaseAuth = SUPABASE_PUBLIC_KEY ? createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY) : null;
const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const app = express();
app.use(cors({ origin: (origin, cb) => !origin || FRONTEND_ORIGIN.includes(origin) ? cb(null, true) : cb(new Error('Origem não autorizada.')), credentials: true }));
app.use(express.json({ limit: '64kb' }));

const cache = new Map();
const pending = new Map();
const TTL = { pokemon: 21600000, 'pokemon-species': 86400000, 'evolution-chain': 86400000 };
const STALE_TTL = 604800000;

function normalizeKey(value) {
  try { return decodeURIComponent(value).toLowerCase(); } catch { return ''; }
}
async function fetchUpstream(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) {
      const error = new Error('A PokéAPI respondeu com HTTP ' + response.status + '.');
      error.statusCode = response.status;
      throw error;
    }
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') { error.statusCode = 504; error.message = 'Tempo limite excedido ao consultar a PokéAPI.'; }
    throw error;
  } finally { clearTimeout(timer); }
}
async function getCachedJson(resource, key) {
  const url = UPSTREAM + '/' + resource + '/' + encodeURIComponent(key) + '/';
  const now = Date.now();
  const cached = cache.get(url);
  if (cached && cached.expiresAt > now) return { data: cached.data, cacheStatus: 'HIT' };
  if (pending.has(url)) return pending.get(url);
  const task = (async () => {
    try {
      const data = await fetchUpstream(url);
      const ttl = TTL[resource] || 3600000;
      cache.set(url, { data, expiresAt: Date.now() + ttl, staleUntil: Date.now() + ttl + STALE_TTL });
      while (cache.size > 350) cache.delete(cache.keys().next().value);
      return { data, cacheStatus: 'MISS' };
    } catch (error) {
      const stale = cache.get(url);
      if (stale && stale.staleUntil > Date.now()) return { data: stale.data, cacheStatus: 'STALE' };
      throw error;
    } finally { pending.delete(url); }
  })();
  pending.set(url, task);
  return task;
}

app.get('/health', (_req, res) => res.json({
  status: 'ok', service: 'pokedexapi-render', cacheEntries: cache.size,
  battleEngine: 'pokemon-showdown', battleRooms: rooms.size,
  supabaseConfigured: Boolean(supabaseAuth), persistenceConfigured: Boolean(supabaseAdmin)
}));
app.get('/api/v2/:resource/:key', async (req, res) => {
  const { resource } = req.params;
  const key = normalizeKey(req.params.key);
  if (!['pokemon', 'pokemon-species', 'evolution-chain'].includes(resource) || !/^[a-z0-9-]{1,80}$/.test(key)) {
    return res.status(404).json({ error: 'Rota não encontrada.' });
  }
  try {
    const result = await getCachedJson(resource, key);
    res.set('Cache-Control', 'public, max-age=30, s-maxage=120, stale-while-revalidate=300');
    res.set('X-Cache', result.cacheStatus);
    return res.json(result.data);
  } catch (error) {
    return res.status(error.statusCode || 502).json({ error: 'Não foi possível obter os dados da PokéAPI.', message: error.message, retryable: true });
  }
});
app.get('/api/battles/status', (_req, res) => res.json({
  engine: 'pokemon-showdown', format: 'gen9customgame', teamSize: 6,
  maxMovesPerPokemon: 4, onlineRooms: [...rooms.values()].filter(r => r.mode === 'online' && !r.finished).length
}));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: FRONTEND_ORIGIN, methods: ['GET', 'POST'], credentials: true }, maxHttpBufferSize: 1e5 });
const rooms = new Map();

async function verifyToken(token) {
  if (!token || !supabaseAuth) return null;
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}
function normalizeTeam(input) {
  if (!Array.isArray(input) || input.length !== 6) throw new Error('A equipe precisa ter exatamente seis Pokémon.');
  return input.map((p, index) => {
    if (!p || !Number.isInteger(Number(p.speciesId || p.pokemon_id)) || !p.species) throw new Error('Pokémon inválido no espaço ' + (index + 1) + '.');
    const moves = Array.isArray(p.moves) ? p.moves.filter(Boolean).slice(0, 4) : [];
    if (!moves.length) throw new Error('Cada Pokémon precisa ter pelo menos um ataque.');
    return {
      species: String(p.species).toLowerCase(),
      name: String(p.nickname || p.species).slice(0, 24),
      ability: String(p.ability || 'noability').toLowerCase().replaceAll(' ', ''),
      item: p.item ? String(p.item).toLowerCase().replaceAll(' ', '') : '',
      moves: moves.map(m => String(m).toLowerCase().replaceAll(' ', '')),
      level: Math.min(100, Math.max(1, Number(p.level) || 100)),
      nature: p.nature || 'Serious',
      evs: p.evs || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      ivs: p.ivs || { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }
    };
  });
}
function packedTeam(team) {
  return Sim.Teams.pack(team.map(p => ({
    name: p.name, species: p.species, ability: p.ability, item: p.item,
    moves: p.moves, level: p.level, nature: p.nature, evs: p.evs, ivs: p.ivs
  })));
}
function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}
async function persistBattle(room) {
  if (!supabaseAdmin) return;
  try {
    const { data: battle, error } = await supabaseAdmin.from('battles').insert({
      code: room.code, mode: room.mode, format: room.format, status: 'waiting',
      created_by: room.players[0]?.userId || null, state: { engine: 'pokemon-showdown' }
    }).select('id').single();
    if (error) throw error;
    room.databaseId = battle.id;
    const players = room.players.filter(Boolean).map((p, index) => ({
      battle_id: battle.id, user_id: p.userId || null, side: index + 1,
      display_name: p.name, team_id: p.teamId || null
    }));
    if (players.length) await supabaseAdmin.from('battle_players').insert(players);
  } catch (error) { console.error('Falha ao persistir partida:', error.message); }
}
async function persistEvent(room, turn, eventType, payload) {
  if (!supabaseAdmin || !room.databaseId) return;
  await supabaseAdmin.from('battle_events').insert({
    battle_id: room.databaseId, turn_number: turn, event_type: eventType, payload
  });
}
function emitRoom(room, event, payload) {
  for (const player of room.players) if (player?.socketId) io.to(player.socketId).emit(event, payload);
}

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) { socket.data.user = null; return next(); }
  const user = await verifyToken(token);
  if (!user) return next(new Error('Sessão inválida. Entre novamente.'));
  socket.data.user = user;
  return next();
});

io.on('connection', socket => {
  socket.on('battle:create', async (payload = {}, ack = () => {}) => {
    try {
      const mode = payload.mode === 'local' ? 'local' : 'online';
      if (mode === 'online' && !socket.data.user) throw new Error('Entre na sua conta para criar uma sala online.');
      const team = normalizeTeam(payload.team);
      const code = roomCode();
      const room = {
        code, mode, format: 'gen9customgame', players: [{
          socketId: socket.id, userId: socket.data.user?.id || null,
          name: String(payload.name || socket.data.user?.email?.split('@')[0] || 'Treinador 1').slice(0, 24),
          team, packed: packedTeam(team), teamId: payload.teamId || null
        }, null],
        stream: null, started: false, finished: false, createdAt: Date.now()
      };
      rooms.set(code, room);
      socket.join('battle:' + code);
      socket.data.battleCode = code;
      await persistBattle(room);
      ack({ ok: true, code, side: 1, mode });
      emitRoom(room, 'battle:waiting', { code, message: 'Aguardando o segundo treinador.' });
    } catch (error) { ack({ ok: false, error: error.message }); }
  });

  socket.on('battle:join', async (payload = {}, ack = () => {}) => {
    try {
      const code = String(payload.code || '').toUpperCase();
      const room = rooms.get(code);
      if (!room || room.finished) throw new Error('Sala não encontrada ou já encerrada.');
      if (room.mode === 'online' && !socket.data.user) throw new Error('Entre na sua conta para participar de uma batalha online.');
      if (room.players[1]) throw new Error('Esta sala já está completa.');
      if (room.players[0].userId && room.players[0].userId === socket.data.user?.id) throw new Error('Você não pode entrar na própria sala com a mesma conta.');
      const team = normalizeTeam(payload.team);
      room.players[1] = {
        socketId: socket.id, userId: socket.data.user?.id || null,
        name: String(payload.name || socket.data.user?.email?.split('@')[0] || 'Treinador 2').slice(0, 24),
        team, packed: packedTeam(team), teamId: payload.teamId || null
      };
      socket.join('battle:' + code);
      socket.data.battleCode = code;
      await startBattle(room);
      ack({ ok: true, code, side: 2, mode: room.mode });
    } catch (error) { ack({ ok: false, error: error.message }); }
  });

  socket.on('battle:choose', async (payload = {}, ack = () => {}) => {
    const room = rooms.get(socket.data.battleCode);
    if (!room || !room.started || room.finished) return ack({ ok: false, error: 'Não existe batalha ativa nesta conexão.' });
    const side = room.players.findIndex(p => p?.socketId === socket.id);
    if (side < 0) return ack({ ok: false, error: 'Você não participa desta batalha.' });
    const choice = String(payload.choice || '').trim();
    if (!/^(move [1-4]( mega| zmove| dynamax)?|switch [1-6]|team [1-6]{6})$/.test(choice)) {
      return ack({ ok: false, error: 'Comando de turno inválido.' });
    }
    try {
      room.stream.write('>p' + (side + 1) + ' ' + choice);
      ack({ ok: true });
    } catch (error) { ack({ ok: false, error: 'Não foi possível registrar a jogada.' }); }
  });

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.battleCode);
    if (!room || room.finished) return;
    const player = room.players.find(p => p?.socketId === socket.id);
    if (player) {
      player.socketId = null;
      emitRoom(room, 'battle:player-disconnected', { side: room.players.indexOf(player) + 1, message: 'O adversário desconectou. A sala permanece reservada para reconexão.' });
    }
  });
});

async function startBattle(room) {
  if (room.started || !room.players[1]) return;
  room.started = true;
  const stream = new Sim.BattleStream();
  room.stream = stream;
  const outputTask = (async () => {
    for await (const chunk of stream) {
      const text = String(chunk);
      emitRoom(room, 'battle:log', { text });
      await persistEvent(room, room.turn || 0, 'simulator_output', { text: text.slice(0, 12000) });
      const turnMatch = text.match(/\|turn\|(\d+)/);
      if (turnMatch) room.turn = Number(turnMatch[1]);
      if (text.includes('|win|') || text.includes('|tie|')) {
        room.finished = true;
        emitRoom(room, 'battle:finished', { text });
        if (supabaseAdmin && room.databaseId) {
          await supabaseAdmin.from('battles').update({ status: 'finished', turn_number: room.turn || 0, finished_at: new Date().toISOString() }).eq('id', room.databaseId);
        }
      }
    }
  })();
  stream.write('>start ' + JSON.stringify({ formatid: room.format }));
  stream.write('>player p1 ' + JSON.stringify({ name: room.players[0].name, team: room.players[0].packed }));
  stream.write('>player p2 ' + JSON.stringify({ name: room.players[1].name, team: room.players[1].packed }));
  await persistEvent(room, 0, 'battle_started', { format: room.format });
  emitRoom(room, 'battle:started', { code: room.code, format: room.format, players: room.players.map(p => p.name) });
  outputTask.catch(error => console.error('Battle stream error:', error));
}

server.on('error', error => console.error('HTTP server error:', error));
server.listen(PORT, '0.0.0.0', () => {
  console.log('Pokédex API + Battle server ouvindo na porta ' + PORT);
  if (!supabaseAdmin) console.warn('SUPABASE_SERVICE_ROLE_KEY não configurada: persistência de partidas desativada.');
});
function shutdown() {
  io.close(() => server.close(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
