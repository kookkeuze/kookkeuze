/* browser-fetch.js — externe pagina's ophalen met een echte browser-TLS-hand.

   Waarom dit bestaat: sites achter een bot-filter (Akamai en vergelijkbaar,
   o.a. ah.nl/allerhande en plus.nl) kijken niet alleen naar de User-Agent maar
   ook naar de TLS- en HTTP/2-fingerprint. Node's ingebouwde https-stack stuurt
   zijn cipher-suites en HTTP/2-frames in een andere volgorde dan Chrome, en
   daarop worden we herkend en met 403 "Access Denied" weggestuurd — met élke
   User-Agent, ook die van Googlebot.

   `impit` (github.com/apify/impit) is een Rust/reqwest-gebaseerde client die
   een echte browser-fingerprint nabootst (TLS, HTTP/2, headers) en dat veel
   preciezer doet dan een handmatig samengestelde cipher-lijst. Het pakket
   biedt zelf geen hook om de DNS-resolutie te controleren, en dat is precies
   waarmee we voorkomen dat de server naar localhost of het interne
   Railway-netwerk praat (SSRF). Daarom laten we impit door een kleine lokale
   proxy lopen: die proxy checkt bij élke verbinding — ook na een redirect —
   het daadwerkelijk opgeloste IP-adres tegen de blocklist, en verbindt zelf
   met dat gecontroleerde adres (niet nogmaals via de hostnaam, anders kan een
   aanvaller tussen onze check en de echte verbinding een ander adres laten
   terugkomen — DNS-rebinding). De proxy luistert alleen op 127.0.0.1 en vraagt
   een willekeurig token, dus is hij niet van buiten dit proces te gebruiken.

   De teruggegeven waarde gedraagt zich als een fetch-Response voor het deel
   dat wij gebruiken (ok, status, headers.get, text, arrayBuffer), zodat de
   aanroepende code er niet anders uitziet dan voorheen. */

const crypto = require('crypto');
const dns = require('dns');
const http = require('http');
const net = require('net');
const { Impit } = require('impit');

// Adressen waar we nooit naartoe mogen. De URL's komen van bezoekers, en
// zonder deze blokkade kan iemand de server laten praten met localhost of met
// diensten in het interne Railway-netwerk (SSRF).
const BLOCKED_NETWORKS = new net.BlockList();
[
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['224.0.0.0', 3]
].forEach(([address, prefix]) => BLOCKED_NETWORKS.addSubnet(address, prefix, 'ipv4'));
[
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]
].forEach(([address, prefix]) => BLOCKED_NETWORKS.addSubnet(address, prefix, 'ipv6'));

function isBlockedAddress(address) {
  const ip = String(address || '').replace(/^\[|\]$/g, '');
  // IPv4 verpakt in IPv6 (::ffff:127.0.0.1) als het IPv4-adres beoordelen.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return BLOCKED_NETWORKS.check(mapped[1], 'ipv4');
  const family = net.isIP(ip);
  if (family === 4) return BLOCKED_NETWORKS.check(ip, 'ipv4');
  if (family === 6) return BLOCKED_NETWORKS.check(ip, 'ipv6');
  return true;
}

// Lost een hostnaam op en geeft het eerste toegestane adres terug. Bij een
// kaal IP-adres slaan we de DNS-lookup over. Wordt gebruikt vlak vóór de
// echte TCP-verbinding, zodat er geen tijd zit tussen controle en verbinding
// (anders kan een aanvaller met een korte DNS-TTL na onze check alsnog naar
// een intern adres laten resolven — DNS-rebinding).
function resolveSafeAddress(hostname) {
  const bare = String(hostname || '').replace(/^\[|\]$/g, '');
  const literalFamily = net.isIP(bare);
  if (literalFamily) {
    if (isBlockedAddress(bare)) return Promise.reject(new Error(`Geblokkeerd adres: ${hostname}`));
    return Promise.resolve({ address: bare, family: literalFamily });
  }
  return new Promise((resolve, reject) => {
    dns.lookup(bare, { all: true }, (err, addresses) => {
      if (err) return reject(err);
      const allowed = (addresses || []).find(a => !isBlockedAddress(a.address));
      if (!allowed) return reject(new Error(`Geblokkeerd adres voor ${hostname}`));
      resolve(allowed);
    });
  });
}

function parseHostPort(hostPort, defaultPort) {
  // Ondersteunt "host:port" en IPv6 "[::1]:443".
  const bracketMatch = /^\[([^\]]+)\](?::(\d+))?$/.exec(hostPort);
  if (bracketMatch) {
    return { hostname: bracketMatch[1], port: Number(bracketMatch[2]) || defaultPort };
  }
  const idx = hostPort.lastIndexOf(':');
  if (idx === -1) return { hostname: hostPort, port: defaultPort };
  return { hostname: hostPort.slice(0, idx), port: Number(hostPort.slice(idx + 1)) || defaultPort };
}

/* -------------------- Lokale egress-proxy (SSRF-check) -------------------- */

// Eén willekeurig token per processtart. impit stuurt dit mee als
// Proxy-Authorization; zo kan niets anders op deze machine de proxy als open
// relay gebruiken, ook al luistert hij toevallig op hetzelfde loopback-adres.
const PROXY_TOKEN = crypto.randomBytes(24).toString('hex');

function hasValidProxyAuth(req) {
  const header = req.headers['proxy-authorization'] || '';
  const expected = `Basic ${Buffer.from(`${PROXY_TOKEN}:`).toString('base64')}`;
  return header === expected;
}

