# Documentazione tecnica – Set di ricerca (Tiscali, Messaggero, Clone WP)

Documento per IT: logica dei set speciali (Tiscali, Il Messaggero, Clone WP), ricerche API, export e riferimenti di codice.

---

## 1. Tiscali (notizie.tiscali.it)

- **Dominio in lista:** uno solo (`notizie.tiscali.it`). Una ricerca API (ValueSerp) per articolo.
- **Export:** da ogni risultato si estrae il path sotto `/articoli/...` (suffix). Si generano **N righe** (N = numero di regioni in `TISCALI_REGIONS`), una per regione, con URL:
  `https://notizie.tiscali.it/regioni/{regione}{suffix}`.
- **Obiettivo:** stesso articolo esportato per tutte le regioni Tiscali con URL regionali corretti.

---

## 2. Set Il Messaggero (12 siti)

- **Domini:** gruppo unico di 12 siti (ilmessaggero.it, ilgazzettino.it, ilmattino.it, corriereadriatico.it, quotidianodipuglia.it, leggo.it + le 6 versioni `motori.*`). Gestiti come un unico set per ricerca e export.
- **Ricerca:** se in lista ci sono più domini del set, la lista viene ridotta a **un solo dominio** (il primo) prima delle chiamate API. Quindi **una sola ricerca per articolo** per l’intero set (ValueSerp).
- **Export:** per ogni risultato Messaggero con URL video valido si estrae lo slug (es. `nome-9128431.html`) e si generano **12 righe**, una per sito del set (`MESSAGGERO_BASES`), con URL: `{base_del_sito}/video/{slug}`. Non si aggiunge la riga “originale” del dominio cercato.
- **Normalizzazione domini:** il prefisso `motori.` **non** viene rimosso (es. `motori.ilmessaggero.it` resta distinto da `ilmessaggero.it`).

---

## 3. Set Clone WP (31 siti)

- **Domini:** 31 siti WordPress a contenuto condiviso (magazine-italia.it, forumitalia.info, investimentinews.it, primopiano24.it, notiziedi.it, accadeora.it, ondatazzurra.com, ilgiornaleditorino.it, cronachedimilano.com, gazzettadigenova.it, venezia24.com, cronacheditrentoetrieste.it, ilcorrieredibologna.it, corrierediancona.it, ilcorrieredifirenze.it, notiziarioflegreo.it, cronachediabruzzoemolise.it, cittadi.it, cronachedelmezzogiorno.it, cronachedibari.com, cronachedellacalabria.it, lacittadiroma.it, giovannilucianelli.it, campaniapress.it, corrieredipalermo.it, corrieredellasardegna.it, corriereflegreo.it, cittadinapoli.com, radionapolicentro.it, comunicazionenazionale.it, appianews.it). Gestiti come un unico set.
- **Ricerca:** **nessuna chiamata a ValueSerp/SerpAPI**. Si fa una sola richiesta HTTP al primo sito del set (**magazine-italia.it**) con `/?s=query` (ricerca interna WordPress). Il backend risponde con il primo link trovato nella pagina di ricerca (parsing HTML, es. `<h3 class="entry-title td-module-title"><a href="...">`).
- **Export:** dal risultato si estrae il **path** dell’URL (es. `/titolo-articolo/`). Si generano **31 righe**, una per sito in `CLONE_WP_BASES`, con URL: `{base_sito}{path}`. Non si aggiunge la riga “originale” duplicata.
- **Obiettivo:** una sola ricerca sul sito “sentinella”; stesso path replicato su tutti i 31 siti in export.

---

## Riepilogo comportamenti

| Aspetto            | Tiscali              | Messaggero                                      | Clone WP                                      |
|--------------------|----------------------|--------------------------------------------------|-----------------------------------------------|
| Ricerche API       | 1 per articolo       | 1 per articolo (lista ridotta a 1 se nel set)   | 1 per articolo (solo WP interno, no Serp)    |
| API usate          | ValueSerp            | ValueSerp                                       | Nessuna (fetch diretto `/?s=query`)          |
| Righe in export    | N (regioni)          | 12 (siti del set)                               | 31 (siti del set)                             |
| Logica URL         | suffix su `.../regioni/{regione}` | slug video su `{base_sito}/video/`     | pathname su `{base_sito}`                     |

