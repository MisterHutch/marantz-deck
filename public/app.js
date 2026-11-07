const $ = id => document.getElementById(id);
const state = { status: null, setup: null, eq: null, eqDraft: null, eqDirty: false, busy: false, setupLoading: false, eqLoading: false, dragging: false, noticeTimer: null, view: 'control', host: null };
const bands = [['63', '63'], ['125', '125'], ['250', '250'], ['500', '500'], ['1k', '1k'], ['2k', '2k'], ['4k', '4k'], ['8k', '8k'], ['16k', '16k']];

function notice(message) {
  const el = $('notice');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(state.noticeTimer);
  state.noticeTimer = setTimeout(() => { el.hidden = true; }, 5000);
}

function formatVolume(value) {
  return value == null ? '—' : Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function volumeVisual(value) {
  const slider = $('volume');
  slider.style.setProperty('--fill', `${Math.max(0, Math.min(100, (value + 80) / 80 * 100))}%`);
  $('volume-value').textContent = formatVolume(value);
}

function render(s) {
  const previous = state.status;
  state.status = s;
  $('dot').className = `dot ${s.online ? 'online' : 'offline'}`;
  $('connection').textContent = s.online ? 'CONNECTED' : 'OFFLINE';
  $('ip').textContent = s.host || '';
  document.querySelectorAll('[data-native]').forEach(link => { link.href = `http://${s.host}${link.dataset.native}`; });
  $('source-name').textContent = s.source || (s.online ? 'No source selected' : 'Receiver unavailable');
  $('mode-label').textContent = s.mode || (s.online ? 'Sound mode unavailable' : 'Check the receiver connection');
  $('power-state').textContent = s.power ? 'POWER ON' : 'STANDBY';
  if (!state.dragging) { $('volume').value = s.volume ?? -80; volumeVisual(s.volume); }
  $('mute').classList.toggle('active', !!s.muted);
  $('mute').textContent = s.muted ? 'UNMUTE' : 'MUTE';
  $('power-on').classList.toggle('active', !!s.power);
  $('power-off').classList.toggle('active', !s.power);
  document.querySelectorAll('[data-mode]').forEach(button => button.classList.toggle('active', s.mode?.trim().toLowerCase() === button.dataset.mode.toLowerCase()));
  $('refresh-time').textContent = `UPDATED ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  if (!previous || previous.sources.join('|') !== s.sources.join('|')) {
    const wrap = $('sources');
    wrap.replaceChildren();
    for (const source of s.sources) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = source;
      button.dataset.source = source;
      wrap.append(button);
    }
  }
  document.querySelectorAll('[data-source]').forEach(button => button.classList.toggle('active', button.dataset.source.toLowerCase() === s.source?.toLowerCase()));
  renderEqState();
}

async function refreshConfig() {
  const response = await fetch('/api/config', { cache: 'no-store' });
  const config = await response.json();
  state.host = config.host;
  $('receiver-host').value = config.host || '';
  if (!config.host) $('receiver-dialog').showModal();
}

$('receiver-settings').addEventListener('click', () => {
  $('receiver-host').value = state.host || '';
  $('receiver-error').hidden = true;
  $('receiver-dialog').showModal();
});
$('receiver-cancel').addEventListener('click', () => $('receiver-dialog').close());
$('receiver-form').addEventListener('submit', async event => {
  event.preventDefault();
  const error = $('receiver-error');
  error.hidden = true;
  try {
    const response = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: $('receiver-host').value }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save the address');
    state.host = result.host;
    state.status = null;
    state.setup = null;
    state.eq = null;
    $('receiver-dialog').close();
    await refresh();
    notice(`Receiver address saved: ${result.host}`);
  } catch (cause) {
    error.textContent = cause.message;
    error.hidden = false;
  }
});

function setSelect(id, value) {
  const el = $(id);
  if (value != null && [...el.options].some(option => option.value === String(value))) el.value = String(value);
}

function renderSetup(s) {
  state.setup = s;
  setSelect('set-multeq', ({ AUDYSSEY: 'Reference', 'BYP.LR': 'L/R Bypass', FLAT: 'Flat', OFF: 'Off' })[s.multEq]);
  setSelect('set-dyneq', s.dynamicEq);
  setSelect('set-dynvol', ({ OFF: 'Off', LIT: 'Light', MED: 'Medium', HEV: 'Heavy' })[s.dynamicVolume]);
  setSelect('set-geq', s.graphicEq);
  setSelect('set-mdax', ({ OFF: 'Off', LOW: 'Low', MID: 'Medium', MED: 'Medium', HI: 'High' })[s.mdax]);
  setSelect('set-tone', s.tone);
  setSelect('set-bass', s.bass);
  setSelect('set-treble', s.treble);
  setSelect('set-eco', s.eco);
  const sleepSelect = $('set-sleep');
  sleepSelect.querySelector('[data-remaining]')?.remove();
  const remaining = s.sleep === 'OFF' ? 0 : Number(s.sleep);
  if (Number.isInteger(remaining) && remaining >= 0 && remaining <= 120) {
    if (![...sleepSelect.options].some(option => option.value === String(remaining))) {
      const option = new Option(`${remaining} min left`, remaining);
      option.dataset.remaining = 'true';
      sleepSelect.add(option);
    }
    setSelect('set-sleep', remaining);
  }
  if (s.delay != null && document.activeElement !== $('set-delay')) $('set-delay').value = s.delay;
  const toneAvailable = s.tone === 'ON' && s.dynamicEq === 'OFF' && !/^(Pure )?Direct$/i.test(state.status?.mode || '');
  $('set-bass').disabled = !toneAvailable;
  $('set-treble').disabled = !toneAvailable;
  renderEqState();
}

function renderEqState() {
  const eq = state.eq;
  const setup = state.setup;
  if (!eq || !setup) return;
  const direct = /^(Pure )?Direct$/i.test(state.status?.mode || '');
  const ready = setup.multEq === 'OFF' && !direct;
  const active = ready && setup.graphicEq === 'ON';
  $('eq-state').textContent = active ? 'EQ ACTIVE' : setup.graphicEq === 'ON' ? 'EQ STORED / INACTIVE' : 'EQ OFF';
  $('eq-state').classList.toggle('active', active);
  $('eq-speakers').textContent = eq.selection === 'ALL' ? 'All speakers' : 'Receiver selection: ' + (eq.selection || 'unknown');
  $('eq-multeq').textContent = ({ AUDYSSEY: 'Reference', 'BYP.LR': 'L/R Bypass', FLAT: 'Flat', OFF: 'Off' })[setup.multEq] || setup.multEq || '—';
  $('eq-mode').textContent = state.status?.mode || '—';
  $('eq-toggle').textContent = setup.graphicEq === 'ON' ? 'On' : 'Off';
  $('eq-explainer').textContent = !eq.editable ? 'Select All speakers in the receiver EQ editor to edit this curve here.' : direct ? 'Direct and Pure Direct bypass the graphic EQ. Choose another sound mode to use it.' : setup.multEq !== 'OFF' ? 'MultEQ XT is using an Audyssey curve. Choose Off for MultEQ XT in Setup before editing or hearing this graphic EQ curve.' : setup.graphicEq !== 'ON' ? 'The curve is ready. Turn Graphic EQ On in Setup to hear it.' : 'This All-speaker curve is currently in the signal path.';
  $('eq-apply').disabled = !eq.editable || !ready || !state.eqDirty;
}

function renderEq(eq, force = false) {
  state.eq = eq;
  if (!state.eqDirty || force) {
    state.eqDraft = { ...eq.bands };
    state.eqDirty = false;
    const wrap = $('eq-bands');
    wrap.replaceChildren();
    for (const [id, label] of bands) {
      const band = document.createElement('label');
      band.className = 'eq-band';
      band.innerHTML = `<span class="eq-value"></span><input type="range" min="-20" max="6" step="0.5" data-band="${id}" aria-label="${label} hertz EQ level"><span class="eq-frequency">${label}${label.includes('k') ? '' : ' Hz'}</span>`;
      const slider = band.querySelector('input');
      slider.value = eq.bands[id];
      band.querySelector('.eq-value').textContent = `${Number(eq.bands[id]).toFixed(1)}`;
      wrap.append(band);
    }
  }
  renderEqState();
}

async function refreshSetup() {
  if (state.busy || state.setupLoading) return;
  state.setupLoading = true;
  try {
    const response = await fetch('/api/setup', { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Setup unavailable');
    renderSetup(result);
  } catch (error) { notice(`Setup: ${error.message}`); }
  finally { state.setupLoading = false; }
}

async function refreshEq(force = false) {
  if (state.busy || state.eqLoading || (state.eqDirty && !force)) return;
  state.eqLoading = true;
  try {
    const response = await fetch('/api/eq', { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'EQ unavailable');
    renderEq(result, force);
  } catch (error) { notice(`EQ: ${error.message}`); }
  finally { state.eqLoading = false; }
}

async function refresh() {
  if (state.busy || state.dragging) return;
  if (!state.host) {
    $('dot').className = 'dot offline';
    $('connection').textContent = 'SETUP NEEDED';
    $('source-name').textContent = 'Set receiver address';
    $('mode-label').textContent = 'Open Settings to connect to your SR5010';
    return;
  }
  try {
    const response = await fetch('/api/status', { cache: 'no-store' });
    if (!response.ok) throw new Error((await response.json()).error || 'Receiver unavailable');
    render(await response.json());
  } catch (error) {
    $('dot').className = 'dot offline';
    $('connection').textContent = 'OFFLINE';
    $('source-name').textContent = 'Receiver unavailable';
    $('mode-label').textContent = error.message;
  }
}

async function command(action, value) {
  if (state.busy) return;
  state.busy = true;
  try {
    const response = await fetch('/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, value }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Command failed');
    await new Promise(resolve => setTimeout(resolve, action === 'power' && value ? 1400 : 400));
  } catch (error) { notice(error.message); }
  finally { state.busy = false; await refresh(); if (state.view !== 'control') await refreshSetup(); }
}

async function applyEq() {
  if (state.busy || !state.eqDirty || !state.eq?.editable) return;
  state.busy = true;
  try {
    const response = await fetch('/api/eq', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bands: state.eqDraft, enabled: state.eq.enabled }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'EQ update failed');
    state.eqDirty = false;
    await new Promise(resolve => setTimeout(resolve, 350));
    notice('EQ curve applied to the receiver.');
  } catch (error) { notice(error.message); }
  finally { state.busy = false; await refreshEq(true); }
}

function setView(view) {
  state.view = view;
  document.querySelectorAll('.view').forEach(el => { el.hidden = el.id !== `${view}-view`; });
  document.querySelectorAll('.tab').forEach(el => { const active = el.dataset.view === view; el.classList.toggle('active', active); if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
  if (view === 'setup') refreshSetup();
  if (view === 'equalizer') (async () => { await refreshSetup(); await refreshEq(); })();
}

$('volume-down').addEventListener('click', () => command('volume-step', 'down'));
$('volume-up').addEventListener('click', () => command('volume-step', 'up'));
$('mute').addEventListener('click', () => command('mute', !state.status?.muted));
$('power-on').addEventListener('click', () => command('power', true));
$('power-off').addEventListener('click', () => command('power', false));
$('modes').addEventListener('click', event => { const button = event.target.closest('[data-mode]'); if (button) command('mode', button.dataset.mode); });
$('sources').addEventListener('click', event => { const button = event.target.closest('[data-source]'); if (button) command('source', button.dataset.source); });
$('volume').addEventListener('pointerdown', () => { state.dragging = true; });
$('volume').addEventListener('input', event => volumeVisual(Number(event.target.value)));
$('volume').addEventListener('change', event => { state.dragging = false; command('volume', Number(event.target.value)); });
document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
for (const id of ['set-bass', 'set-treble']) {
  for (let v = -6; v <= 6; v++) { const option = new Option(`${v > 0 ? '+' : ''}${v} dB`, v); $(id).add(option); }
}
document.querySelectorAll('select[data-action]').forEach(select => select.addEventListener('change', () => {
  const value = ['bass', 'treble', 'sleep'].includes(select.dataset.action) ? Number(select.value) : select.value;
  command(select.dataset.action, value);
}));
$('apply-delay').addEventListener('click', () => command('delay', Number($('set-delay').value)));
$('eq-bands').addEventListener('input', event => {
  const slider = event.target.closest('[data-band]');
  if (!slider) return;
  state.eqDraft[slider.dataset.band] = Number(slider.value);
  slider.parentElement.querySelector('.eq-value').textContent = Number(slider.value).toFixed(1);
  state.eqDirty = true;
  renderEqState();
});
$('eq-flat').addEventListener('click', () => {
  if (!state.eqDraft) return;
  document.querySelectorAll('[data-band]').forEach(slider => { slider.value = 0; slider.parentElement.querySelector('.eq-value').textContent = '0.0'; state.eqDraft[slider.dataset.band] = 0; });
  state.eqDirty = true; renderEqState();
});
$('eq-revert').addEventListener('click', () => { if (state.eq) { state.eqDirty = false; renderEq(state.eq, true); } });
$('eq-apply').addEventListener('click', applyEq);
document.addEventListener('keydown', event => {
  if (event.target instanceof HTMLInputElement) return;
  if (event.key.toLowerCase() === 'm') command('mute', !state.status?.muted);
  if (event.key === 'ArrowUp' || event.key === 'ArrowRight') { event.preventDefault(); command('volume-step', 'up'); }
  if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') { event.preventDefault(); command('volume-step', 'down'); }
});

refreshConfig().then(refresh).catch(error => notice(`Settings: ${error.message}`));
setInterval(() => { if (state.view === 'control') refresh(); }, 2500);
setInterval(() => { if (state.view !== 'control') refresh(); }, 10000);
setInterval(() => {
  if (state.view === 'setup') refreshSetup();
  if (state.view === 'equalizer') (async () => { await refreshSetup(); await refreshEq(); })();
}, 12000);
