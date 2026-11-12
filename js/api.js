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
      const timeout = setTimeout(() => controller.abort(), 12000);
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
          throw new Error('A PokéAPI demorou mais de 12 segundos para responder. Tente novamente.');
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
  async function catalog() {
    // O catálogo principal é um arquivo estático do próprio projeto: não depende da API externa.
    try {
      const response = await fetch('data/pokemon.json', {cache:'force-cache'});
      if (!response.ok) throw new Error('Não foi possível carregar o catálogo local.');
      const records = await response.json();
      if (!Array.isArray(records) || records.length !== 1025) {
        throw new Error('O catálogo local está incompleto.');
      }
      return records.map(item => ({
        ...item,
        url: BASE + '/pokemon/' + item.id + '/'
      }));
    } catch (localError) {
      // Fallback para a PokéAPI caso o arquivo estático não esteja disponível.
      const data = await request(BASE + '/pokemon?limit=1025&offset=0');
      return data.results.map((item, index) => ({
        id:index+1, name:item.name, url:item.url, generation:generation(index+1),
        height:0, weight:0, types:[], legendary:false, mythical:false,
        stats:[], abilities:[]
      }));
    }
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