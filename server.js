import http from 'node:http';
import net from 'node:net';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const root = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'marantz-deck', 'config.json');
let host = process.env.MARANTZ_HOST || null;
const listenHost = '127.0.0.1';
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be an integer from 1024 to 65535');

export function validateHost(value) {
  if (typeof value !== 'string' || value.length > 253) throw new Error('Enter a valid receiver IP address or hostname');
  const host = value.trim();
  const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host);
  if (ipv4) {
    if (host.split('.').every(part => Number(part) <= 255 && (part === '0' || !part.startsWith('0')))) return host;
    throw new Error('Enter a valid receiver IP address or hostname');
  }
  if (/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(host) && host.includes('.') &&
      host.split('.').every(label => label.length >= 1 && label.length <= 63 && !label.startsWith('-') && !label.endsWith('-'))) return host.toLowerCase();
  throw new Error('Enter a valid receiver IP address or hostname');
}

async function loadConfig() {
  if (host) { host = validateHost(host); return; }
  try {
    const saved = JSON.parse(await readFile(configPath, 'utf8'));
    host = validateHost(saved.host);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error(`Marantz Deck: ignored invalid config: ${error.message}`);
  }
}

async function saveConfig(nextHost) {
  const directory = path.dirname(configPath);
  await mkdir(directory, { recursive: true });
  const temporary = `${configPath}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify({ host: nextHost }, null, 2) + '\n', { mode: 0o600 });
  await rename(temporary, configPath);
  host = nextHost;
}

function requireHost() {
  if (!host) throw new Error('Set your receiver address in Settings first');
  return host;
}

const sourceCommands = Object.freeze({
  'CBL/SAT': 'SISAT/CBL', DVD: 'SIDVD', 'Blu-ray': 'SIBD', GAME: 'SIGAME',
  AUX1: 'SIAUX1', AUX2: 'SIAUX2', 'Media Player': 'SIMPLAY',
  'iPod/USB': 'SIUSB/IPOD', CD: 'SICD', TUNER: 'SITUNER',
  NETWORK: 'SINET', 'TV AUDIO': 'SITV', Bluetooth: 'SIBT'
});
const modeCommands = Object.freeze({
  Stereo: 'MSSTEREO', Direct: 'MSDIRECT', 'Pure Direct': 'MSPURE DIRECT',
  'Multi Ch Stereo': 'MSMCH STEREO'
});
const eqBands = ['63', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];
const setupQueries = [
  'PSTONE CTRL ?', 'PSBAS ?', 'PSTRE ?', 'PSGEQ ?', 'PSMULTEQ: ?',
  'PSDYNEQ ?', 'PSDYNVOL ?', 'PSMDAX ?', 'PSDELAY ?', 'ECO?', 'SLP?'
];

function decodeXml(value) {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
}

export function field(xml, name) {
  const match = xml.match(new RegExp(`<${name}>\\s*<value(?:\\s[^>]*)?>([\\s\\S]*?)<\\/value>\\s*<\\/${name}>`));
  return match ? decodeXml(match[1]) : null;
}

export function parseStatus(mainXml, listXml) {
  const volumeText = field(mainXml, 'MasterVolume');
  const rawVolume = volumeText == null ? NaN : Number(volumeText);
  const list = listXml.match(/<InputFuncList>([\s\S]*?)<\/InputFuncList>/)?.[1] || '';
  const sources = [...list.matchAll(/<value>(.*?)<\/value>/g)].map(match => decodeXml(match[1]))
    .filter(name => Object.hasOwn(sourceCommands, name));
  return {
    online: true,
    name: field(mainXml, 'FriendlyName') || 'Marantz SR5010',
    power: field(mainXml, 'Power') === 'ON',
    source: field(mainXml, 'InputFuncSelect'),
    volume: Number.isFinite(rawVolume) ? rawVolume : null,
    muted: field(mainXml, 'Mute')?.toLowerCase() === 'on',
    mode: field(mainXml, 'selectSurround'),
    sources,
    host
  };
}

export function parseSetup(lines) {
  const find = prefix => lines.find(line => line.startsWith(prefix))?.slice(prefix.length).trim() ?? null;
  const number = prefix => {
    const value = find(prefix);
    return value == null || !/^\d+$/.test(value) ? null : Number(value);
  };
  const bass = number('PSBAS ');
  const treble = number('PSTRE ');
  return {
    tone: find('PSTONE CTRL '), bass: bass == null ? null : bass - 50,
    treble: treble == null ? null : treble - 50,
    graphicEq: find('PSGEQ '), multEq: find('PSMULTEQ:'),
    dynamicEq: find('PSDYNEQ '), dynamicVolume: find('PSDYNVOL '),
    mdax: find('PSMDAX '), delay: number('PSDELAY '),
    eco: find('ECO'), sleep: find('SLP'), host
  };
}

export function parseEqHtml(html) {
  const bands = {};
  for (const band of eqBands) {
    const match = html.match(new RegExp(`name=['"]textGEQ${band}['"][^>]*value=['"](-?\\d+(?:\\.\\d+)?)['"]`, 'i'));
    if (!match) throw new Error(`Receiver did not provide ${band} Hz EQ band`);
    bands[band] = Number(match[1]);
  }
  const selection = html.match(/<OPTION\s+value=['"](ALL|LRS|EAC)['"]\s+selected/i)?.[1] || null;
  const eqOn = /name=['"]radioGraphicEQ['"]\s+value=['"]ON['"][^>]*checked/i.test(html);
  return { bands, selection, enabled: eqOn, editable: selection === 'ALL' };
}

export function validateEqBands(bands) {
  if (!bands || typeof bands !== 'object' || Array.isArray(bands) || Object.keys(bands).length !== eqBands.length) throw new Error('Invalid EQ bands');
  for (const band of eqBands) {
    const value = bands[band];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < -20 || value > 6 || value * 2 !== Math.round(value * 2)) throw new Error(`Invalid ${band} Hz value`);
  }
  return bands;
}

export function commandFor(body) {
  if (!body || typeof body !== 'object') throw new Error('Invalid command');
  switch (body.action) {
    case 'power':
      if (typeof body.value !== 'boolean') break;
      return body.value ? 'PWON' : 'PWSTANDBY';
    case 'mute':
      if (typeof body.value !== 'boolean') break;
      return body.value ? 'MUON' : 'MUOFF';
    case 'volume-step':
      if (body.value === 'up' || body.value === 'down') return body.value === 'up' ? 'MVUP' : 'MVDOWN';
      break;
    case 'volume': {
      const v = body.value;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < -80 || v > 0 || v * 2 !== Math.round(v * 2)) break;
      const absolute = Math.round((v + 80) * 2);
      return `MV${String(Math.floor(absolute / 2)).padStart(2, '0')}${absolute % 2 ? '5' : ''}`;
    }
    case 'source':
      if (typeof body.value === 'string' && Object.hasOwn(sourceCommands, body.value)) return sourceCommands[body.value];
      break;
    case 'mode':
      if (typeof body.value === 'string' && Object.hasOwn(modeCommands, body.value)) return modeCommands[body.value];
      break;
    case 'tone':
      if (body.value === 'ON' || body.value === 'OFF') return `PSTONE CTRL ${body.value}`;
      break;
    case 'bass': case 'treble':
      if (Number.isInteger(body.value) && body.value >= -6 && body.value <= 6) {
        return `PS${body.action === 'bass' ? 'BAS' : 'TRE'} ${String(body.value + 50).padStart(2, '0')}`;
      }
      break;
    case 'graphic-eq':
      if (body.value === 'ON' || body.value === 'OFF') return `PSGEQ ${body.value}`;
      break;
    case 'mult-eq': {
      const values = { Reference: 'AUDYSSEY', 'L/R Bypass': 'BYP.LR', Flat: 'FLAT', Off: 'OFF' };
      if (typeof body.value === 'string' && Object.hasOwn(values, body.value)) return `PSMULTEQ:${values[body.value]}`;
      break;
    }
    case 'dynamic-eq':
      if (body.value === 'ON' || body.value === 'OFF') return `PSDYNEQ ${body.value}`;
      break;
    case 'dynamic-volume': {
      const values = { Off: 'OFF', Light: 'LIT', Medium: 'MED', Heavy: 'HEV' };
      if (typeof body.value === 'string' && Object.hasOwn(values, body.value)) return `PSDYNVOL ${values[body.value]}`;
      break;
    }
    case 'mdax': {
      const values = { Off: 'OFF', Low: 'LOW', Medium: 'MID', High: 'HI' };
      if (typeof body.value === 'string' && Object.hasOwn(values, body.value)) return `PSMDAX ${values[body.value]}`;
      break;
    }
    case 'eco':
      if (['OFF', 'AUTO', 'ON'].includes(body.value)) return `ECO${body.value}`;
      break;
    case 'sleep':
      if (Number.isInteger(body.value) && body.value >= 0 && body.value <= 120) return body.value === 0 ? 'SLPOFF' : `SLP${String(body.value).padStart(3, '0')}`;
      break;
    case 'delay':
      if (Number.isInteger(body.value) && body.value >= 0 && body.value <= 200) return `PSDELAY ${String(body.value).padStart(3, '0')}`;
      break;
  }
  throw new Error('Unsupported command');
}

async function receiverXml(endpoint) {
  const response = await fetch(`http://${requireHost()}${endpoint}`, { signal: AbortSignal.timeout(3500) });
  if (!response.ok) throw new Error(`Receiver returned HTTP ${response.status}`);
  return response.text();
}

async function receiverPage(endpoint) {
  const response = await fetch(`http://${requireHost()}${endpoint}`, { signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error(`Receiver returned HTTP ${response.status}`);
  return response.text();
}

function querySetup() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: requireHost(), port: 23 });
    let output = '';
    let index = 0;
    let interval;
    const timeout = setTimeout(() => { socket.destroy(); reject(new Error('Setup status timed out')); }, 5000);
    socket.on('data', chunk => { output += chunk.toString('latin1'); });
    socket.once('connect', () => {
      interval = setInterval(() => {
        if (index < setupQueries.length) socket.write(`${setupQueries[index++]}\r`);
        else {
          clearInterval(interval);
          setTimeout(() => {
            clearTimeout(timeout);
            socket.destroy();
            const setup = parseSetup(output.split('\r').map(line => line.trim()).filter(Boolean));
            if (setup.multEq == null || setup.graphicEq == null) reject(new Error('Receiver did not return setup status'));
            else resolve(setup);
          }, 300);
        }
      }, 130);
    });
    socket.once('error', error => { clearTimeout(timeout); clearInterval(interval); reject(error); });
  });
}

