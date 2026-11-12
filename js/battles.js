/* Equipes e batalhas: cliente do simulador hospedado no Render. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const SUPABASE_URL = 'https://jqaverqnhpbnrheirbqo.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_fYv07uf1N1HAPLXU1ByG1g_mHGOcU-f';
  const API_URL = 'https://pokedexapi-api.onrender.com';
  const TEAM_KEY = 'pokedex-battle-team-v1';
  let sb = null, socket = null, currentUser = null, teamCache = [], catalog = [], currentRoom = null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function log(message) {
    const node = $('battle-log');
    const line = document.createElement('div');
    line.className = 'battle-line';
    line.textContent = message;
    node.appendChild(line);
    node.scrollTop = node.scrollHeight;
  }
  function setStatus(message, online = false) {
    $('battle-status').textContent = message;
    $('battle-indicator').textContent = online ? 'CONECTADO' : 'AGUARDANDO';
  }
  function defaultTeam() {
    try {
      const saved = JSON.parse(localStorage.getItem(TEAM_KEY) || '[]');
      if (Array.isArray(saved) && saved.length === 6) return saved;
    } catch {}
    return Array.from({length:6}, () => ({species:'', speciesId:0, ability:'', moves:[], item:'', level:100}));
  }
  function renderSlots() {
    const options = '<option value="">Selecione um Pokémon</option>' + catalog.map(p => '<option value="'+p.id+'">#'+String(p.id).padStart(3,'0')+' '+esc(p.name)+'</option>').join('');
    $('battle-team-slots').innerHTML = teamCache.map((p,i) => '<div class="battle-slot" data-slot="'+i+'"><strong>'+(i+1)+'.</strong><select class="slot-species" aria-label="Pokémon '+(i+1)+'">'+options+'</select><select class="slot-ability" aria-label="Habilidade '+(i+1)+'"><option value="">Habilidade automática</option></select><div class="slot-moves">'+[0,1,2,3].map(n=>'<input class="slot-move" data-move="'+n+'" placeholder="Golpe '+(n+1)+'" value="'+esc(p.moves?.[n] || '')+'">').join('')+'</div></div>').join('');
    [...$('battle-team-slots').querySelectorAll('.battle-slot')].forEach((row,i)=>{
      const species=row.querySelector('.slot-species');
      species.value=teamCache[i].speciesId || '';
      row.querySelectorAll('.slot-move').forEach(input=>input.addEventListener('change',()=>{teamCache[i].moves[row.querySelectorAll('.slot-move').length?Number(input.dataset.move):0]=input.value.trim().toLowerCase().replaceAll(' ','-');}));
      species.addEventListener('change',()=>loadSlotDetails(i,Number(species.value)));
      row.querySelector('.slot-ability').addEventListener('change',event=>teamCache[i].ability=event.target.value);
    });
  }
  async function loadSlotDetails(index,id) {
    const row=$('battle-team-slots').querySelector('[data-slot="'+index+'"]');
    if(!id){teamCache[index]={species:'',speciesId:0,ability:'',moves:[],item:'',level:100};row.querySelector('.slot-ability').innerHTML='<option value="">Habilidade automática</option>';return;}
    try {
      const data=await PokeAPI.pokemon(id);
      const abilities=data.abilities.filter(a=>!a.is_hidden).map(a=>a.ability.name);
      const abilitySelect=row.querySelector('.slot-ability');
      abilitySelect.innerHTML='<option value="">Automática</option>'+abilities.map(a=>'<option value="'+esc(a)+'">'+esc(a.replaceAll('-',' '))+'</option>').join('');
      const oldMoves=teamCache[index].moves || [];
      const moves=data.moves.map(m=>m.move.name);
      const selected=oldMoves.length?oldMoves.slice(0,4):moves.slice(0,4);
      teamCache[index]={...teamCache[index],species:data.name,speciesId:id,ability:abilities[0] || '',moves:selected,item:'',level:100};
      row.querySelectorAll('.slot-move').forEach((input,n)=>input.value=selected[n] || '');
      abilitySelect.value=teamCache[index].ability;
      log('Carregado '+data.name+': '+abilities.length+' habilidades e '+moves.length+' golpes disponíveis na PokéAPI.');
    } catch(error) { log('Falha ao carregar detalhes do Pokémon: '+error.message); }
  }
  function collectTeam() {
    const team=[];
    [...$('battle-team-slots').querySelectorAll('.battle-slot')].forEach((row,i)=>{
      const id=Number(row.querySelector('.slot-species').value);
      const species=catalog.find(p=>p.id===id);
      const moves=[...row.querySelectorAll('.slot-move')].map(input=>input.value.trim().toLowerCase().replaceAll(' ','-')).filter(Boolean);
      if(!species) throw new Error('Escolha um Pokémon para o espaço '+(i+1)+'.');
      if(!moves.length) throw new Error('Informe pelo menos um golpe para '+species.name+'.');
      team.push({species:species.name,speciesId:id,ability:row.querySelector('.slot-ability').value || '',moves,item:'',level:100});
    });
    if(team.length!==6) throw new Error('A equipe precisa ter seis Pokémon.');
    teamCache=team;
    return team;
  }
  async function getToken() {
    const {data}=await sb.auth.getSession();
    return data.session?.access_token || null;
  }
  async function connectSocket() {
    const token=await getToken();
    if(socket) socket.disconnect();
    socket=window.io(API_URL,{transports:['websocket','polling'],auth:token?{token}:{}});
    socket.on('connect',()=>setStatus('Conectado ao servidor de batalhas.',true));
    socket.on('connect_error',error=>log('Conexão: '+error.message));
    socket.on('battle:waiting',data=>{setStatus(data.message);log(data.message);});
    socket.on('battle:started',data=>{setStatus('Batalha iniciada: '+data.players.join(' × '),true);$('battle-turn-controls').hidden=false;log('Batalha iniciada · '+data.format);renderTurnButtons();});
    socket.on('battle:log',data=>String(data.text).split('\n').filter(Boolean).forEach(line=>log(line)));
    socket.on('battle:player-disconnected',data=>log(data.message));
    socket.on('battle:finished',data=>{setStatus('Partida encerrada.');log('Fim da batalha. '+data.text);});
  }
  function renderTurnButtons() {
    $('battle-move-buttons').innerHTML=[1,2,3,4].map(n=>'<button data-choice="move '+n+'">Ataque '+n+'</button>').join('');
    $('battle-switch-buttons').innerHTML=[1,2,3,4,5,6].map(n=>'<button data-choice="switch '+n+'">Trocar '+n+'</button>').join('');
    $('battle-turn-controls').querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>socket.emit('battle:choose',{choice:button.dataset.choice},result=>{if(!result?.ok)log(result?.error || 'Jogada recusada.');else log('Jogada enviada: '+button.dataset.choice);})));
  }
  function emitAck(event,payload) {
    return new Promise((resolve,reject)=>{
      if(!socket?.connected)return reject(new Error('O servidor de batalhas ainda não conectou.'));
      socket.emit(event,payload,result=>result?.ok?resolve(result):reject(new Error(result?.error || 'Não foi possível executar a ação.')));
    });
  }
  async function createBattle(mode) {
    try {
      const team=collectTeam();
      await connectSocket();
      if(!socket.connected) await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('Tempo limite ao conectar ao Render.')),15000);socket.once('connect',()=>{clearTimeout(t);resolve();});socket.once('connect_error',e=>{clearTimeout(t);reject(e);});});
      const result=await emitAck('battle:create',{mode,team,name:currentUser?.user_metadata?.username || currentUser?.email?.split('@')[0] || 'Treinador'});
      currentRoom=result.code;
      $('battle-room-display').hidden=false;
      $('battle-room-display').textContent='CÓDIGO: '+result.code;
      $('battle-room-code').value=result.code;
      setStatus('Sala criada. Compartilhe o código com o segundo jogador.');
      log('Sala '+result.code+' criada. Aguardando adversário.');
    } catch(error){log(error.message);setStatus('Não foi possível criar a sala.');}
  }
  async function joinBattle() {
    try {
      const team=collectTeam(),code=$('battle-room-code').value.trim().toUpperCase();
      if(code.length!==6)throw new Error('Informe o código de seis caracteres da sala.');
      await connectSocket();
      if(!socket.connected) await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('Tempo limite ao conectar ao Render.')),15000);socket.once('connect',()=>{clearTimeout(t);resolve();});socket.once('connect_error',e=>{clearTimeout(t);reject(e);});});
      await emitAck('battle:join',{code,team,name:currentUser?.user_metadata?.username || currentUser?.email?.split('@')[0] || 'Treinador'});
      currentRoom=code;
      $('battle-room-display').hidden=false;$('battle-room-display').textContent='CÓDIGO: '+code;
      log('Você entrou na sala '+code+'.');
    } catch(error){log(error.message);}
  }
  async function saveTeam() {
    try {
      if(!currentUser)throw new Error('Entre na sua conta para salvar equipes na nuvem.');
      const team=collectTeam();
      const {data:created,error}=await sb.from('teams').insert({owner_id:currentUser.id,name:$('battle-team-name').value.trim() || 'Minha equipe',format:'gen9_singles_6v6'}).select().single();
      if(error)throw error;
      const rows=team.map((p,i)=>({team_id:created.id,slot:i+1,pokemon_id:p.speciesId,species:p.species,level:p.level,ability:p.ability || 'No Ability',moves:p.moves,item:p.item || null}));
      const saved=await sb.from('team_pokemon').insert(rows);
      if(saved.error)throw saved.error;
      log('Equipe salva na nuvem: '+created.name+'.');
    } catch(error){log('Não foi possível salvar: '+error.message);}
  }
  async function initAuth() {
    if(!window.supabase?.createClient){$('battle-auth-status').textContent='Biblioteca de autenticação não carregou.';return;}
    sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
    const {data}=await sb.auth.getSession();
    currentUser=data.session?.user || null;
    updateAuthUI();
    sb.auth.onAuthStateChange((_event,session)=>{currentUser=session?.user || null;updateAuthUI();});
  }
  function updateAuthUI() {
    $('battle-auth-status').textContent=currentUser?'Conectado como '+(currentUser.user_metadata?.username || currentUser.email):'Entre ou crie uma conta para salvar equipes e participar de partidas online.';
    $('battle-signin').hidden=!!currentUser;$('battle-signup').hidden=!!currentUser;$('battle-signout').hidden=!currentUser;
  }
  async function authAction(kind) {
    const email=$('battle-email').value.trim(),password=$('battle-password').value;
    if(!email||!password)return log('Informe e-mail e senha.');
    const result=kind==='signup'
      ? await sb.auth.signUp({email,password,options:{data:{username:$('battle-username').value.trim() || email.split('@')[0]}}})
      : await sb.auth.signInWithPassword({email,password});
    if(result.error)return log(result.error.message);
    if(kind==='signup'&&!result.data.session)log('Cadastro criado. Confirme o e-mail para entrar.');
    else {currentUser=result.data.user;updateAuthUI();log('Autenticação concluída.');}
  }
  async function init() {
    if(!$('view-battles'))return;
    try {
      const response=await fetch('/data/pokemon.json');
      catalog=await response.json();
      teamCache=defaultTeam();
      renderSlots();
      $('battle-signin').addEventListener('click',()=>authAction('signin'));
      $('battle-signup').addEventListener('click',()=>authAction('signup'));
      $('battle-signout').addEventListener('click',async()=>{await sb.auth.signOut();currentUser=null;updateAuthUI();socket?.disconnect();});
      $('battle-save-team').addEventListener('click',saveTeam);
      $('battle-create-local').addEventListener('click',()=>createBattle('local'));
      $('battle-create-online').addEventListener('click',()=>createBattle('online'));
      $('battle-join-room').addEventListener('click',joinBattle);
      await initAuth();
    } catch(error){log('Falha ao iniciar o centro de batalhas: '+error.message);}
  }
  document.addEventListener('DOMContentLoaded',init);
})();
