/* browser-fetch.js — externe pagina's ophalen met een browser-achtige TLS-hand.

   Waarom dit bestaat: sites achter een bot-filter (Akamai en vergelijkbaar,
   o.a. ah.nl/allerhande en plus.nl) kijken niet alleen naar de User-Agent maar
   ook naar de TLS-handshake. Node stuurt zijn cipher-suites in een andere
   volgorde dan Chrome, en daarop worden we herkend en met 403 "Access Denied"
   weggestuurd — met élke User-Agent, ook die van Googlebot, en ook via de
   reader-proxy. Zetten we de cipher-volgorde van Chrome, dan komt dezelfde
   pagina gewoon binnen.

   Node's ingebouwde fetch() laat de TLS-instellingen niet zetten, vandaar dat
   dit met https.request werkt. De teruggegeven waarde gedraagt zich als een
   fetch-Response voor het deel dat wij gebruiken (ok, status, headers.get,
   text, arrayBuffer), zodat de aanroepende code er niet anders uitziet. */

const http = require('http');
const https = require('https');
const zlib = require('zlib');

// De cipher-volgorde zoals Chrome die aanbiedt. Alle moderne servers
// ondersteunen hieruit iets, dus dit kost geen bereik — het is puur de
// volgorde die ons als browser laat doorgaan.
const BROWSER_CIPHERS = [
  'TLS_AES_128_GCM_SHA256',
  'TLS_AES_256_GCM_SHA384',
  'TLS_CHACHA20_POLY1305_SHA256',
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-RSA-CHACHA20-POLY1305',
  'ECDHE-RSA-AES128-SHA',
  'ECDHE-RSA-AES256-SHA',
  'AES128-GCM-SHA256',
  'AES256-GCM-SHA384',
  'AES128-SHA',
  'AES256-SHA'
].join(':');

// Eén agent voor alle verzoeken, zodat een tweede pagina van dezelfde site de
// TLS-handshake niet hoeft over te doen. Vooral de crawler scheelt dat tijd.
// De cipher-volgorde hoort op de agent: die maakt de verbinding.
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 8,
  ciphers: BROWSER_CIPHERS,
  minVersion: 'TLSv1.2',
  ecdhCurve: 'X25519:P-256:P-384'
});

const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 15000;
// Ruime bovengrens: een receptpagina is zelden groter dan een paar honderd kB,
// maar Jumbo zit al rond de 700 kB. Dit is alleen een noodrem tegen een
// eindeloze stream.
const MAX_BODY_BYTES = 12 * 1024 * 1024;

function decompress(buffer, encoding) {
  const type = String(encoding || '').toLowerCase().trim();
  try {
    if (type === 'gzip' || type === 'x-gzip') return zlib.gunzipSync(buffer);
    if (type === 'deflate') return zlib.inflateSync(buffer);
    if (type === 'br') return zlib.brotliDecompressSync(buffer);
    if (type === 'zstd' && typeof zlib.zstdDecompressSync === 'function') {
      return zlib.zstdDecompressSync(buffer);
    }
  } catch (_err) {
    // Onleesbaar gecomprimeerd antwoord: geef de ruwe bytes terug, dan
    // stranden we hooguit op "geen recept gevonden" in plaats van op een crash.
  }
  return buffer;
}

// Zelfde vorm als een fetch-Response, maar alleen wat wij ervan gebruiken.
function makeResponse({ status, headers, body, url }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: {
      get: name => headers[String(name).toLowerCase()] ?? null
    },
    // fetch decodeert text() altijd als UTF-8, ongeacht de charset in de
    // header; dat doen we hier dus ook, zodat het gedrag gelijk blijft.
    text: async () => body.toString('utf8'),
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
  };
}

function requestOnce(targetUrl, { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS, method = 'GET' }) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (err) {
      return reject(err);
    }

    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;

    const options = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        Host: parsed.host,
        // Zonder deze regel stuurt de server ongecomprimeerd; met deze regel
        // moeten we zelf uitpakken (zie decompress hierboven).
        'Accept-Encoding': 'gzip, deflate, br',
        ...headers
      },
      timeout: timeoutMs
    };

    if (isHttps) options.agent = httpsAgent;

    const req = transport.request(options, res => {
      const chunks = [];
      let total = 0;
      res.on('data', chunk => {
        total += chunk.length;
        if (total > MAX_BODY_BYTES) {
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          location: res.headers.location,
          body: decompress(raw, res.headers['content-encoding'])
        });
      });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`Timeout na ${timeoutMs} ms`));
    });
    req.end();
  });
}

/* Haalt een URL op met de TLS-hand van een browser.
   options: { headers, timeoutMs, method }. Volgt redirects, pakt gzip/brotli
   uit. Alleen GET en HEAD; meer heeft deze app niet nodig. */
async function browserFetch(targetUrl, options = {}) {
  let currentUrl = String(targetUrl);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const result = await requestOnce(currentUrl, options);
    const isRedirect = [301, 302, 303, 307, 308].includes(result.status) && result.location;

    if (!isRedirect) {
      return makeResponse({
        status: result.status,
        headers: result.headers,
        body: result.body,
        url: currentUrl
      });
    }

    // Location mag relatief zijn ("/recept/123"), dus altijd oplossen tegen de
    // URL waar we vandaan komen.
    currentUrl = new URL(result.location, currentUrl).toString();
  }

  throw new Error(`Te veel redirects voor ${targetUrl}`);
}

module.exports = { browserFetch, BROWSER_CIPHERS };