export function eqFormFor(bands, enabled) {
  validateEqBands(bands);
  const form = new URLSearchParams({
    setPureDirectOn: 'OFF', setSetupLock: 'OFF', radioGraphicEQ: enabled ? 'ON' : 'OFF',
    listGEQSpSelection: 'ALL', setAdjustEQ: 'Set', setGEQCurveCopy: 'off', setGEQSetDefaults: 'off'
  });
  for (const band of eqBands) form.set(`textGEQ${band}`, bands[band].toFixed(1));
  return form;
}

async function postEq(bands, enabled) {
  const form = eqFormFor(bands, enabled);
  const response = await fetch(`http://${requireHost()}/SETUP/AUDIO/GRAPHICEQ/s_audio.asp`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form, signal: AbortSignal.timeout(3500)
  });
  if (!response.ok) throw new Error(`Receiver returned HTTP ${response.status}`);
}

async function readBody(req) {
  let input = '';
  for await (const chunk of req) {
    input += chunk;
    if (input.length > 2048) throw new Error('Request too large');
  }
  return JSON.parse(input);
}

function sendCommand(command) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: requireHost(), port: 23 });
    let connected = false;
    const timer = setTimeout(() => {
      socket.destroy();
      connected ? resolve() : reject(new Error('Receiver control timed out'));
    }, 2200);
    socket.once('connect', () => {
      connected = true;
      socket.write(`${command}\r`, error => {
        if (error) { clearTimeout(timer); socket.destroy(); reject(error); }
        else setTimeout(() => { clearTimeout(timer); socket.destroy(); resolve(); }, 180);
      });
    });
    socket.once('error', error => { clearTimeout(timer); reject(error); });
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      if (req.headers.host !== `${listenHost}:${port}`) return json(res, 403, { error: 'Invalid host' });
      if (req.method === 'GET' && req.url === '/api/config') return json(res, 200, { host });
      if (req.method === 'POST' && req.url === '/api/config') {
        const origin = req.headers.origin;
        if (origin && origin !== `http://${listenHost}:${port}`) return json(res, 403, { error: 'Invalid origin' });
        if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'JSON required' });
        const nextHost = validateHost((await readBody(req)).host);
        await saveConfig(nextHost);
        return json(res, 200, { host });
      }
      if (req.method === 'GET' && req.url === '/api/status') {
        const [main, list] = await Promise.all([
          receiverXml('/goform/formMainZone_MainZoneXml.xml'),
          receiverXml('/goform/formMainZone_MainZoneXmlStatus.xml')
        ]);
        return json(res, 200, parseStatus(main, list));
      }
      if (req.method === 'GET' && req.url === '/api/setup') return json(res, 200, await querySetup());
      if (req.method === 'GET' && req.url === '/api/eq') {
        return json(res, 200, parseEqHtml(await receiverPage('/SETUP/AUDIO/GRAPHICEQ/d_audio.asp')));
      }
      if (req.method === 'POST' && (req.url === '/api/command' || req.url === '/api/eq')) {
        const origin = req.headers.origin;
        if (origin && origin !== `http://${listenHost}:${port}`) return json(res, 403, { error: 'Invalid origin' });
        if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'JSON required' });
        const body = await readBody(req);
        if (req.url === '/api/eq') {
          const current = parseEqHtml(await receiverPage('/SETUP/AUDIO/GRAPHICEQ/d_audio.asp'));
          if (!current.editable) return json(res, 409, { error: 'Select All speakers in the receiver EQ editor first' });
          const setup = await querySetup();
          if (setup.multEq !== 'OFF') return json(res, 409, { error: 'Set MultEQ XT to Off before editing Graphic EQ' });
          const mode = field(await receiverXml('/goform/formMainZone_MainZoneXml.xml'), 'selectSurround');
          if (/^(Pure )?Direct$/i.test(mode || '')) return json(res, 409, { error: 'Graphic EQ is unavailable in Direct mode' });
          await postEq(validateEqBands(body.bands), current.enabled);
          await new Promise(resolve => setTimeout(resolve, 400));
          const saved = parseEqHtml(await receiverPage('/SETUP/AUDIO/GRAPHICEQ/d_audio.asp'));
          if (eqBands.some(band => saved.bands[band] !== body.bands[band])) throw new Error('Receiver did not confirm the EQ change');
          return json(res, 200, { ok: true });
        }
        const command = commandFor(body);
        await sendCommand(command);
        return json(res, 200, { ok: true });
      }
      const files = { '/': ['index.html', 'text/html'], '/styles.css': ['styles.css', 'text/css'], '/extra.css': ['extra.css', 'text/css'], '/app.js': ['app.js', 'text/javascript'] };
      if (req.method === 'GET' && Object.hasOwn(files, req.url)) {
        const [file, contentType] = files[req.url];
        res.writeHead(200, { 'Content-Type': `${contentType}; charset=utf-8`, 'Cache-Control': 'no-store' });
        return res.end(await readFile(path.join(root, 'public', file)));
      }
      json(res, 404, { error: 'Not found' });
    } catch (error) {
      json(res, error instanceof SyntaxError || /^(Unsupported command|Invalid command|Invalid EQ|Enter a valid receiver|Request too large|Invalid \w+ Hz value)/.test(error.message) ? 400 : 502,
        { error: error.message });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await loadConfig();
  createServer().listen(port, listenHost, () => console.log(`Marantz Deck: http://${listenHost}:${port} → ${host || 'not configured'}`));
}
