# Contribuindo com o GiftPilot

Obrigado por ajudar! Este guia cobre o essencial; as regras técnicas completas estão no [AGENTS.md](../AGENTS.md).

## Antes de começar

- Procure uma [issue](https://github.com/bernardopg/AutoJoin-for-SteamGifts/issues) existente ou abra uma descrevendo o problema ou a ideia.
- Para vulnerabilidades, **não** abra issue pública: siga a [política de segurança](SECURITY.md).
- Ao participar você concorda com o [código de conduta](CODE_OF_CONDUCT.md).

## Ambiente

```bash
git clone https://github.com/bernardopg/AutoJoin-for-SteamGifts.git
cd AutoJoin-for-SteamGifts
nvm use        # Node.js 24 (22 e 26 também são suportados)
npm ci
```

Carregue a raiz do repositório em `chrome://extensions` → **Carregar sem compactação**. Depois de editar, recarregue a extensão e a aba do SteamGifts.

## Fluxo

1. Crie uma branch a partir de `main`: `feat/…`, `fix/…`, `docs/…`.
2. Faça a mudança com testes quando houver lógica nova em `js/core/`.
3. Rode `npm run check && npm test` (ou `npm run build`, que roda tudo).
4. Atualize `CHANGELOG.md` em **[Não lançado]** quando a mudança for visível ao usuário.
5. Abra o PR preenchendo o template. Os rótulos são aplicados automaticamente.

## Regras que não podem quebrar

- Nenhuma interface da extensão no DOM visível da página: use o painel em `js/content/panel.js`.
- Nenhum `id`/classe com cara de autojoin, nenhum `web_accessible_resources`, nenhuma escrita no `localStorage` da página.
- Requisições ao SteamGifts sempre via `js/core/sg-request.js` ou pelos botões nativos do site.
- Todo texto visível passa por `js/core/i18n.js`, em `en` e `pt-BR`.
- Mudanças em `permissions` exigem aprovação do mantenedor.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/): `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `ci:`. Exemplo: `fix(content): espera o desbloqueio da descrição antes de entrar`.
