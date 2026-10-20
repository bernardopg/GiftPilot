# TO-DO

Backlog do GiftPilot. Itens concluídos saem daqui e vão para o [CHANGELOG](CHANGELOG.md).

**Prioridades:** `P1` próximo ciclo · `P2` importante, sem urgência · `P3` ideia para o futuro.
**Formato:** `- [ ] (área) descrição` — áreas: `core`, `content`, `background`, `options`, `ui`, `docs`, `ci`, `qa`.

Última revisão: 2026-10-20 (v3.0.0).

## P1

- [ ] (qa) Teste de integração do fluxo de entrada com fixture de linha travada (`is-locked` + `has-description`) e com a resposta de erro do `ajax.php`.
- [ ] (content) Dividir `js/content/listing.js` (execução do piloto, repetição e comentários) em módulos menores.
- [ ] (background) Dividir `js/background/service-worker.js` em módulos de rotina, estilos, notificações e Steam.
- [ ] (core) Esquema único de configurações com padrões, limites e validação; hoje os limites estão duplicados em `js/options/options.js`.
- [ ] (options) Validação inline ao lado do campo, não só no resumo de erros.
- [ ] (ui) Primeira execução: explicar permissões, riscos e onde fica o painel.
- [ ] (background) Mensagens de erro claras para sessão Steam expirada, perfil privado e permissão negada.
- [ ] (css) Remover de `css/options/night.css` os seletores do site que sobraram da versão antiga (só a página de configurações usa esse arquivo).

## P2

- [ ] (content) Modo simulação: mostrar em quais sorteios o piloto entraria, com o motivo de cada exclusão.
- [ ] (ui) Resumo após a execução: avaliados, ignorados por motivo e pontos gastos.
- [ ] (options) Exportar e importar configurações em JSON.
- [ ] (options) Presets: casual, wishlist primeiro, conservador.
- [ ] (content) Lista de bloqueio e de preferência por jogo e por criador do sorteio.
- [ ] (ui) Revisão de acessibilidade: contraste do tema escuro, foco visível, `aria-live`.
- [ ] (qa) Teste automatizado de carregamento da extensão (Chromium headless com Playwright) cobrindo painel, tema e ausência de canários.
- [ ] (docs) Capturas de tela em inglês para o site.

## P3

- [ ] (core) Avaliar TypeScript (via JSDoc + `checkJs`) começando por `js/core/`.
- [ ] (ui) Histórico local de execuções e erros para diagnóstico.
- [ ] (core) Suporte a Firefox: substituir `offscreen` por um parser alternativo e `service_worker` por `background.scripts`.
- [ ] (docs) Publicar na Chrome Web Store (decisão do mantenedor, considerando as regras do SteamGifts).