async function handleConnect(req, clientSocket, head) {
  clientSocket.on('error', () => {});

  if (!hasValidProxyAuth(req)) {
    clientSocket.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
    return;
  }

  let target;
  try {
    const { hostname, port } = parseHostPort(req.url, 443);
    target = await resolveSafeAddress(hostname);
    target.port = port;
  } catch (_err) {
    clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    return;
  }

  const serverSocket = net.connect(target.port, target.address, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head && head.length) serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });
  serverSocket.on('error', () => clientSocket.destroy());
}

async function handleHttpProxyRequest(req, res) {
  if (!hasValidProxyAuth(req)) {
    res.socket.destroy();
    return;
  }

  let targetUrl;
  let target;
  try {
    targetUrl = new URL(req.url);
    target = await resolveSafeAddress(targetUrl.hostname);
  } catch (_err) {
    // Verbinding hard afbreken i.p.v. een "403"-antwoord sturen: een geldig
    // HTTP-antwoord zou impit laten denken dat dít de reactie van de
    // doelsite was, terwijl we die nooit benaderd hebben. Door de socket te
    // sluiten faalt het verzoek als netwerkfout, hetzelfde gedrag als bij de
    // CONNECT-route (HTTPS) hieronder.
    res.socket.destroy();
    return;
  }

  const forwardedHeaders = { ...req.headers, host: targetUrl.host };
  delete forwardedHeaders['proxy-authorization'];
  delete forwardedHeaders['proxy-connection'];

  const outboundReq = http.request({
    host: target.address,
    port: targetUrl.port || 80,
    method: req.method,
    path: targetUrl.pathname + targetUrl.search,
    headers: forwardedHeaders
  }, outboundRes => {
    res.writeHead(outboundRes.statusCode, outboundRes.headers);
    outboundRes.pipe(res);
  });
  outboundReq.on('error', () => { try { res.writeHead(502).end(); } catch { /* al verzonden */ } });
  req.pipe(outboundReq);
}

let egressProxyPromise = null;
function getEgressProxy() {
  if (!egressProxyPromise) {
    egressProxyPromise = new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        handleHttpProxyRequest(req, res).catch(() => { try { res.writeHead(502).end(); } catch { /* al verzonden */ } });
      });
      server.on('connect', (req, clientSocket, head) => {
        handleConnect(req, clientSocket, head).catch(() => clientSocket.destroy());
      });
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port }));
    });
  }
  return egressProxyPromise;
}

/* -------------------- impit-client -------------------- */

const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 15000;
// Ruime bovengrens: een receptpagina is zelden groter dan een paar honderd kB,
// maar Jumbo zit al rond de 700 kB. Dit is alleen een noodrem tegen een
// eindeloze stream.
const MAX_BODY_BYTES = 12 * 1024 * 1024;

let impitInstancePromise = null;
function getImpitInstance() {
  if (!impitInstancePromise) {
    impitInstancePromise = getEgressProxy().then(({ port }) => new Impit({
      browser: 'chrome',
      // vanillaFallback: als een site de geïmpersoneerde fingerprint niet
      // herkent/ondersteunt, val terug op een gewone client i.p.v. falen.
      vanillaFallback: true,
      followRedirects: true,
      maxRedirects: MAX_REDIRECTS,
      proxyUrl: `http://${PROXY_TOKEN}:@127.0.0.1:${port}`
    }));
  }
  return impitInstancePromise;
}

// Body gedeeltelijk lezen met een harde bovengrens, zodat een kapotte of
// kwaadwillende server ons niet eindeloos data kan laten binnenhalen.
async function readBodyCapped(response, maxBytes) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length) {
        chunks.push(Buffer.from(value));
        total += value.length;
        if (total > maxBytes) {
          try { await reader.cancel(); } catch { /* stream al klaar */ }
          break;
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* al vrijgegeven */ }
  }
  return Buffer.concat(chunks);
}

// Zelfde vorm als een fetch-Response, maar alleen wat wij ervan gebruiken.
function wrapResponse(response, body) {
  return {
    ok: response.ok,
    status: response.status,
    url: response.url,
    headers: {
      get: name => response.headers.get(name)
    },
    // fetch decodeert text() altijd als UTF-8, ongeacht de charset in de
    // header; dat doen we hier dus ook, zodat het gedrag gelijk blijft.
    text: async () => body.toString('utf8'),
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
  };
}

/* Haalt een URL op met de TLS/HTTP2-hand van een browser (via impit).
   options: { headers, timeoutMs, method }. Volgt redirects, pakt compressie
   automatisch uit. */
async function browserFetch(targetUrl, options = {}) {
  const { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS, method = 'GET' } = options;

  const parsed = new URL(String(targetUrl));
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Protocol niet toegestaan: ${parsed.protocol}`);
  }
  // Kaal IP-adres in de URL: snel afwijzen zonder de proxy te belasten. De
  // proxy zelf controleert dit ook nog eens vlak voor de verbinding.
  const literalIp = parsed.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(literalIp) && isBlockedAddress(literalIp)) {
    throw new Error(`Geblokkeerd adres: ${parsed.hostname}`);
  }

  const impit = await getImpitInstance();
  const response = await impit.fetch(targetUrl, { method, headers, timeout: timeoutMs });
  const body = await readBodyCapped(response, MAX_BODY_BYTES);
  return wrapResponse(response, body);
}

module.exports = { browserFetch };
