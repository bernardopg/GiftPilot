# Changelog

Todas as mudanças relevantes do GiftPilot ficam registradas aqui.

O formato segue o [Keep a Changelog 1.1.0](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa [Versionamento Semântico](https://semver.org/lang/pt-BR/). Seções possíveis por versão: **Adicionado**, **Alterado**, **Descontinuado**, **Removido**, **Corrigido** e **Segurança**.

## [Não lançado]

## [3.0.0] - 2026-10-20

Nova identidade: o projeto passa a se chamar **GiftPilot**. As configurações salvas são mantidas.

### Adicionado

- Nome, logotipo, ícones e paleta próprios (`assets/brand/`, `assets/icons/`).
- Painel flutuante em _shadow root_ fechado com pontos, nível, botão do piloto automático, status, avisos e notificações (`js/content/panel.js`).
- Piloto automático com fila sequencial e cancelável (o botão vira "Parar"), retomada após o recarregamento do modo "repetir a cada N horas" e espera com recuo em erros de rede.
- Tratamento de sorteios com descrição obrigatória: o site trava o botão de entrada (`is-locked`) até a descrição ser aberta. O piloto abre a descrição nativa, espera um tempo de leitura proporcional ao texto e só depois entra; o segundo plano faz o mesmo com `do=giveaway_description`.
- Ponte de requisições: com uma aba do SteamGifts aberta, o service worker executa as requisições dentro dela e espelha pontos e linhas na aba.
- Tema escuro gerado a partir do CSS oficial do site (`scripts/build-site-dark.mjs` → `css/site/dark.css`, ajustes em `css/site/dark.overrides.css`).
- Clique no ícone da extensão abre as configurações.
- Campos de configuração que existiam sem controle na tela: ignorar whitelist em segundo plano, tempo máximo restante (em horas) e prioridade por nível.
- Links do site, de issues e do changelog na página de configurações.
- Testes de seleção do piloto automático (`tests/autojoin-plan.test.js`) e novas verificações anti-detecção.
- Site no GitHub Pages, `FUNDING.yml`, rotulagem automática de PRs, formulários de issue e `AGENTS.md` para agentes de IA.

### Alterado

- Estrutura de pastas: `js/{background,content,core,offscreen,options}`, `css/{site,options,vendor}`, `assets/`; documentos da comunidade em `.github/`.
- Parser de sorteios reescrito para o HTML atual (links relativos sem barra final, `?utm_source`, cópias e custo por expressão regular, nível pelo `title` decimal) e compartilhado entre página e documento offscreen.
- Uma única rolagem infinita (`js/content/infinite-scroll.js`); as páginas carregadas recebem botões, filtros e chance de vitória.
- Entradas seguem o formato do bundle ativo do site: `FormData` multipart no `bundle-v18` e jQuery urlencoded no `bundle-v19`.
- Tema escuro e barra fixa aplicados pelo service worker com `chrome.scripting.insertCSS`, sem classe no `<body>` e sem flash branco.
- Cache de dados da Steam com validade; DLC e cartas via `appdetails`; comentários enviados como formulário comum.
- Globais internos renomeados de `AutoJoin*` para `GiftPilot*`. As chaves de configuração não mudaram.
- README, guia de contribuição, política de segurança, `TO-DO.md` e este changelog reescritos e padronizados.
- Workflows do GitHub revisados: CI sem a branch inexistente `develop`, release com o nome novo, Dependabot com grupos e rótulos coerentes.

### Removido

- `web_accessible_resources` (permitiam sondar a extensão a partir da página).
- Script do aviso de suspensão, escritas no `localStorage` da página e alteração de `<html lang>`.
- Módulo legado `js/core/giveaway.js`, `css/general.css`, `IMPROVEMENTS.md` e links para a extensão original na página de configurações.

### Corrigido

- Resgate automático de chaves: `res.json()` sem `await`, `winner_id` enviado como o texto literal `'winnerId'` e sessão da Steam ausente.
- Busca de `/giveaways/won` sem cookies; vitórias agora detectadas também pelo contador de ganhos.
- `PointsToPreserve`, `MaxTimeLeftBG` e `MinLevelBG` ignorados em segundo plano; service worker mantido ativo durante a rotina.
- Configurações: listener de restauração duplicado, comparação `this.value === 0` que nunca era verdadeira e campo "repetir a cada" gravado na chave errada (`hoursField` em vez de `RepeatHours`).
- Notificações da página de configurações, que não carregava o módulo de avisos.

### Segurança

- Canário do `bundle-v19.js` neutralizado: o site reporta a conta (`ajax.php`, `do=jh8Dn`) ao encontrar qualquer um de `input#btnAutoJoin`, `#btnSettings` com o texto "AutoJoin Settings", `#ajFooter`, `#navbarPin` ou `#ajFooterArrow`. Nenhum desses marcadores existe mais na página.

## [2.1.0] - 2026-10-15

### Adicionado

- Permissão `declarativeNetRequest` com regras de sessão que reescrevem `Origin` e `Referer` das requisições do service worker para `https://www.steamgifts.com`.

### Alterado

- Classes e globais com assinatura de autojoin (`btnSingle`, `buttonsAJ`, `AutoJoinButtonEnabled`, `pointsFloating`, `aj-*`, `__AJ_*`) renomeados para o prefixo neutro `sgx`.

### Segurança

- `tests/stealth.test.js` passa a varrer content scripts e CSS injetado em busca de marcadores conhecidos.

## [2.0.3] - 2026-10-15

### Adicionado

- `js/core/timing.js`: agendamento com variação não uniforme (ritmo normal, leitura lenta e pausas ocasionais) no lugar do intervalo fixo.

### Alterado

- Requisições de entrada do service worker com `credentials: 'include'`.

### Segurança

- Ids detectados pelo canário do `bundle-v18.js` (`ajFooter`, `navbarPin`, `ajFooterArrow`) renomeados; o site reportava contas via `ajax.php?do=dbb8ff` ao encontrar os três.

## [2.0.2] - 2026-10-15

### Adicionado

- Workflows de CodeQL e de revisão de dependências, `CODEOWNERS`, scripts `lint:fix` e `format:fix`, testes de configurações, regras, metadados e fixtures do SteamGifts.

### Alterado

- Font Awesome 6.0.0 → 7.3.1 (somente `woff2`), ESLint 8 → 10 com _flat config_, Node.js 22/24/26 na matriz de CI.

### Corrigido

- Oito alertas do CodeQL (checagem de host por `includes`, sanitização por regex, injeção de propriedade em `getUrlParams`), vulnerabilidades em dependências de desenvolvimento e o 404 do logotipo nas configurações.

## [2.0.1] e anteriores

Versões publicadas como "AutoJoin for SteamGifts", incluindo a migração para Manifest V3 (2.0.0). O histórico detalhado anterior a 2.0.2 não é verificável no git atual; consulte as [releases](https://github.com/bernardopg/GiftPilot/releases).

[Não lançado]: https://github.com/bernardopg/GiftPilot/compare/v3.0.0...HEAD
[3.0.0]: https://github.com/bernardopg/GiftPilot/compare/v2.1.0...v3.0.0
[2.1.0]: https://github.com/bernardopg/GiftPilot/compare/v2.0.1...v2.1.0
[2.0.3]: https://github.com/bernardopg/GiftPilot/commit/57465c8
[2.0.2]: https://github.com/bernardopg/GiftPilot/commit/e6063d5

[2.0.1] e anteriores: https://github.com/bernardopg/GiftPilot/releases/tag/v2.0.1
