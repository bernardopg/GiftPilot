<div align="center">

<img src="assets/brand/logo.svg" width="112" height="112" alt="GiftPilot" />

# GiftPilot

**Seu copiloto no SteamGifts.** Tema escuro de verdade, filtros que limpam a lista, chance de vitória em cada sorteio e um piloto automático com ritmo humano.

[![Version](https://img.shields.io/badge/version-3.0.0-6D5BFF)](https://github.com/bernardopg/AutoJoin-for-SteamGifts/releases)
[![CI](https://github.com/bernardopg/AutoJoin-for-SteamGifts/actions/workflows/ci.yml/badge.svg)](https://github.com/bernardopg/AutoJoin-for-SteamGifts/actions/workflows/ci.yml)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-14B8D4)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![License: MIT](https://img.shields.io/badge/license-MIT-22C55E)](LICENSE)

[Site](https://bernardopg.github.io/AutoJoin-for-SteamGifts/) ·
[Instalar](#instalação) ·
[Recursos](#recursos) ·
[Desenvolvimento](#desenvolvimento) ·
[Novidades](CHANGELOG.md) ·
[English](#english)

<img src="docs/assets/screenshot-listing.webp" width="860" alt="Lista de sorteios do SteamGifts com o tema escuro do GiftPilot, chance de vitória em cada linha e o painel no canto inferior direito" />

</div>

---

## Por que GiftPilot

- **Discreto por projeto.** Tudo o que você vê vem de um painel em _shadow root_ fechado. A página não enxerga botões, ids nem classes da extensão, e as requisições têm o mesmo formato das do próprio site.
- **Respeita o seu ritmo.** O piloto automático entra um sorteio por vez, com intervalos irregulares, pausa para "ler" descrições obrigatórias e para no primeiro sinal de que faltam pontos.
- **Bonito sem quebrar o site.** O tema escuro é gerado a partir do CSS oficial do SteamGifts, então cobre a página inteira sem flash branco.
- **Zero dependências em produção.** Só JavaScript, CSS e HTML da própria extensão. Nada de rastreamento, analytics ou servidores de terceiros.

> [!WARNING]
> Entrar em sorteios automaticamente viola as [regras do SteamGifts](https://www.steamgifts.com/about/guidelines) e pode levar à suspensão da conta. O piloto automático vem **desligado** e é opcional. Todo o resto (tema, filtros, chances, rolagem infinita) é uso normal do site.

## Recursos

| Área                     | O que faz                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🌙 **Tema escuro**       | Gerado do CSS oficial; aplicado antes da página pintar, ligado/desligado no painel.                                                                           |
| 📌 **Barra fixa**        | Mantém a navegação do SteamGifts no topo durante a rolagem.                                                                                                   |
| 🎯 **Chance de vitória** | Estimativa por sorteio, projetando as entradas até o fim.                                                                                                     |
| 🧹 **Filtros**           | Oculta por nível, custo, já participados, grupo, whitelist, DLC, sem cartas e jogos que você já tem.                                                          |
| ♾️ **Rolagem infinita**  | Carrega as próximas páginas com todos os recursos aplicados.                                                                                                  |
| 🛩️ **Piloto automático** | Fila sequencial e cancelável, prioridade para wishlist/grupo/região/whitelist, custo mínimo e máximo, descrições obrigatórias tratadas como uma pessoa faria. |
| ⏰ **Segundo plano**     | A cada _N_ horas verifica vitórias, avisa sobre pontos acumulados e, se você quiser, participa respeitando os pontos reservados.                              |
| 🏆 **Vitórias**          | Notificação com som e resgate opcional da chave na Steam.                                                                                                     |
| 🌐 **Idiomas**           | Português (Brasil) e inglês, com detecção automática.                                                                                                         |

<div align="center">
<img src="docs/assets/screenshot-options.webp" width="520" alt="Página de configurações do GiftPilot" />
</div>

## Instalação

GiftPilot funciona em navegadores Chromium (Chrome, Edge, Brave, Opera, Vivaldi) a partir da versão 116.

**Pelo pacote da release**

1. Baixe `giftpilot-vX.Y.Z.zip` na [última release](https://github.com/bernardopg/AutoJoin-for-SteamGifts/releases/latest) e extraia.
2. Abra `chrome://extensions` e ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha a pasta extraída.

**Pelo código-fonte**

```bash
git clone https://github.com/bernardopg/AutoJoin-for-SteamGifts.git
cd AutoJoin-for-SteamGifts
npm ci
npm run build   # gera build/extension
```

Carregue `build/extension` (ou a raiz do repositório, durante o desenvolvimento) em `chrome://extensions`.

## Uso

1. Entre no [SteamGifts](https://www.steamgifts.com) com a sua conta.
2. O painel aparece no canto inferior direito com seus pontos e os atalhos: 🌙 tema, 📌 barra fixa, ⚙️ configurações e − minimizar.
3. Para usar o piloto automático, ative **Mostrar botão Piloto automático** nas configurações. O botão vira **Parar** enquanto roda.
4. Clique no ícone da extensão na barra do navegador para abrir as configurações a qualquer momento.

**Atalhos de teclado** (fora de campos de texto): `Alt+S` configurações · `Alt+T` tema · `Alt+J` / `Alt+K` próximo / anterior sorteio.

### Configurações principais

| Configuração                   | Padrão    | Observação                                         |
| ------------------------------ | --------- | -------------------------------------------------- |
| Tema escuro                    | desligado | Também no botão 🌙 do painel.                      |
| Rolagem infinita               | ligada    |                                                    |
| Chance de vitória              | ligada    |                                                    |
| Botão Piloto automático        | desligado | Opcional; leia o aviso acima.                      |
| Intervalo médio entre entradas | 10 s      | Com variação aleatória e pausas.                   |
| Priorizar wishlist             | ligado    | Requer estar logado na Steam Store.                |
| Ignorar sorteios em destaque   | ligado    |                                                    |
| Piloto em segundo plano        | desligado | Página padrão: wishlist; a cada 5 h.               |
| Pontos para preservar          | 0         | Em segundo plano, nunca gasta abaixo desse número. |

## Privacidade

- Nenhum dado sai do seu navegador para servidores do projeto: não existem servidores do projeto.
- As configurações ficam em `chrome.storage` (sincronizadas pela sua conta do navegador).
- Permissões: `storage`, `alarms`, `notifications`, `tabs`, `scripting`, `offscreen` e `declarativeNetRequest`, mais acesso a `steamgifts.com` e à Steam Store. O acesso a perfis da Steam Community é opcional e pedido só quando necessário.

## Desenvolvimento

Requer Node.js 22, 24 ou 26 (veja `.nvmrc`).

```bash
npm ci
npm run check     # ESLint + Prettier
npm test          # testes unitários (node:test)
npm run verify    # metadados + i18n + testes
npm run build     # check + verify + build/extension
npm run package   # build + dist/giftpilot-vX.Y.Z.zip
npm run release   # alias de package (a release em si é feita pelo CI)
```

Para regenerar o tema escuro depois que o SteamGifts mudar o CSS: salve o novo arquivo em `tests/fixtures/steamgifts/site.css` e rode `node scripts/build-site-dark.mjs`.

### Estrutura

```
manifest.json
_locales/            nome e descrição traduzidos
assets/              logo, ícones e som de vitória
css/
  site/              estilos injetados no SteamGifts (tema, barra fixa, widgets)
  options/           página de configurações
  vendor/            Font Awesome
html/                configurações e documento offscreen
js/
  background/        service worker: rotina, notificações, ponte de requisições
  content/           scripts de página: painel, linhas, rolagem, piloto automático
  core/              módulos puros e compartilhados (parse, plano, i18n, timing…)
  offscreen/         parse de HTML, áudio e resgate de chaves
  options/           lógica da página de configurações
scripts/             build, empacotamento, checagens e gerador do tema
tests/               testes e fixtures do SteamGifts
docs/                site do GitHub Pages
```

Mais detalhes em [AGENTS.md](AGENTS.md) (arquitetura e regras do projeto) e no [guia de contribuição](.github/CONTRIBUTING.md).

## Contribuindo

Issues e pull requests são bem-vindos. Leia o [guia de contribuição](.github/CONTRIBUTING.md) e o [código de conduta](.github/CODE_OF_CONDUCT.md). Vulnerabilidades: siga a [política de segurança](.github/SECURITY.md).

Se o GiftPilot te ajuda, considere [apoiar o projeto](https://github.com/sponsors/bernardopg).

## Licença

[MIT](LICENSE) © 2024-2026 Bernardo Pinto Gomes

---

## English

**GiftPilot** is a Chromium extension (Manifest V3) for [SteamGifts](https://www.steamgifts.com): a full dark theme generated from the site's own CSS, filters, win odds, infinite scrolling, win notifications with optional key redemption and an opt-in, human-paced auto-entry mode. Its UI lives in a closed shadow root and its requests match the site's own, so the page cannot see it.

Install: download the zip from [Releases](https://github.com/bernardopg/AutoJoin-for-SteamGifts/releases/latest), open `chrome://extensions`, enable Developer mode and use **Load unpacked**. Build from source with `npm ci && npm run build`.

Auto-entry is against SteamGifts rules and may get your account suspended; it is off by default. Licensed under [MIT](LICENSE).
