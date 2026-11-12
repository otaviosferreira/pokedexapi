/* Camada de acesso à PokéAPI: cache em memória, controle de concorrência e fallback de imagens. */
const PokeAPI = (() => {
  const BASE = 'https://pokeapi.co/api/v2';
  const cache = new Map();
  const pending = new Map();
  async function request(url) {
    if (cache.has(url)) return cache.get(url);
    if (pending.has(url)) return pending.get(url);

    const task = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: 'application/json' }
        });
        if (!response.ok) {
          throw new Error('PokéAPI respondeu com o status ' + response.status + '.');
        }
        const data = await response.json();
        cache.set(url, data);
        return data;
      } catch (error) {
        if (error.name === 'AbortError') {
          throw new Error('A PokéAPI demorou mais de 9 segundos para responder. Tente novamente.');
        }
        if (error instanceof TypeError) {
          throw new Error('Falha de conexão com a PokéAPI. Verifique sua internet e tente novamente.');
        }
        throw error;
      } finally {
        clearTimeout(timeout);
        pending.delete(url);
      }
    })();

    pending.set(url, task);
    return task;
  }
  async function mapLimit(items, limit, worker) {
    const output = new Array(items.length);
    let cursor = 0;
    const runners = Array.from({length: Math.min(limit, items.length)}, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        try { output[index] = await worker(items[index], index); }
        catch (error) { output[index] = null; }
      }
    });
    await Promise.all(runners);
    return output;
  }
  const artwork = id => 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/' + id + '.png';
  const homeArtwork = id => 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/' + id + '.png';
  const sprite = id => 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/' + id + '.png';
  function imageCandidates(pokemon) {
    const id = pokemon.id;
    const sprites = pokemon.sprites || {};
    return [
      sprites.other?.['official-artwork']?.front_default,
      sprites.other?.home?.front_default,
      sprites.front_default,
      artwork(id), homeArtwork(id), sprite(id)
    ].filter(Boolean);
  }
  const CATALOG_KEY = 'pokedex_catalog_v2';
  const CATALOG_TOTAL = 1025;
  function normalizeCatalog(results) {
    return results.map(item => {
      const id = Number(String(item.url).split('/').filter(Boolean).pop());
      return {id, name:item.name, url:item.url};
    }).filter(item => Number.isInteger(item.id) && item.id >= 1 && item.id <= CATALOG_TOTAL)
      .sort((a,b)=>a.id-b.id);
  }
  function readCatalogCache() {
    try {
      const value = JSON.parse(localStorage.getItem(CATALOG_KEY) || 'null');
      if (Array.isArray(value) && value.length) return value;
    } catch {}
    return null;
  }
  function writeCatalogCache(value) {
    try { localStorage.setItem(CATALOG_KEY, JSON.stringify(value)); } catch {}
  }
  async function catalog(onUpdate) {
    const cached = readCatalogCache();
    if (cached && cached.length >= CATALOG_TOTAL) return cached;

    if (cached && cached.length) {
      // Mostra imediatamente o catálogo salvo e completa os dados em segundo plano.
      refreshCatalog(cached, onUpdate).catch(()=>{});
      return cached;
    }

    // Primeira abertura: mostra a primeira geração assim que a API responder.
    const first = await request(BASE + '/pokemon?limit=151&offset=0');
    const initial = normalizeCatalog(first.results);
    writeCatalogCache(initial);
    refreshCatalog(initial, onUpdate).catch(()=>{});
    return initial;
  }
  async function refreshCatalog(current, onUpdate) {
    const byId = new Map(current.map(item=>[item.id,item]));
    const offsets = [151,401,651,901];
    const pages = await Promise.all(offsets.map(offset=>{
      const limit = Math.min(250, CATALOG_TOTAL-offset);
      return request(BASE + '/pokemon?limit='+limit+'&offset='+offset);
    }));
    pages.forEach(page=>normalizeCatalog(page.results).forEach(item=>byId.set(item.id,item)));
    const complete = [...byId.values()].sort((a,b)=>a.id-b.id);
    writeCatalogCache(complete);
    if (typeof onUpdate === 'function') onUpdate(complete);
    return complete;
  }
  async function pokemon(idOrName) {
    return request(BASE + '/pokemon/' + encodeURIComponent(String(idOrName).toLowerCase()));
  }
  async function species(idOrName) {
    return request(BASE + '/pokemon-species/' + encodeURIComponent(String(idOrName).toLowerCase()));
  }
  async function evolution(urlOrId) {
    const url = String(urlOrId).startsWith('http') ? urlOrId : BASE + '/evolution-chain/' + urlOrId + '/';
    return request(url);
  }
  async function type(name) { return request(BASE + '/type/' + name); }
  async function typeList() { return request(BASE + '/type?limit=30'); }
  async function detailsBatch(ids, limit=8) {
    return mapLimit(ids, limit, item => pokemon(item.id || item));
  }
  function generation(id) {
    const ranges = [[1,151],[152,251],[252,386],[387,493],[494,649],[650,721],[722,809],[810,905],[906,1025]];
    return ranges.findIndex(([min,max]) => id >= min && id <= max) + 1;
  }
  function englishFlavor(speciesData) {
    const entries = (speciesData.flavor_text_entries || []).filter(entry => entry.language?.name === 'en');
    const entry = entries.find(item => item.version?.name === 'sword') || entries[0];
    return entry ? entry.flavor_text.replace(/[\n\f]/g,' ').replace(/\s+/g,' ') : 'Descrição não disponível.';
  }
  return {request,catalog,pokemon,species,evolution,type,typeList,detailsBatch,imageCandidates,artwork,sprite,generation,englishFlavor,mapLimit};
})();