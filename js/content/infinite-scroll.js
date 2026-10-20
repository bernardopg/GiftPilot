/*
  Single infinite-scroll / page loader for SteamGifts listings.

  Both the scroll handler and the "load N pages before AutoJoin" option use
  `loadNext()`, so pages are fetched one at a time, in order, and every row
  appended to the page goes through the registered `onRows` hooks exactly once.
*/
(() => {
  const ROW_SELECTORS = ['.giveaway__row-outer-wrap', '.table__row-outer-wrap'];

  const findNextHref = (root) => {
    const links = root.querySelectorAll('.pagination__navigation a');
    for (const link of links) {
      if (/next/i.test(link.textContent)) return link.getAttribute('href');
    }
    return null;
  };

  const listRows = (root, selector) =>
    [...root.querySelectorAll(selector)].filter(
      (row) => !row.closest('.pinned-giveaways__inner-wrap'),
    );

  function createScroller({ t = (key) => key, onRows = [] } = {}) {
    const request = globalThis.GiftPilotRequest;
    const selector = ROW_SELECTORS.find(
      (sel) => listRows(document, sel).length,
    );
    if (!selector) return null;

    const firstRow = listRows(document, selector)[0];
    const container = firstRow.parentElement;
    let nextHref = findNextHref(document);
    let loading = null;
    let pagesLoaded = 1;
    const hooks = [...onRows];

    const pagination = document.querySelector('.pagination');
    const setPaginationText = (text) => {
      if (!pagination) return;
      const note = document.createElement('div');
      note.className = 'sgx-page-note';
      note.textContent = text;
      pagination.replaceChildren(note);
    };

    async function loadNext() {
      if (loading) return loading;
      if (!nextHref) return false;
      loading = (async () => {
        const href = nextHref;
        setPaginationText(t('page.infinite.loadingMore'));
        try {
          const html = await request.getHtml(href);
          const dom = new DOMParser().parseFromString(html, 'text/html');
          const rows = listRows(dom, selector).map((row) =>
            document.importNode(row, true),
          );
          nextHref = findNextHref(dom);
          pagesLoaded += 1;
          if (rows.length) {
            const separator = document.createElement('div');
            separator.className = 'sgx-page-note';
            const page = new URL(href, location.origin).searchParams.get(
              'page',
            );
            separator.textContent = t('page.infinite.page', {
              page: page || pagesLoaded,
            });
            container.append(separator, ...rows);
            hooks.forEach((hook) => {
              try {
                hook(rows);
              } catch (error) {
                console.error('Row hook failed:', error);
              }
            });
          } else {
            nextHref = null;
          }
          setPaginationText(nextHref ? '' : t('page.infinite.end'));
          return rows.length > 0;
        } catch (error) {
          console.error('Error loading next page:', error);
          setPaginationText(t('page.infinite.loadMoreError'));
          return false;
        } finally {
          loading = null;
        }
      })();
      return loading;
    }

    function enableAutoLoad() {
      if (!nextHref) return;
      let ticking = false;
      const check = () => {
        ticking = false;
        const doc = document.documentElement;
        if (window.scrollY + window.innerHeight > doc.scrollHeight - 900) {
          loadNext();
        }
      };
      window.addEventListener(
        'scroll',
        () => {
          if (!ticking) {
            ticking = true;
            setTimeout(check, 150);
          }
        },
        { passive: true },
      );
    }

    return {
      loadNext,
      enableAutoLoad,
      onRows(hook) {
        hooks.push(hook);
      },
      get hasNext() {
        return Boolean(nextHref);
      },
      get pagesLoaded() {
        return pagesLoaded;
      },
      container,
    };
  }

  let scroller;
  globalThis.GiftPilotScroller = {
    get(options) {
      if (scroller === undefined) scroller = createScroller(options);
      return scroller;
    },
  };
})();