---

## Riferimenti di codice

### 1. Tiscali — `frontend/src/Search.jsx`

| Righe    | Cosa fanno |
|----------|------------|
| 32-53    | `TISCALI_REGIONS`: elenco regioni per replicare l’articolo in export |
| 154-157  | `extractTiscaliArticoliSuffix(url)`: estrae il path da `/articoli/...` dall’URL |
| 536-548  | In `saveResultsToSupabase`: se dominio = notizie.tiscali.it, aggiunge una riga per ogni regione con URL `.../regioni/{regione}{suffix}` |
| 734-745  | In `downloadXLSX`: stessa logica Tiscali per le righe da esportare in XLSX |

---

### 2. Messaggero — `frontend/src/Search.jsx`

| Righe    | Cosa fanno |
|----------|------------|
| 56-68    | `MESSAGGERO_BASES`: i 12 siti (base URL + nome dominio per export) |
| 70-88    | `MESSAGGERO_DOMAINS`: set domini considerati “Messaggero” |
| 92-99    | `MESSAGGERO_DOMAIN_TO_BASE`: mappa dominio → base URL per riscrivere il link |
| 161-164  | `extractMessaggeroVideoSlug(url)`: estrae lo slug video dall’URL (es. `xxx-9128431.html`) |
| 389-396  | Riduzione lista domini: se ci sono più domini Messaggero o Clone WP, ne resta uno per set; `singleMessaggero`, `singleCloneWp` |
| 437-441  | Dopo ogni risultato API: se dominio Messaggero, riscrive `r.url` con la base corretta (www vs motori) |
| 505-528  | In `saveResultsToSupabase`: se Messaggero con slug, aggiunge solo le 12 righe (niente riga “originale”) |
| 698-721  | In `downloadXLSX`: stessa logica Messaggero per le 12 righe in XLSX |

---

### 3. Clone WP — `frontend/src/Search.jsx`

| Righe    | Cosa fanno |
|----------|------------|
| 103-135  | `CLONE_WP_BASES`: i 31 siti (base URL + nome dominio per export) |
| 136-142  | `CLONE_WP_DOMAINS`: set domini considerati “Clone WP” (derivato da `CLONE_WP_BASES`) |
| 143-146  | `CLONE_WP_FIRST_DOMAIN`: dominio usato per la singola ricerca (magazine-italia.it) |
| 390-396  | Riduzione lista domini: se ci sono domini Clone WP, in lista resta solo `CLONE_WP_FIRST_DOMAIN` |
| 498-519  | In `saveResultsToSupabase`: se Clone WP con URL, estrae `pathname` e aggiunge 31 righe (una per `CLONE_WP_BASES`), niente riga “originale” |
| 691-712  | In `downloadXLSX`: stessa logica Clone WP per le 31 righe in XLSX |

---

### 4. Backend (ricerca WP interna) — `backend/server.js`

| Righe    | Cosa fanno |
|----------|------------|
| 32-78    | `WP_INTERNAL_SEARCH_DOMAINS`: set domini per cui non si usa ValueSerp/SerpAPI (include i 31 clone + cittadino.ca) |
| 80-83    | `isWpInternalDomain(domain)`: true se il dominio è in `WP_INTERNAL_SEARCH_DOMAINS` |
| 127-137  | `extractFirstWpSearchResultLink(html, baseUrl)`: estrae il primo link da pagina di ricerca WP (pattern es. `h3.entry-title > a[href]`) |
| 199-269  | `tryWpDirectUrl(domain, query)`: prova URL diretto e/o `/?s=query`, parsing HTML, ritorna primo link (usato per clone WP e cittadino.ca) |
| 391-402  | In `/api/search`: se `isWpInternalDomain(cleanDomain)` si chiama `tryWpDirectUrl` e non ValueSerp/SerpAPI |

---

*Ultimo aggiornamento: riferimenti di riga coerenti con la codebase attuale.*
