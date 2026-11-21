import test from 'node:test';
import assert from 'node:assert/strict';
import { commandFor, eqFormFor, parseEqHtml, parseSetup, parseStatus, parseVideoHtml, validateEqBands, validateHost, validateVideoChange, videoFormFor } from './server.js';

test('accepts receiver addresses and rejects URL or command injection', () => {
  assert.equal(validateHost(' 192.168.1.50 '), '192.168.1.50');
  assert.equal(validateHost('sr5010.local'), 'sr5010.local');
  for (const bad of ['http://192.168.1.50', '192.168.1.50:80', '999.168.1.50', '127.000.0.1', 'host\nPWON', '']) {
    assert.throws(() => validateHost(bad));
  }
});

test('maps supported commands and constrains absolute volume', () => {
  assert.equal(commandFor({ action: 'power', value: true }), 'PWON');
  assert.equal(commandFor({ action: 'source', value: 'Media Player' }), 'SIMPLAY');
  assert.equal(commandFor({ action: 'volume', value: -21.5 }), 'MV585');
  assert.equal(commandFor({ action: 'volume', value: -80 }), 'MV00');
  assert.throws(() => commandFor({ action: 'volume', value: 10 }));
  assert.throws(() => commandFor({ action: 'source', value: 'NET\rPWON' }));
  assert.equal(commandFor({ action: 'mult-eq', value: 'Reference' }), 'PSMULTEQ:AUDYSSEY');
  assert.equal(commandFor({ action: 'bass', value: 2 }), 'PSBAS 52');
  assert.equal(commandFor({ action: 'sleep', value: 30 }), 'SLP030');
  assert.throws(() => commandFor({ action: 'bass', value: 7 }));
});

test('parses live setup reply format', () => {
  const setup = parseSetup(['PSTONE CTRL ON', 'PSBAS 52', 'PSTRE 54', 'PSGEQ ON', 'PSMULTEQ:AUDYSSEY', 'PSDYNEQ ON', 'PSDYNVOL OFF', 'PSMDAX MED', 'PSDELAY 000', 'ECOOFF', 'SLPOFF']);
  assert.equal(setup.bass, 2);
  assert.equal(setup.treble, 4);
  assert.equal(setup.multEq, 'AUDYSSEY');
  assert.equal(setup.graphicEq, 'ON');
  assert.equal(setup.delay, 0);
});

test('reads and validates receiver EQ bands without accepting arbitrary form fields', () => {
  const names = ['63', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];
  const html = `<input name='radioGraphicEQ' value='ON' checked><OPTION value='ALL' selected>All</OPTION>${names.map(name => `<input name='textGEQ${name}' value='0.0'>`).join('')}`;
  const eq = parseEqHtml(html);
  assert.equal(eq.editable, true);
  assert.equal(eq.enabled, true);
  assert.deepEqual(validateEqBands(eq.bands), eq.bands);
  const form = eqFormFor(eq.bands, true);
  assert.equal(form.get('setAdjustEQ'), 'Set');
  assert.equal(form.get('listGEQSpSelection'), 'ALL');
  assert.equal(form.get('textGEQ1k'), '0.0');
  assert.equal(form.get('setGEQSetDefaults'), 'off');
  assert.throws(() => validateEqBands({ ...eq.bands, '1k': 6.5 }));
  assert.throws(() => validateEqBands({ ...eq.bands, extra: 0 }));
});

test('parses SR5010 status and available source names', () => {
  const main = '<item><FriendlyName><value>Marantz SR5010</value></FriendlyName><Power><value>ON</value></Power><InputFuncSelect><value>Media Player</value></InputFuncSelect><MasterVolume><value>-21.5</value></MasterVolume><Mute><value>off</value></Mute><selectSurround><value>Multi Ch Stereo  </value></selectSurround></item>';
  const list = '<item><InputFuncList><value>GAME</value><value>Media Player</value><value>Unknown</value></InputFuncList></item>';
  assert.deepEqual(parseStatus(main, list).sources, ['GAME', 'Media Player']);
  assert.equal(parseStatus(main, list).volume, -21.5);
  assert.equal(parseStatus(main, list).mode, 'Multi Ch Stereo');
});

test('reads SR5010 video output settings and posts only allowed changes', () => {
  const radio = (name, values, checked) => values.map(v => `<INPUT type='radio' name='${name}' value='${v}' onClick='radioBtn()'${v === checked ? ' checked' : ''}>`).join('');
  const html = radio('radioVideoMode', ['AUTO', 'GAME', 'MOVI'], 'MOVI') + radio('radioVideoConvMode', ['ON', 'OFF'], 'ON') +
    radio('radioIpScaler', ['HTH', 'OFF'], 'HTH') + radio('radioVideoScalerResolutionHDMI', ['AUTO', '4K'], 'AUTO') +
    radio('radioIpMode', ['AUT', 'VI1'], 'AUT') + radio('radioVideoScalerAspect', ['Full', 'Normal'], 'Full');
  const video = parseVideoHtml(html);
  assert.deepEqual(video, { videoMode: 'MOVI', conversion: 'ON', scaler: 'HTH', resolution: 'AUTO', progressive: 'AUT', aspect: 'Full' });
  const form = videoFormFor(video, validateVideoChange({ setting: 'scaler', value: 'OFF' }));
  assert.equal(form.get('radioIpScaler'), 'OFF');
  assert.equal(form.get('radioVideoMode'), 'MOVI');
  assert.equal(form.get('radioVideoScalerAspect'), 'Full');
  assert.throws(() => validateVideoChange({ setting: 'scaler', value: 'OFF\rPWON' }));
  assert.throws(() => validateVideoChange({ setting: 'setSetupLock', value: 'ON' }));
  assert.throws(() => parseVideoHtml('<html></html>'));
});
