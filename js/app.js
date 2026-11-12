/* Aplicação principal: catálogo, filtros, ficha, evolução, favoritos, coleção e comparador. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const TOTAL = 1025;
  const GEN_NAMES = ['Kanto','Johto','Hoenn','Sinnoh','Unova','Kalos','Alola','Galar','Paldea'];
  const TYPE_NAMES = ['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'];
  const TYPE_LABELS = {normal:'Normal',fire:'Fogo',water:'Água',electric:'Elétrico',grass:'Planta',ice:'Gelo',fighting:'Lutador',poison:'Veneno',ground:'Terra',flying:'Voador',psychic:'Psíquico',bug:'Inseto',rock:'Pedra',ghost:'Fantasma',dragon:'Dragão',dark:'Sombrio',steel:'Aço',fairy:'Fada'};
  const STORAGE = {favorites:'pokedex-favorites-v1',caught:'pokedex-caught-v1',theme:'pokedex-theme-v1'};
  function readSet(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(value)) return new Set();
      return new Set(value.map(Number).filter(id => Number.isInteger(id) && id >= 1 && id <= TOTAL));
    } catch {
      return new Set();
    }
  }
  function readStorage(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function writeStorage(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch { toast('O navegador bloqueou o armazenamento local.'); return false; }
  }
  let favorites = readSet(STORAGE.favorites), caught = readSet(STORAGE.caught);
  let catalog = [], visibleCount = 24, currentView = 'explore', quickFilter = 'all', activeModalId = null;
  const detailCache = new Map(), speciesCache = new Map(), typeMembers = new Map(), speciesFlags = new Map();
  const $grid = $('#pokemon-grid');
  const imageFallback = id => PokeAPI.sprite(id);
  const pad = id => String(id).padStart(3,'0');
  const titleCase = value => value ? value.charAt(0).toUpperCase()+value.slice(1) : '';
  const save = () => {
    writeStorage(STORAGE.favorites,JSON.stringify([...favorites]));
    writeStorage(STORAGE.caught,JSON.stringify([...caught]));
    updateProgress();
  };
  function toast(message) {
    const node = $('#toast'); node.textContent = message; node.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(()=>node.classList.remove('show'),2300);
  }
  function typePill(type) { return '<span class="type-pill type-'+type+'">'+(TYPE_LABELS[type] || titleCase(type))+'</span>'; }
  function generationFor(id) { return PokeAPI.generation(id); }
  function updateProgress() {
    const count = caught.size, percent = (count/TOTAL*100).toFixed(1);
    $('#side-progress').textContent = percent+'%';
    $('#side-progress-bar').style.width = percent+'%';
    $('#side-caught').textContent = count+' de '+TOTAL+' capturados';
    $('#hero-caught').textContent = count.toLocaleString('pt-BR');
    $('#collection-number').textContent = count.toLocaleString('pt-BR');
    $('#collection-percent').textContent = percent+'% da Pokédex completa';
    $('#collection-bar').style.width = percent+'%';
    $('#favorite-count').textContent = favorites.size;
    $('#stat-favorites').textContent = favorites.size;
    $('#stat-caught').textContent = count;
    $('#stat-remaining').textContent = (TOTAL-count).toLocaleString('pt-BR')+' restantes';
    $('#stat-percent').textContent = percent+'%';
  }
  function showView(name) {
    currentView = name;
    $$('.view').forEach(view=>view.classList.toggle('active',view.id==='view-'+name));
    $$('.nav-link').forEach(link=>link.classList.toggle('active',link.dataset.view===name));
    const labels={explore:'Explorar',favorites:'Favoritos',collection:'Minha coleção',compare:'Comparador',statistics:'Estatísticas'};
    $('#breadcrumb-current').textContent=labels[name]||name;
    $('#sidebar').classList.remove('open');
    if(name==='favorites') renderSaved('favorites');
    if(name==='collection') {renderCollection();renderSaved('collection');}
    if(name==='statistics') renderStatistics();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function cardMarkup(entry) {
    const gen = generationFor(entry.id);
    const isFav=favorites.has(entry.id),isCaught=caught.has(entry.id);
    return '<article class="pokemon-card" data-id="'+entry.id+'" tabindex="0" role="button" aria-label="Ver '+entry.name+'">'+
      '<div class="card-top"><span class="pokemon-number">#'+pad(entry.id)+'</span><div class="card-actions">'+
      '<button class="icon-action favorite '+(isFav?'active':'')+'" data-action="favorite" data-id="'+entry.id+'" aria-label="Favoritar">'+(isFav?'♥':'♡')+'</button>'+
      '<button class="icon-action caught '+(isCaught?'active':'')+'" data-action="caught" data-id="'+entry.id+'" aria-label="Marcar capturado">'+(isCaught?'✓':'＋')+'</button></div></div>'+
      '<div class="pokemon-art"><img loading="lazy" src="'+PokeAPI.artwork(entry.id)+'" alt="'+entry.name+'" data-fallback="'+imageFallback(entry.id)+'"></div>'+
      '<h3>'+entry.name+'</h3><div class="card-bottom"><div class="card-types" data-types="'+entry.id+'"><span class="card-loading"></span></div><span class="card-open">Detalhes ↗</span></div></article>';
  }
  function attachCardEvents(container) {
    container.querySelectorAll('.pokemon-card').forEach(card=>{
      const open=()=>openPokemon(Number(card.dataset.id));
      card.addEventListener('click',event=>{if(!event.target.closest('[data-action]'))open();});
      card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});
    });
    container.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',event=>{
      event.stopPropagation(); const id=Number(button.dataset.id),set=button.dataset.action==='favorite'?favorites:caught;
      set.has(id)?set.delete(id):set.add(id);save();
      button.classList.toggle('active',set.has(id));
      button.textContent=button.dataset.action==='favorite'?(set.has(id)?'♥':'♡'):(set.has(id)?'✓':'＋');
      if(currentView==='favorites'&&!favorites.has(id))renderSaved('favorites');
      if(currentView==='collection'&&!caught.has(id))renderSaved('collection');
      toast(set.has(id)?(button.dataset.action==='favorite'?'Adicionado aos favoritos':'Pokémon marcado como capturado'):'Pokémon removido da lista');
    }));
    container.querySelectorAll('img[data-fallback]').forEach(img=>img.addEventListener('error',()=>{
      if(img.dataset.tried!=='1'){img.dataset.tried='1';img.src=img.dataset.fallback;}
      else {img.style.opacity='.2';}
    },{once:true}));
    if ('IntersectionObserver' in window) {
      const observer=new IntersectionObserver(entries=>{
        entries.forEach(item=>{
          if(item.isIntersecting){
            const id=Number(item.target.dataset.types);
            loadCardTypes(id,item.target);
            observer.unobserve(item.target);
          }
        });
      },{rootMargin:'180px'});
      container.querySelectorAll('[data-types]').forEach(node=>observer.observe(node));
    } else {
      container.querySelectorAll('[data-types]').forEach(node=>loadCardTypes(Number(node.dataset.types),node));
    }
  }
  async function loadCardTypes(id,node) {
    try {
      let data=detailCache.get(id);
      if(!data){data=await PokeAPI.pokemon(id);detailCache.set(id,data);}
      node.innerHTML=data.types.map(t=>typePill(t.type.name)).join('');
      const art=node.closest('.pokemon-card')?.querySelector('.pokemon-art');
      if(art)art.style.setProperty('--type-bg',typeColor(data.types[0]?.type.name));
    } catch {node.innerHTML='<span class="card-open">Tipos indisponíveis</span>';}
  }
  function typeColor(type) {
    const colors={normal:'#e8e9ed',fire:'#ffe0d3',water:'#dcecff',electric:'#fff2c5',grass:'#dff3df',ice:'#ddf5f5',fighting:'#f7dedb',poison:'#f0e0f4',ground:'#f1e8d5',flying:'#e4e9ff',psychic:'#ffe1ec',bug:'#edf1d6',rock:'#eee8d7',ghost:'#e9e4f4',dragon:'#e7e1ff',dark:'#e7e2df',steel:'#e4e9ed',fairy:'#f8e4ef'};
    return colors[type]||'#eef1f5';
  }
  function activeEntries() {
    const term=$('#search-input').value.trim().toLowerCase();
    const gen=$('#generation-filter').value, type=$('#type-filter').value, sort=$('#sort-filter').value;
    let list=catalog.filter(entry=>{
      if(gen!=='all'&&generationFor(entry.id)!==Number(gen))return false;
      if(term&&!entry.name.includes(term)&&!String(entry.id).includes(term)&&!pad(entry.id).includes(term))return false;
      if(quickFilter==='favorites'&&!favorites.has(entry.id))return false;
      if(quickFilter==='caught'&&!caught.has(entry.id))return false;
      if(type!=='all'&&!(typeMembers.get(type)||new Set()).has(entry.id))return false;
      if((quickFilter==='legendary'||quickFilter==='mythical')&&speciesFlags.get(entry.id)!==quickFilter)return false;
      return true;
    });
    if(sort==='id-desc')list.sort((a,b)=>b.id-a.id);
    if(sort==='name-asc')list.sort((a,b)=>a.name.localeCompare(b.name));
    if(sort==='name-desc')list.sort((a,b)=>b.name.localeCompare(a.name));
    if(sort==='height'||sort==='weight')list.sort((a,b)=>(detailCache.get(b.id)?.[sort]||0)-(detailCache.get(a.id)?.[sort]||0));
    return list;
  }
  function renderCatalog(reset=true) {
    if(reset)visibleCount=24;
    const list=activeEntries(),shown=list.slice(0,visibleCount);
    $('#results-label').textContent=list.length.toLocaleString('pt-BR')+' resultado(s) encontrado(s)';
    if(!shown.length){$grid.innerHTML='<div class="empty-state">Nenhum Pokémon encontrado. Tente mudar sua pesquisa ou filtros.</div>';}
    else {$grid.innerHTML=shown.map(cardMarkup).join('');attachCardEvents($grid);}
    $('#load-more').hidden=shown.length>=list.length;
    $('#load-more').textContent='Carregar mais Pokémon ('+(list.length-shown.length)+' restantes)';
  }
  async function loadTypeFilter() {
    const select=$('#type-filter');
    try {
      const data=await PokeAPI.typeList();
      const types=data.results.filter(t=>TYPE_NAMES.includes(t.name));
      select.innerHTML='<option value="all">Todos os tipos</option>'+types.map(t=>'<option value="'+t.name+'">'+(TYPE_LABELS[t.name]||titleCase(t.name))+'</option>').join('');
      $('#type-legend').innerHTML=TYPE_NAMES.map(type=>typePill(type)).join('');
    } catch {
      select.innerHTML='<option value="all">Todos os tipos</option>'+TYPE_NAMES.map(type=>'<option value="'+type+'">'+(TYPE_LABELS[type]||titleCase(type))+'</option>').join('');
      $('#type-legend').innerHTML=TYPE_NAMES.map(type=>typePill(type)).join('');
    }
  }
  async function applyTypeFilter(type) {
    if(type==='all'||typeMembers.has(type))return;
    try {
      const data=await PokeAPI.type(type);
      typeMembers.set(type,new Set(data.pokemon.map(item=>Number(item.pokemon.url.split('/').filter(Boolean).pop())).filter(id=>Number.isInteger(id)&&id>=1&&id<=TOTAL)));
    } catch {toast('Não foi possível carregar esse filtro de tipo.');}
  }
  let loadingSpeciesFlags = null;
  async function loadSpeciesFlags() {
    if (loadingSpeciesFlags) return loadingSpeciesFlags;
    const missing = catalog.filter(entry => !speciesFlags.has(entry.id));
    if (!missing.length) return;
    loadingSpeciesFlags = (async () => {
      toast('Carregando classificação de lendários e míticos. Isso pode levar alguns instantes...');
      let completed = 0;
      for (let start=0; start<missing.length; start+=80) {
        const batch=missing.slice(start,start+80);
        await PokeAPI.mapLimit(batch,8,async entry=>{
          const data=await getSpecies(entry.id);
          speciesFlags.set(entry.id,data.is_legendary?'legendary':data.is_mythical?'mythical':'normal');
          completed++;
          return true;
        });
        toast('Classificando espécies: '+completed+' de '+missing.length);
      }
      toast('Classificação concluída.');
    })();
    try { await loadingSpeciesFlags; }
    finally { loadingSpeciesFlags = null; }
  }
  async function renderSaved(which) {
    const ids=[...(which==='favorites'?favorites:caught)].sort((a,b)=>a-b);
    const container=which==='favorites'?$('#favorites-grid'):$('#collection-grid');
    const entries=ids.map(id=>catalog[id-1]).filter(Boolean);
    container.innerHTML=entries.length?entries.map(cardMarkup).join(''):'<div class="empty-state">'+(which==='favorites'?'Você ainda não favoritou nenhum Pokémon. Explore o catálogo e toque no coração.':'Sua coleção ainda está vazia. Marque Pokémon como capturados para acompanhá-los aqui.')+'</div>';
    attachCardEvents(container);
  }
  function renderCollection() {
    $('#generation-progress').innerHTML=GEN_NAMES.map((name,index)=>{
      const ranges=[[1,151],[152,251],[252,386],[387,493],[494,649],[650,721],[722,809],[810,905],[906,1025]][index];
      let count=0;for(let id=ranges[0];id<=ranges[1];id++)if(caught.has(id))count++;
      const total=ranges[1]-ranges[0]+1;
      return '<article class="generation-item"><div class="generation-item-top"><span>Geração '+(index+1)+' · '+name+'</span><strong>'+count+'/'+total+'</strong></div><div class="progress-track"><i style="width:'+(count/total*100)+'%"></i></div></article>';
    }).join('');
  }
  async function getSpecies(id) {
    if(speciesCache.has(id))return speciesCache.get(id);
    const data=await PokeAPI.species(id);speciesCache.set(id,data);return data;
  }
  function flattenEvolution(chain,output=[]) {
    if(!chain)return output;
    const id=Number(chain.species.url.match(/\/pokemon-species\/(\d+)\//)?.[1]);
    output.push({id,name:chain.species.name,details:chain.evolution_details||[]});
    (chain.evolves_to||[]).forEach(child=>flattenEvolution(child,output));
    return output;
  }
  function evolutionCondition(details) {
    if(!details.length)return 'Forma base';
    const d=details[0],parts=[];
    if(d.min_level)parts.push('Nível '+d.min_level);
    if(d.item?.name)parts.push('Usar '+d.item.name.replaceAll('-',' '));
    if(d.trigger?.name==='trade')parts.push('Troca');
    if(d.min_happiness)parts.push('Amizade '+d.min_happiness);
    if(d.time_of_day)parts.push(d.time_of_day);
    if(d.known_move?.name)parts.push('Conhecer '+d.known_move.name);
    if(d.location?.name)parts.push('Local: '+d.location.name.replaceAll('-',' '));
    return parts.join(' · ')||'Condição especial';
  }
  async function openPokemon(id) {
    activeModalId=id;
    const modal=$('#pokemon-modal');modal.classList.add('open');modal.setAttribute('aria-hidden','false');
    $('#modal-content').innerHTML='<div class="loading-state"><div class="pokeball-loader"></div><p>Carregando ficha Pokémon...</p></div>';
    try {
      const [data,species]=await Promise.all([PokeAPI.pokemon(id),getSpecies(id)]);
      detailCache.set(id,data);
      const english=species.flavor_text_entries?.find(entry=>entry.language?.name==='en')?.flavor_text?.replace(/[\n\f]/g,' ').replace(/\s+/g,' ')||'Descrição não disponível.';
      const pt=species.flavor_text_entries?.find(entry=>entry.language?.name==='pt')?.flavor_text?.replace(/[\n\f]/g,' ').replace(/\s+/g,' ');
      const image=data.sprites.other?.['official-artwork']?.front_default||data.sprites.other?.home?.front_default||data.sprites.front_default||PokeAPI.artwork(id);
      const stats=data.stats.map(stat=>({name:stat.stat.name,value:stat.base_stat}));
      const total=stats.reduce((sum,s)=>sum+s.value,0);
      const abilities=data.abilities.map(a=>'<span class="ability-tag">'+a.ability.name.replaceAll('-',' ')+(a.is_hidden?' · Oculta':'')+'</span>').join('');
      let evoHtml='<p class="muted">Linha evolutiva indisponível.</p>';
      if(species.evolution_chain?.url){
        try{
          const evoData=await PokeAPI.evolution(species.evolution_chain.url);
          const chain=flattenEvolution(evoData.chain);
          evoHtml='<div class="evolution-chain">'+chain.map((item,index)=>'<div class="evolution-node" data-evo="'+item.id+'"><img loading="lazy" src="'+PokeAPI.artwork(item.id)+'" alt="'+item.name+'"><strong>'+item.name+'</strong><small>#'+pad(item.id)+'</small></div>'+(index<chain.length-1?'<span class="evolution-arrow">→</span>':'')).join('')+'</div><p class="muted">'+chain.slice(1).map(item=>item.name+': '+evolutionCondition(item.details)).join(' | ')+'</p>';
        }catch{}
      }
      const varieties=(species.varieties||[]).filter(v=>v.pokemon?.name);
      const forms=varieties.length>1?'<div class="form-switches">'+varieties.map(v=>'<button data-form="'+v.pokemon.name+'" class="'+(v.pokemon.name===data.name?'active':'')+'">'+v.pokemon.name.replace(data.species.name,'').replace(/^-/,'')||'Normal'+'</button>').join('')+'</div>':'<p class="muted">Esta espécie não possui outras formas cadastradas na PokéAPI.</p>';
      const types=data.types.map(t=>typePill(t.type.name)).join('');
      $('#modal-content').innerHTML='<div class="modal-hero"><div class="modal-art"><img src="'+image+'" alt="'+data.name+'"></div><div class="modal-title"><small>#'+pad(id)+' · '+(species.genera?.find(g=>g.language.name==='en')?.genus||'Pokémon')+'</small><h2 id="modal-name">'+data.name.replaceAll('-',' ')+'</h2><div class="card-types">'+types+'</div><p>'+(pt||english)+'</p><div class="modal-meta"><span>↕ '+(data.height/10)+' m</span><span>◈ '+(data.weight/10)+' kg</span><span>XP base: '+data.base_experience+'</span></div><div class="card-actions" style="margin-top:15px"><button class="icon-action favorite '+(favorites.has(id)?'active':'')+'" id="modal-favorite">'+(favorites.has(id)?'♥':'♡')+'</button><button class="icon-action caught '+(caught.has(id)?'active':'')+'" id="modal-caught">'+(caught.has(id)?'✓':'＋')+'</button></div></div></div>'+
      '<div class="modal-section"><h3>Atributos base <span style="color:var(--muted);font-weight:500">· Total '+total+'</span></h3>'+stats.map(s=>'<div class="stat-line"><span>'+s.name.replace('special-','Sp. ').replace('attack','Ataque').replace('defense','Defesa').replace('hp','HP').replace('speed','Velocidade')+'</span><div class="progress-track"><i style="width:'+Math.min(s.value/255*100,100)+'%;background:'+(s.value>=100?'#42bd83':'#ef7770')+'"></i></div><strong>'+s.value+'</strong></div>').join('')+'</div>'+
      '<div class="modal-section"><h3>Habilidades</h3><div class="ability-list">'+abilities+'</div></div>'+
      '<div class="modal-section"><h3>Formas e variações</h3>'+forms+'</div>'+
      '<div class="modal-section"><h3>Linha evolutiva</h3>'+evoHtml+'</div>'+
      '<div class="modal-section"><h3>Informações da espécie</h3><div class="modal-meta"><span>Captura: '+species.capture_rate+'/255</span><span>Felicidade base: '+species.base_happiness+'</span><span>Cor: '+species.color.name+'</span></div></div>';
      $('#modal-favorite').addEventListener('click',()=>{toggleSet(favorites,id,STORAGE.favorites);$('#modal-favorite').classList.toggle('active',favorites.has(id));$('#modal-favorite').textContent=favorites.has(id)?'♥':'♡';});
      $('#modal-caught').addEventListener('click',()=>{toggleSet(caught,id,STORAGE.caught);$('#modal-caught').classList.toggle('active',caught.has(id));$('#modal-caught').textContent=caught.has(id)?'✓':'＋';});
      $('#modal-content').querySelectorAll('[data-evo]').forEach(node=>node.addEventListener('click',()=>openPokemon(Number(node.dataset.evo))));
      $('#modal-content').querySelectorAll('[data-form]').forEach(button=>button.addEventListener('click',async()=>{
        try{const form=await PokeAPI.pokemon(button.dataset.form);const formImage=form.sprites.other?.['official-artwork']?.front_default||form.sprites.front_default;$('#modal-content .modal-art img').src=formImage;$('#modal-content .modal-title h2').textContent=form.name.replaceAll('-',' ');$('#modal-content .modal-title .card-types').innerHTML=form.types.map(t=>typePill(t.type.name)).join('');$('#modal-content [data-form].active')?.classList.remove('active');button.classList.add('active');}catch{toast('Não foi possível carregar essa forma.');}
      }));
    }catch(error){$('#modal-content').innerHTML='<div class="empty-state">Não foi possível carregar este Pokémon.<br><br>'+error.message+'</div>';}
  }
  function toggleSet(set,id,key){set.has(id)?set.delete(id):set.add(id);save();if(currentView==='favorites')renderSaved('favorites');if(currentView==='collection')renderSaved('collection');}
  function closeModal(){ $('#pokemon-modal').classList.remove('open');$('#pokemon-modal').setAttribute('aria-hidden','true');activeModalId=null; }
  async function resolveCompare(value) {
    const input=value.trim().toLowerCase();if(!input)return null;
    const entry=/^\d+$/.test(input)?catalog[Number(input)-1]:catalog.find(p=>p.name===input);
    if(!entry)return null;
    const data=await PokeAPI.pokemon(entry.id);detailCache.set(entry.id,data);return data;
  }
  async function comparePokemon() {
    const result=$('#compare-result');result.innerHTML='<div class="loading-state"><div class="pokeball-loader"></div><p>Comparando...</p></div>';
    try{
      const [a,b]=await Promise.all([resolveCompare($('#compare-one').value),resolveCompare($('#compare-two').value)]);
      if(!a||!b)throw new Error('Informe dois Pokémon válidos pelo nome ou número da Pokédex.');
      const maxStats=a.stats.map((s,i)=>Math.max(s.base_stat,b.stats[i].base_stat));
      const make=(p)=>'<article class="compare-pokemon"><img src="'+(p.sprites.other?.['official-artwork']?.front_default||PokeAPI.artwork(p.id))+'" alt="'+p.name+'"><small>#'+pad(p.id)+'</small><h3>'+p.name.replaceAll('-',' ')+'</h3><div class="card-types">'+p.types.map(t=>typePill(t.type.name)).join('')+'</div><p class="muted">'+(p.height/10)+' m · '+(p.weight/10)+' kg</p>'+p.stats.map((s,i)=>'<div class="compare-stat"><span>'+s.stat.name.replace('special-','Sp. ')+'</span><div class="progress-track"><i style="display:block;width:'+(s.base_stat/255*100)+'%;height:100%;background:'+(s.base_stat===maxStats[i]?'#42bd83':'#ef7770');border-radius:20px"></i></div><b>'+s.base_stat+'</b></div>').join('')+'<strong>Total: '+p.stats.reduce((sum,s)=>sum+s.base_stat,0)+'</strong></article>';
      result.innerHTML='<div class="compare-columns">'+make(a)+make(b)+'</div>';
    }catch(error){result.innerHTML='<div class="empty-state">'+error.message+'</div>';}
  }
  async function renderStatistics() {
    const ranges=[[1,151],[152,251],[252,386],[387,493],[494,649],[650,721],[722,809],[810,905],[906,1025]];
    $('#generation-chart').innerHTML=ranges.map((range,index)=>'<div class="bar-row"><span>'+GEN_NAMES[index]+'</span><div class="progress-track"><i style="display:block;width:'+((range[1]-range[0]+1)/151*100)+'%;height:100%;background:#ef7770;border-radius:20px"></i></div><b>'+(range[1]-range[0]+1)+'</b></div>').join('');
    const typeCounts=await Promise.all(TYPE_NAMES.map(async type=>{try{const data=await PokeAPI.type(type);return {type,count:data.pokemon.filter(item=>{const id=Number(item.pokemon.url.split('/').filter(Boolean).pop());return id&&id<=TOTAL;}).length};}catch{return {type,count:0};}}));$('#type-chart').innerHTML=typeCounts.map(item=>'<div class="type-stat">'+typePill(item.type)+' <strong>'+item.count+'</strong></div>').join('');
    updateProgress();
  }
  function setupEvents() {
    $$('.nav-link').forEach(link=>link.addEventListener('click',()=>showView(link.dataset.view)));
    $('#mobile-menu').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
    $('#theme-toggle').addEventListener('click',()=>{
      document.body.classList.toggle('dark');const dark=document.body.classList.contains('dark');
      writeStorage(STORAGE.theme,dark?'dark':'light');$('#theme-icon').textContent=dark?'☀':'☾';
    });
    if(readStorage(STORAGE.theme)==='dark'){document.body.classList.add('dark');$('#theme-icon').textContent='☀';}
    $('#search-input').addEventListener('input',()=>renderCatalog());
    $('#generation-filter').addEventListener('change',()=>renderCatalog());
    $('#sort-filter').addEventListener('change',async()=>{const sort=$('#sort-filter').value;if(sort==='height'||sort==='weight'){toast('Carregando medidas para ordenar...');await PokeAPI.mapLimit(catalog,10,async entry=>{if(!detailCache.has(entry.id)){const data=await PokeAPI.pokemon(entry.id);detailCache.set(entry.id,data);}return true;});}renderCatalog();});
    $('#type-filter').addEventListener('change',async event=>{await applyTypeFilter(event.target.value);renderCatalog();});
    $('#reset-filters').addEventListener('click',()=>{$('#search-input').value='';$('#generation-filter').value='all';$('#type-filter').value='all';$('#sort-filter').value='id-asc';quickFilter='all';$$('[data-quick]').forEach(c=>c.classList.toggle('active',c.dataset.quick==='all'));renderCatalog();});
    $$('[data-quick]').forEach(chip=>chip.addEventListener('click',async()=>{
      quickFilter=chip.dataset.quick;$$('[data-quick]').forEach(c=>c.classList.toggle('active',c===chip));
      if(quickFilter==='legendary'||quickFilter==='mythical')await loadSpeciesFlags();
      renderCatalog();
    }));
    $('#load-more').addEventListener('click',()=>{visibleCount+=24;renderCatalog(false);});
    $('#modal-close').addEventListener('click',closeModal);
    $('#pokemon-modal').addEventListener('click',event=>{if(event.target.id==='pokemon-modal')closeModal();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape')closeModal();if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();$('#search-input').focus();}});
    $('#compare-button').addEventListener('click',comparePokemon);
    $('#pokemon-grid').addEventListener('click',event=>{
      if(event.target.id==='retry-catalog') initCatalog();
    });
  }
  async function initCatalog() {
    const retry=$('#pokemon-grid');
    retry.innerHTML='<div class="loading-state"><div class="pokeball-loader"></div><p>Conectando à PokéAPI...</p></div>';
    $('#results-label').textContent='Carregando catálogo...';
    try {
      const updateCatalogUI = complete => {
        catalog=complete;
        $('#hero-total').textContent=catalog.length.toLocaleString('pt-BR');
        $('#results-label').textContent=catalog.length.toLocaleString('pt-BR')+' Pokémon disponíveis';
        $('#pokemon-options').innerHTML=catalog.map(p=>'<option value="'+p.name+'">#'+pad(p.id)+'</option>').join('');
        if(currentView==='explore') renderCatalog();
        if(currentView==='favorites') renderSaved('favorites');
        if(currentView==='collection') { renderCollection(); renderSaved('collection'); }
      };
      catalog=await PokeAPI.catalog(updateCatalogUI);
      updateCatalogUI(catalog);
      const status=$('.status-text');
      if(status) status.textContent=catalog.length>=1025?'PokéAPI conectada':'Catálogo parcial · completando';
      $('.status-dot')?.classList.remove('offline');
    } catch(error) {
      const status=$('.status-text');
      if(status) status.textContent='PokéAPI indisponível';
      $('.status-dot')?.classList.add('offline');
      retry.innerHTML='<div class="empty-state"><strong>Não foi possível carregar a Pokédex.</strong><br><br>'+error.message+'<br><br><button class="primary-button" id="retry-catalog">Tentar novamente</button></div>';
      $('#results-label').textContent='Falha ao carregar o catálogo';
    }
  }
  async function init() {
    setupEvents();
    updateProgress();
    // O catálogo não depende do carregamento dos filtros de tipo.
    loadTypeFilter();
    initCatalog();
  }
  init();
})();