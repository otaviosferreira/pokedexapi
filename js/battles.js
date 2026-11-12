/* Equipes e batalhas: cliente do simulador hospedado no Render. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const SUPABASE_URL = 'https://jqaverqnhpbnrheirbqo.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_fYv07uf1N1HAPLXU1ByG1g_mHGOcU-f';
  const API_URL = 'https://pokedexapi-api.onrender.com';
  const TEAM_KEY = 'pokedex-battle-team-v1';
  let sb = null, socket = null, currentUser = null, teamCache = [], catalog = [], currentRoom = null, slotDetails = new Map();
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
    $('battle-team-slots').innerHTML = teamCache.map((p,i) => {
      const moveListId = 'battle-moves-' + i;
      return '<div class="battle-slot" data-slot="'+i+'"><strong>'+(i+1)+'.</strong><div class="slot-species-wrap"><input class="slot-species" list="battle-pokemon-options" placeholder="Digite o nome do Pokémon" value="'+esc(p.species || '')+'" autocomplete="off" aria-label="Pokémon '+(i+1)+'"><datalist id="battle-pokemon-options">'+catalog.map(item=>'<option value="'+esc(item.name)+'">#'+item.id+'</option>').join('')+'</datalist></div><div class="slot-ability-wrap"><select class="slot-ability" aria-label="Habilidade '+(i+1)+'" disabled><option value="">Escolha um Pokémon primeiro</option></select><div class="slot-types" aria-live="polite"></div></div><div class="slot-moves">'+[0,1,2,3].map(n=>'<input class="slot-move" data-move="'+n+'" list="'+moveListId+'" placeholder="Digite ou escolha golpe '+(n+1)+'" value="'+esc(p.moves?.[n] || '')+'" disabled>').join('')+'</div><datalist id="'+moveListId+'"></datalist></div>';
    }).join('');
    [...$('battle-team-slots').querySelectorAll('.battle-slot')].forEach((row,i)=>{
      const species=row.querySelector('.slot-species');
      row.querySelectorAll('.slot-move').forEach(input=>input.addEventListener('change',()=>{teamCache[i].moves[row.querySelectorAll('.slot-move').length?Number(input.dataset.move):0]=input.value.trim().toLowerCase().replaceAll(' ','-');}));
      species.addEventListener('change',()=>resolveSpecies(i,species.value));
      species.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();resolveSpecies(i,species.value);}});
      row.querySelector('.slot-ability').addEventListener('change',event=>teamCache[i].ability=event.target.value);
    });
    teamCache.forEach((p,i)=>{if(p.species)resolveSpecies(i,p.species);});
  }
  async function resolveSpecies(index,value) {
    const query=String(value||'').trim().toLowerCase();
    const match=catalog.find(p=>p.name.toLowerCase()===query || String(p.id)===query.replace(/^#/,'')) ||
      catalog.find(p=>p.name.toLowerCase().startsWith(query));
    if(!match){log('Não encontrei esse Pokémon. Digite um nome válido da Pokédex.');return;}
    const input=$('battle-team-slots').querySelector('[data-slot="'+index+'"] .slot-species');
    input.value=match.name;
    await loadSlotDetails(index,match.id);
  }
  async function loadSlotDetails(index,id) {
    const row=$('battle-team-slots').querySelector('[data-slot="'+index+'"]');
    if(!id){teamCache[index]={species:'',speciesId:0,ability:'',moves:[],item:'',level:100,nature:'Serious'};return;}
    try {
      const data=await PokeAPI.pokemon(id);
      const abilities=(data.abilities||[]).map(a=>({name:a.ability.name,hidden:a.is_hidden}));
      const typeEntries=(data.types||[]).sort((a,b)=>a.slot-b.slot);
      row.querySelector('.slot-types').innerHTML=typeEntries.map(entry=>{
        const type=entry.type.name;
        const typeId=Number(entry.type.url.match(/type\/(\d+)/)?.[1]||0);
        const icon=typeId?'<img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/types/generation-ix/scarlet-violet/'+typeId+'.png" alt="'+esc(type)+'" onerror="this.style.display=\\'none\\'">':'';
        return '<span class="battle-type type-'+esc(type)+'">'+icon+esc(type)+'</span>';
      }).join('');

      const abilitySelect=row.querySelector('.slot-ability');
      abilitySelect.innerHTML='<option value="">Selecione uma habilidade</option>'+abilities.map(a=>'<option value="'+esc(a.name)+'">'+esc(a.name.replaceAll('-',' '))+(a.hidden?' (oculta)':'')+'</option>').join('');
      abilitySelect.disabled=!abilities.length;
      const learnable=(data.moves||[]).filter(m=>(m.version_group_details||[]).some(v=>['scarlet-violet','sword-shield','brilliant-diamond-shining-pearl','legends-arceus'].includes(v.version_group?.name))).map(m=>m.move.name);
      const moveOptions=learnable.length?learnable:(data.moves||[]).map(m=>m.move.name);
      const list=row.querySelector('datalist[id^="battle-moves-"]');
      list.innerHTML=moveOptions.map(name=>'<option value="'+esc(name)+'">').join('');
      const old=teamCache[index]?.moves||[];
      const selected=old.filter(name=>moveOptions.includes(name)).slice(0,4);
      teamCache[index]={...teamCache[index],species:data.name,speciesId:id,ability:abilities.find(x=>!x.hidden)?.name||abilities[0]?.name||'',moves:selected,item:teamCache[index]?.item||'',level:100,nature:teamCache[index]?.nature||'Serious'};
      row.querySelectorAll('.slot-move').forEach((input,n)=>{input.disabled=false;input.value=selected[n]||'';});
      abilitySelect.value=teamCache[index].ability;
      slotDetails.set(index,{moves:new Set(moveOptions),abilities:new Set(abilities.map(a=>a.name))});
      log('Carregado '+data.name+': '+abilities.length+' habilidades (incluindo oculta) e '+moveOptions.length+' golpes sugeridos.');
    } catch(error) { log('Falha ao carregar detalhes do Pokémon: '+error.message); }
  }
  function collectTeam() {
    const team=[];
    [...$('battle-team-slots').querySelectorAll('.battle-slot')].forEach((row,i)=>{
      const id=Number(catalog.find(p=>p.name===row.querySelector('.slot-species').value.trim().toLowerCase())?.id||0);
      const species=catalog.find(p=>p.id===id);
      const moves=[...row.querySelectorAll('.slot-move')].map(input=>input.value.trim().toLowerCase().replaceAll(' ','-')).filter(Boolean);
      if(!species) throw new Error('Escolha um Pokémon válido no espaço '+(i+1)+'.');
      if(!moves.length) throw new Error('Informe pelo menos um golpe para '+species.name+'.');
      const details=slotDetails.get(i);
      if(details && moves.some(move=>!details.moves.has(move))) throw new Error('Um dos golpes de '+species.name+' não está na lista de golpes que ele pode aprender.');
      const ability=row.querySelector('.slot-ability').value;
      if(ability && details && !details.abilities.has(ability)) throw new Error('Habilidade inválida para '+species.name+'.');
      team.push({species:species.name,speciesId:id,ability,moves,item:teamCache[i]?.item||'',level:100,nature:teamCache[i]?.nature||'Serious'});
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
    socket.on('battle:log',data=>{parseBattleText(data.text);String(data.text).split('\n').filter(Boolean).forEach(line=>log(line));});
    socket.on('battle:player-disconnected',data=>log(data.message));
    socket.on('battle:finished',data=>{setStatus('Partida encerrada.');log('Fim da batalha. '+data.text);});
  }
  function ensureBattleArena() {
    const logNode=$('battle-log');
    if($('battle-arena')) return;
    const arena=document.createElement('div');
    arena.id='battle-arena';
    arena.className='retro-arena';
    arena.innerHTML='<div class="retro-field"><div class="retro-opponent"><div class="retro-status"><strong id="arena-opponent-name">OPONENTE</strong><span id="arena-opponent-level">Lv. 50</span><div class="retro-hp"><i id="arena-opponent-hp"></i></div></div><img id="arena-opponent-sprite" alt="Pokémon adversário"></div><div class="retro-player"><img id="arena-player-sprite" alt="Seu Pokémon"><div class="retro-status"><strong id="arena-player-name">SEU POKÉMON</strong><span id="arena-player-level">Lv. 50</span><div class="retro-hp"><i id="arena-player-hp"></i></div></div></div></div><div class="retro-dialog"><p id="arena-message">O que seu Pokémon fará?</p><div class="retro-menu" id="arena-menu"><button data-arena="fight">▶ LUTAR</button><button data-arena="bag">MOCHILA</button><button data-arena="pokemon">POKÉMON</button><button data-arena="run">FUGIR</button></div></div>';
    logNode.parentNode.insertBefore(arena,logNode);
    arena.querySelectorAll('[data-arena]').forEach(button=>button.addEventListener('click',()=>{
      const action=button.dataset.arena;
      $('arena-message').textContent=action==='fight'?'Escolha um golpe abaixo.':action==='pokemon'?'Use os botões Trocar abaixo para escolher sua equipe.':action==='bag'?'A mochila ainda não está disponível nesta versão.':'Não é possível fugir de uma batalha online.';
      if(action==='fight') $('battle-turn-controls').hidden=false;
    }));
  }
  function setArenaPokemon(side,name) {
    const match=catalog.find(p=>p.name===String(name).toLowerCase()) || catalog.find(p=>p.name===String(name).toLowerCase().replace(/[^a-z0-9-]/g,''));
    if(!match)return;
    const prefix=side==='p1'?'player':'opponent';
    $('arena-'+prefix+'-name').textContent=match.name.toUpperCase();
    $('arena-'+prefix+'-sprite').src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/'+match.id+'.png';
    $('arena-message').textContent=(side==='p1'?'Você enviou ':'O adversário enviou ')+match.name+'!';
  }
  function parseBattleText(text) {
    for(const line of String(text).split('\n')) {
      const parts=line.split('|');
      if(parts[1]==='switch'||parts[1]==='drag') {
        const side=parts[2]?.startsWith('p1')?'p1':parts[2]?.startsWith('p2')?'p2':null;
        const name=parts[3]?.split(',')[0]?.trim().toLowerCase();
        if(side&&name)setArenaPokemon(side,name);
      } else if(parts[1]==='move') {
        $('arena-message').textContent=(parts[2]||'').startsWith('p1')?'Seu Pokémon usou '+(parts[3]||'um golpe')+'!':'O adversário usou '+(parts[3]||'um golpe')+'!';
      } else if(parts[1]==='-damage'||parts[1]==='-heal') {
        const side=parts[2]?.startsWith('p1')?'player':parts[2]?.startsWith('p2')?'opponent':null;
        if(side) {const hp=parts[3]||'';const pct=Number((hp.match(/(\d+(?:\.\d+)?)%/)||[])[1]||100);$('arena-'+side+'-hp').style.width=Math.max(0,Math.min(100,pct))+'%';}
      } else if(parts[1]==='win') $('arena-message').textContent=parts[2]+' venceu a batalha!';
      else if(parts[1]==='faint') $('arena-message').textContent=(parts[2]||'Pokémon')+' foi derrotado!';
    }
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
      const rows=team.map((p,i)=>({team_id:created.id,slot:i+1,pokemon_id:p.speciesId,species:p.species,level:p.level,ability:p.ability || 'No Ability',moves:p.moves,item:p.item || null,nature:p.nature || 'Serious',nature:p.nature || 'Serious'}));
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
      ensureBattleArena();
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
