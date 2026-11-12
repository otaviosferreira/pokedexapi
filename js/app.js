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
    const isFav=favorites.has(entry.id),isCaught=caught.has(entry.id);
    const types=(entry.types||[]).map(typePill).join('');
    return '<article class="pokemon-card" data-id="'+entry.id+'" tabindex="0" role="button" aria-label="Ver '+entry.name+'">'+
      '<div class="card-top"><span class="pokemon-number">#'+pad(entry.id)+'</span><div class="card-actions">'+
      '<button class="icon-action favorite '+(isFav?'active':'')+'" data-action="favorite" data-id="'+entry.id+'" aria-label="Favoritar">'+(isFav?'♥':'♡')+'</button>'+
      '<button class="icon-action caught '+(isCaught?'active':'')+'" data-action="caught" data-id="'+entry.id+'" aria-label="Marcar capturado">'+(isCaught?'✓':'＋')+'</button></div></div>'+
      '<div class="pokemon-art" style="--type-bg:'+typeColor(entry.types?.[0])+'"><img loading="lazy" src="'+PokeAPI.artwork(entry.id)+'" alt="'+entry.name+'" data-fallback="'+imageFallback(entry.id)+'"></div>'+
      '<h3>'+entry.name+'</h3><div class="card-bottom"><div class="card-types">'+types+'</div><span class="card-open">Detalhes ↗</span></div></article>';
  }
  function attachCardEvents(container) {
    container.querySelectorAll('.pokemon-card').forEach(card=>{
      const open=()=>openPokemon(Number(card.dataset.id));
      card.addEventListener('click',event=>{if(!event.target.closest('[data-action]'))open();});
      card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});
    });
    container.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',event=>{
      event.stopPropagation();
      const id=Number(button.dataset.id),set=button.dataset.action==='favorite'?favorites:caught;
      set.has(id)?set.delete(id):set.add(id);
      save();
      if(currentView==='explore'&&((button.dataset.action==='favorite'&&quickFilter==='favorites')||(button.dataset.action==='caught'&&quickFilter==='caught'))){renderCatalog();return;}
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
    const list=catalog.filter(entry=>{
      if(gen!=='all'&&entry.generation!==Number(gen))return false;
      if(term&&!entry.name.includes(term)&&!String(entry.id).includes(term)&&!pad(entry.id).includes(term))return false;
      if(quickFilter==='favorites'&&!favorites.has(entry.id))return false;
      if(quickFilter==='caught'&&!caught.has(entry.id))return false;
      if(type!=='all'&&!(entry.types||[]).includes(type))return false;
      if(quickFilter==='legendary'&&!entry.legendary)return false;
      if(quickFilter==='mythical'&&!entry.mythical)return false;
      return true;
    });
    if(sort==='id-desc')list.sort((a,b)=>b.id-a.id);
    if(sort==='name-asc')list.sort((a,b)=>a.name.localeCompare(b.name));
    if(sort==='name-desc')list.sort((a,b)=>b.name.localeCompare(a.name));
    if(sort==='height')list.sort((a,b)=>(b.height||0)-(a.height||0));
    if(sort==='weight')list.sort((a,b)=>(b.weight||0)-(a.weight||0));
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
  function loadTypeFilter() {
    const select=$('#type-filter');
    select.innerHTML='<option value="all">Todos os tipos</option>'+TYPE_NAMES.map(type=>
      '<option value="'+type+'">'+(TYPE_LABELS[type]||titleCase(type))+'</option>'
    ).join('');
    $('#type-legend').innerHTML=TYPE_NAMES.map(type=>typePill(type)).join('');
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
    const entry=catalog.find(item=>item.id===id);
    if(!entry){toast('Pokémon não encontrado no catálogo.');return;}
    activeModalId=id;
    const modal=$('#pokemon-modal');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');

    const statLabels={'hp':'HP','attack':'Ataque','defense':'Defesa','special-attack':'Ataque especial','special-defense':'Defesa especial','speed':'Velocidade'};
    const types=(entry.types||[]).map(typePill).join('');
    const stats=(entry.stats||[]).map(stat=>({name:stat.name,value:stat.value}));
    const total=stats.reduce((sum,item)=>sum+item.value,0);
    const abilities=(entry.abilities||[]).map(item=>'<span class="ability-tag">'+item.name.replaceAll('-',' ')+(item.hidden?' · Oculta':'')+'</span>').join('');
    const image=PokeAPI.artwork(id);

    // A ficha principal é montada com dados locais; a conexão remota só complementa a descrição/evolução.
    $('#modal-content').innerHTML=
      '<div class="modal-hero"><div class="modal-art"><img src="'+image+'" alt="'+entry.name+'"></div>'+
      '<div class="modal-title"><small>#'+pad(id)+' · Geração '+entry.generation+'</small><h2 id="modal-name">'+entry.name.replaceAll('-',' ')+'</h2>'+
      '<div class="card-types">'+types+'</div><p id="modal-description">Dados básicos carregados do catálogo local. Buscando descrição complementar...</p>'+
      '<div class="modal-meta"><span>↕ '+entry.height+' m</span><span>◈ '+entry.weight+' kg</span><span>XP base: '+(entry.baseExperience??'—')+'</span></div>'+
      '<div class="card-actions" style="margin-top:15px"><button class="icon-action favorite '+(favorites.has(id)?'active':'')+'" id="modal-favorite">'+(favorites.has(id)?'♥':'♡')+'</button>'+
      '<button class="icon-action caught '+(caught.has(id)?'active':'')+'" id="modal-caught">'+(caught.has(id)?'✓':'＋')+'</button></div></div></div>'+
      '<div class="modal-section"><h3>Atributos base · Total '+total+'</h3>'+
      stats.map(stat=>'<div class="stat-line"><span>'+(statLabels[stat.name]||stat.name)+'</span><div class="progress-track"><i style="width:'+Math.min(stat.value/255*100,100)+'%;background:'+(stat.value>=100?'#42bd83':'#ef7770')+'"></i></div><strong>'+stat.value+'</strong></div>').join('')+
      '</div><div class="modal-section"><h3>Habilidades</h3><div class="ability-list">'+(abilities||'<span class="muted">Não disponível no catálogo local.</span>')+'</div></div>'+
      '<div class="modal-section"><h3>Formas e variações</h3><div id="modal-forms"><span class="muted">Carregando formas alternativas...</span></div></div>'+
      '<div class="modal-section"><h3>Linha evolutiva</h3><div id="modal-evolution"><span class="muted">Carregando linha evolutiva...</span></div></div>'+
      '<div class="modal-section"><h3>Informações da espécie</h3><div id="modal-species-info" class="modal-meta"><span>Geração: '+entry.generation+'</span><span>Classificação: '+(entry.legendary?'Lendário':entry.mythical?'Mítico':'Comum')+'</span></div></div>';

    $('#modal-favorite').addEventListener('click',()=>{
      toggleSet(favorites,id,STORAGE.favorites);
      $('#modal-favorite').classList.toggle('active',favorites.has(id));
      $('#modal-favorite').textContent=favorites.has(id)?'♥':'♡';
    });
    $('#modal-caught').addEventListener('click',()=>{
      toggleSet(caught,id,STORAGE.caught);
      $('#modal-caught').classList.toggle('active',caught.has(id));
      $('#modal-caught').textContent=caught.has(id)?'✓':'＋';
    });

    try {
      const species=await getSpecies(id);
      if(activeModalId!==id)return;
      const flavor=species.flavor_text_entries?.find(item=>item.language?.name==='pt')?.flavor_text
        ||species.flavor_text_entries?.find(item=>item.language?.name==='en')?.flavor_text;
      if(flavor)$('#modal-description').textContent=flavor.replace(/[\n\f]/g,' ').replace(/\s+/g,' ');
      const genus=species.genera?.find(item=>item.language?.name==='en')?.genus;
      if(genus)$('#modal-name').textContent=entry.name.replaceAll('-',' ')+' · '+genus;
      const forms=(species.varieties||[]).filter(item=>item.pokemon?.name);
      $('#modal-forms').innerHTML=forms.length>1?
        '<div class="form-switches">'+forms.map(item=>'<button data-form="'+item.pokemon.name+'" class="'+(item.pokemon.name===entry.name?'active':'')+'">'+(item.pokemon.name.replace(entry.name,'').replace(/^-/,'')||'Normal')+'</button>').join('')+'</div>':
        '<span class="muted">Esta espécie não possui outras formas cadastradas.</span>';
      $('#modal-content').querySelectorAll('[data-form]').forEach(button=>button.addEventListener('click',async()=>{
        try {
          const form=await PokeAPI.pokemon(button.dataset.form);
          if(activeModalId!==id)return;
          const formImage=form.sprites.other?.['official-artwork']?.front_default||form.sprites.front_default||image;
          $('#modal-content .modal-art img').src=formImage;
          $('#modal-content .modal-title h2').textContent=form.name.replaceAll('-',' ');
          $('#modal-content .modal-title .card-types').innerHTML=form.types.map(item=>typePill(item.type.name)).join('');
          $('#modal-content [data-form].active')?.classList.remove('active');
          button.classList.add('active');
        } catch {toast('Não foi possível carregar essa forma alternativa.');}
      }));

      if(species.evolution_chain?.url) {
        try {
          const evolutionData=await PokeAPI.evolution(species.evolution_chain.url);
          if(activeModalId!==id)return;
          const chain=flattenEvolution(evolutionData.chain);
          $('#modal-evolution').innerHTML='<div class="evolution-chain">'+chain.map((item,index)=>
            '<div class="evolution-node" data-evo="'+item.id+'"><img loading="lazy" src="'+PokeAPI.artwork(item.id)+'" alt="'+item.name+'"><strong>'+item.name+'</strong><small>#'+pad(item.id)+'</small></div>'+
            (index<chain.length-1?'<span class="evolution-arrow">→</span>':'')
          ).join('')+'</div><p class="muted">'+chain.slice(1).map(item=>item.name+': '+evolutionCondition(item.details)).join(' | ')+'</p>';
          $('#modal-content').querySelectorAll('[data-evo]').forEach(node=>node.addEventListener('click',()=>openPokemon(Number(node.dataset.evo))));
        } catch {$('#modal-evolution').textContent='Linha evolutiva indisponível no momento.';}
      } else {
        $('#modal-evolution').textContent='Linha evolutiva não cadastrada.';
      }

      const color=species.color?.name||'—';
      $('#modal-species-info').innerHTML='<span>Geração: '+entry.generation+'</span><span>Cor: '+color+'</span>'+
        '<span>Captura: '+species.capture_rate+'/255</span><span>Felicidade base: '+species.base_happiness+'</span>'+
        '<span>'+(species.is_legendary?'Lendário':species.is_mythical?'Mítico':'Comum')+'</span>';
    } catch {
      if(activeModalId!==id)return;
      $('#modal-description').textContent='Descrição complementar indisponível; os dados básicos desta ficha continuam disponíveis.';
      $('#modal-forms').textContent='Não foi possível carregar as formas alternativas.';
      $('#modal-evolution').textContent='Não foi possível carregar a linha evolutiva.';
    }
  }
  function toggleSet(set,id,key){set.has(id)?set.delete(id):set.add(id);save();if(currentView==='favorites')renderSaved('favorites');if(currentView==='collection')renderSaved('collection');}
  function closeModal(){ $('#pokemon-modal').classList.remove('open');$('#pokemon-modal').setAttribute('aria-hidden','true');activeModalId=null; }
  async function resolveCompare(value) {
    const input=value.trim().toLowerCase();
    if(!input)return null;
    return /^\d+$/.test(input)?catalog[Number(input)-1]||null:catalog.find(item=>item.name===input)||null;
  }
  async function comparePokemon() {
    const result=$('#compare-result');
    try {
      const [a,b]=await Promise.all([resolveCompare($('#compare-one').value),resolveCompare($('#compare-two').value)]);
      if(!a||!b)throw new Error('Informe dois Pokémon válidos pelo nome ou número da Pokédex.');
      const maxStats=a.stats.map((stat,index)=>Math.max(stat.value,b.stats[index].value));
      const make=p=>'<article class="compare-pokemon"><img src="'+PokeAPI.artwork(p.id)+'" alt="'+p.name+'"><small>#'+pad(p.id)+'</small><h3>'+p.name.replaceAll('-',' ')+'</h3>'+
        '<div class="card-types">'+p.types.map(typePill).join('')+'</div><p class="muted">'+p.height+' m · '+p.weight+' kg</p>'+
        p.stats.map((stat,index)=>'<div class="compare-stat"><span>'+stat.name.replace('special-','Sp. ')+'</span><div class="progress-track"><i style="display:block;width:'+(stat.value/255*100)+'%;height:100%;background:'+(stat.value===maxStats[index]?'#42bd83':'#ef7770')+';border-radius:20px"></i></div><b>'+stat.value+'</b></div>').join('')+
        '<strong>Total: '+p.stats.reduce((sum,stat)=>sum+stat.value,0)+'</strong></article>';
      result.innerHTML='<div class="compare-columns">'+make(a)+make(b)+'</div>';
    } catch(error) {result.innerHTML='<div class="empty-state">'+error.message+'</div>';}
  }
  async function renderStatistics() {
    if(!catalog.length) {
      $('#generation-chart').innerHTML='<p class="muted">Carregando catálogo...</p>';
      $('#type-chart').innerHTML='';
      return;
    }
    const ranges=[[1,151],[152,251],[252,386],[387,493],[494,649],[650,721],[722,809],[810,905],[906,1025]];
    $('#generation-chart').innerHTML=ranges.map((range,index)=>{
      const count=catalog.filter(item=>item.generation===index+1).length;
      return '<div class="bar-row"><span>'+GEN_NAMES[index]+'</span><div class="progress-track"><i style="display:block;width:'+(count/151*100)+'%;height:100%;background:#ef7770;border-radius:20px"></i></div><b>'+count+'</b></div>';
    }).join('');
    const typeCounts=TYPE_NAMES.map(type=>({type,count:catalog.filter(item=>(item.types||[]).includes(type)).length}));
    $('#type-chart').innerHTML=typeCounts.map(item=>'<div class="type-stat">'+typePill(item.type)+' <strong>'+item.count+'</strong></div>').join('');
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
    $('#sort-filter').addEventListener('change',()=>renderCatalog());
    $('#type-filter').addEventListener('change',()=>renderCatalog());
    $('#reset-filters').addEventListener('click',()=>{$('#search-input').value='';$('#generation-filter').value='all';$('#type-filter').value='all';$('#sort-filter').value='id-asc';quickFilter='all';$$('[data-quick]').forEach(c=>c.classList.toggle('active',c.dataset.quick==='all'));renderCatalog();});
    $$('[data-quick]').forEach(chip=>chip.addEventListener('click',()=>{
      quickFilter=chip.dataset.quick;
      $$('[data-quick]').forEach(c=>c.classList.toggle('active',c===chip));
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
      if(status) status.textContent=catalog.length===1025?'Catálogo local pronto':'Catálogo parcial';
      $('.status-dot')?.classList.remove('offline');
    } catch(error) {
      const status=$('.status-text');
      if(status) status.textContent='Catálogo indisponível';
      $('.status-dot')?.classList.add('offline');
      retry.innerHTML='<div class="empty-state"><strong>Não foi possível carregar a Pokédex.</strong><br><br>'+error.message+'<br><br><button class="primary-button" id="retry-catalog">Tentar novamente</button></div>';
      $('#results-label').textContent='Falha ao carregar o catálogo';
    }
  }
  async function init() {
    setupEvents();
    updateProgress();
    // Acorda o serviço Render em segundo plano; o catálogo local não espera por ele.
    PokeAPI.warmup();
    loadTypeFilter();
    initCatalog();
  }
  init();
})();