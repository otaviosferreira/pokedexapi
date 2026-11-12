# Pokédex

Pokédex responsiva desenvolvida com **HTML5, CSS3 e JavaScript puro**, consumindo dados reais da [PokéAPI](https://pokeapi.co/).

## Funcionalidades

- Catálogo local com 1.025 espécies das nove gerações, tipos, atributos base, altura, peso, habilidades e classificação de lendários/míticos; imagens oficiais e fallback para sprites.
- Carregamento progressivo em páginas de 24 Pokémon.
- Pesquisa por nome e número, filtro por geração e tipo e ordenação por número, nome, altura e peso, sem chamadas de API para essas operações.
- Filtros rápidos para favoritos, capturados, lendários e míticos.
- Ficha individual com tipos, descrição, atributos base, habilidades, dados da espécie, formas disponíveis e cadeia evolutiva.
- Comparador de atributos de dois Pokémon usando dados locais.
- Favoritos, coleção e tema claro/escuro persistidos em LocalStorage.
- Progresso da coleção por geração e estatísticas gerais.
- Layout adaptável a computadores, tablets e celulares.

## Arquitetura de hospedagem

O projeto usa duas plataformas com responsabilidades separadas:

- **Vercel:** publica o frontend estático (HTML, CSS, JavaScript) e o catálogo local.
- **Render:** executa a API intermediária em `backend/`, que consulta a PokéAPI e mantém cache em memória para fichas, espécies e cadeias evolutivas.

### Endpoints do Render

- `GET /health` — estado do serviço e quantidade de itens em cache.
- `GET /api/v2/pokemon/:id-ou-nome` — detalhes de um Pokémon ou forma.
- `GET /api/v2/pokemon-species/:id-ou-nome` — descrição e dados da espécie.
- `GET /api/v2/evolution-chain/:id` — cadeia evolutiva.

O catálogo, a busca, os filtros, as estatísticas, a coleção e o comparador usam `data/pokemon.json`, então continuam funcionando sem esperar pela PokéAPI. Para os detalhes complementares, o frontend tenta o Render e usa a PokéAPI diretamente como alternativa quando o serviço intermediário está iniciando ou indisponível.

O serviço Render está conectado à branch `main` com deploy automático. O frontend permanece publicado pela Vercel.

**Observação sobre o plano gratuito do Render:** serviços web gratuitos entram em suspensão depois de 15 minutos sem tráfego e podem levar cerca de um minuto para voltar. Isso afeta a primeira consulta complementar após inatividade, mas não bloqueia o catálogo local. Consulte [as limitações oficiais do Render](https://render.com/docs/free).

## Estrutura

```text
pokedexapi/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── api.js
│   └── app.js
└── README.md
```

## Executar localmente

Como o projeto usa apenas arquivos estáticos, basta abrir com um servidor local (recomendado para evitar restrições do navegador):

1. Clone o repositório.
2. Abra a pasta no VS Code.
3. Inicie um servidor estático, por exemplo a extensão Live Server.
4. Acesse o endereço local informado pelo servidor.

Não é necessário instalar dependências, configurar banco de dados ou iniciar backend.

## Publicar no GitHub Pages

1. Acesse **Settings → Pages** no repositório.
2. Em **Build and deployment**, selecione **Deploy from a branch**.
3. Escolha a branch **main** e a pasta **/(root)**.
4. Salve e aguarde a publicação.
5. O endereço ficará no formato `https://otaviosferreira.github.io/pokedexapi/`.

Também pode ser publicado na Vercel como projeto estático, sem comando de build e sem diretório de saída personalizado.

## Dados e imagens

Os dados são consultados sob demanda na PokéAPI. O catálogo inicial solicita somente a lista de espécies; detalhes dos cards são carregados quando entram na área visível e as fichas completas são consultadas ao abrir cada Pokémon. As imagens priorizam o official artwork e usam sprites como alternativa.

Favoritos, capturas e preferência de tema ficam no armazenamento local do navegador. Esses dados não são sincronizados entre dispositivos.

## Observações

- A PokéAPI é um serviço externo: a primeira visita depende de conexão com a internet e da disponibilidade da API.
- A classificação de lendários e míticos consulta os dados de espécie quando um desses filtros é selecionado e pode levar algum tempo na primeira execução.
- A PokéAPI não oferece artwork oficial para todas as variações; nesses casos a aplicação tenta usar outras imagens disponíveis.
- Estatísticas por tipo mostram os tipos existentes na PokéAPI; o total por tipo não é pré-calculado para evitar centenas de requisições no carregamento inicial.

## Tecnologias

HTML5 · CSS3 · JavaScript Vanilla · Fetch API · LocalStorage · PokéAPI
