# Boolean Search - Google via ValueSERP

Ricerca booleana automatica su Google usando ValueSERP.

## Setup

### 1. Ottieni ValueSERP Key

1. Vai su [valueserp.com](https://www.valueserp.com/)
2. Registrati
3. Copia la tua API key

### 2. Deploy Backend su Render

1. Push su GitHub
2. Render.com → New Web Service
3. Root Directory: `backend`
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Environment Variable: `VALUESERP_KEY` = your_key

### 3. Deploy Frontend su Render

1. Render.com → New Static Site
2. Root Directory: `frontend`
3. Build Command: `npm install && npm run build`
4. Publish Directory: `dist`
5. Environment Variable: `VITE_API_URL` = backend_url

## Costi

- **ValueSERP Plan**: $56/mese per 25.000 ricerche ✅
- **Per 24.000 richieste/mese**: $56/mese (perfetto!)
- **Render Free**: Hosting gratuito
- **Totale**: $56/mese

## Calcolo richieste

Richieste = Domini × Articoli
Esempio: 80 domini × 10 articoli = 800 richieste/giorno = 24.000/mese

## Vantaggi ValueSERP

- ✅ **Più economico**: $56/mese vs $240-900/mese con altre API
- ✅ **25k incluse**: Copre esattamente il tuo fabbisogno
- ✅ **API JSON pulita**: Nessun parsing HTML
- ✅ **Affidabile**: Specializzato Google
- ✅ **Veloce**: 1-2 secondi per ricerca

## Uso

1. Inserisci domini (uno per riga)
2. Inserisci titoli articoli (uno per riga)
3. Click "Avvia Ricerca"
4. Scarica CSV con i risultati