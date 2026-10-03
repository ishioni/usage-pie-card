const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup() {
  let now = 10000;
  let nextId = 1;
  const timers = new Map();
  const registry = new Map();
  class Element {
    constructor() { this.isConnected = true; }
    attachShadow() { this.shadowRoot = {}; }
    dispatchEvent() {}
  }
  class Clock extends Date { static now() { return now; } }
  const context = {
    HTMLElement: Element,
    Date: Clock,
    console: { info() {} },
    window: {},
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    customElements: { define: (name, cls) => registry.set(name, cls) },
    setTimeout: (fn, ms) => { const id = nextId++; timers.set(id, { fn, due: now + ms }); return id; },
    clearTimeout: (id) => timers.delete(id),
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'usage-pie-card.js'), 'utf8'), context);
  const Card = registry.get('usage-pie-card');
  Card.prototype._buildDom = function () { this._pausedEl = { style: {} }; };
  Card.prototype._render = function (model) {
    this._model = model;
    this._modelKey = model.key;
    this._pendingModel = null;
    this.paints = (this.paints || 0) + 1;
  };
  return {
    Card, registry,
    timers,
    advance(ms) {
      now += ms;
      for (;;) {
        const ready = [...timers].find(([, timer]) => timer.due <= now);
        if (!ready) break;
        timers.delete(ready[0]);
        ready[1].fn();
      }
    },
  };
}

const state = (value, unit) => ({ state: String(value), attributes: unit === undefined ? {} : { unit_of_measurement: unit } });
const hass = (states) => ({ states, themes: { darkMode: false } });

function waterCard(Card, extra = {}) {
  const card = new Card();
  card.setConfig({ entities: ['sensor.a', 'sensor.b'], display_unit: 'L', ...extra });
  return card;
}

test('distinct registration, conversion in both directions, zero without unit and incompatible units', () => {
  const { Card, registry } = setup();
  assert.ok(registry.has('usage-pie-card-editor'));
  assert.equal(registry.has('power-pie-card'), false);
  const card = waterCard(Card);
  card.hass = hass({ 'sensor.a': state(0.125, 'm³'), 'sensor.b': state(35, 'L') });
  assert.equal(card._model.totalText, '160');
  assert.deepEqual(Array.from(card._model.slices, (s) => s.valueText), ['125', '35']);
  card.setConfig({ entities: ['sensor.a', 'sensor.b'], display_unit: 'm³' });
  assert.equal(card._model.totalText, '0.16');
  assert.deepEqual(Array.from(card._model.slices, (s) => s.valueText), ['0.13', '0.04']);
  card.hass = hass({ 'sensor.a': state(0, undefined), 'sensor.b': state(2, 'W') });
  assert.equal(card._model.totalText, '0.00');
  assert.equal(card._model.slices.length, 1);
  assert.equal(card._model.slices[0].pctText, '0%');
  card.hass = hass({ 'sensor.a': state(1, undefined), 'sensor.b': state(2, 'W') });
  assert.equal(card._model.slices.length, 0);
  assert.equal(card._model.incompatible, 2);
  card.hass = hass({ 'sensor.a': state('', undefined), 'sensor.b': state('unavailable', 'L') });
  assert.equal(card._model.slices.length, 0);
  assert.equal(card._model.incompatible, 0);
  assert.throws(() => card.setConfig({ entities: ['sensor.a'], display_unit: '°C' }), /unsupported display_unit/);
});

test('power compatibility, totals and remainder reject incompatible total sensors', () => {
  const { Card } = setup();
  const card = new Card();
  card.setConfig({ entities: ['sensor.a', 'sensor.b'], display_unit: 'kW', total_amount: 3000 });
  card.hass = hass({ 'sensor.a': state(500, 'W'), 'sensor.b': state(0.5, 'kW') });
  assert.equal(card._model.totalText, '3.00');
  assert.equal(card._model.slices.at(-1).valueText, '2.00');
  card.setConfig({ entities: ['sensor.a', 'sensor.b'], display_unit: 'kW', total_amount: '3000' });
  assert.equal(card._model.totalText, '3.00');
  card.setConfig({ entities: ['sensor.a', 'sensor.b'], display_unit: 'kW', total_amount: 'sensor.total' });
  card.hass = hass({ 'sensor.a': state(500, 'W'), 'sensor.b': state(0.5, 'kW'), 'sensor.total': state(200, 'L') });
  assert.equal(card._model.totalText, '1.00');
  assert.equal(card._model.slices.length, 2);
  card.hass = hass({ 'sensor.a': state(500, 'w'), 'sensor.b': state(1000, 'mw') });
  assert.equal(card._model.totalText, '0.50');
});

test('water total sensors convert m³ to L and do not invent a remainder for a bad unit', () => {
  const { Card } = setup();
  const card = waterCard(Card, { total_amount: 'sensor.total' });
  card.hass = hass({ 'sensor.a': state(100, 'L'), 'sensor.b': state(0.05, 'm³'),
    'sensor.total': state(0.2, 'm³') });
  assert.equal(card._model.totalText, '200');
  assert.equal(card._model.slices.at(-1).valueText, '50');
  card.hass = hass({ 'sensor.a': state(100, 'L'), 'sensor.b': state(0.05, 'm³'),
    'sensor.total': state(900, 'W') });
  assert.equal(card._model.totalText, '150');
  assert.equal(card._model.slices.length, 2);
});

test('visual toggles and unit affect model identity even with identical rounded numbers', () => {
  const { Card } = setup();
  const card = waterCard(Card);
  const snapshot = hass({ 'sensor.a': state(0, 'L'), 'sensor.b': state(0, 'L') });
  card.hass = snapshot;
  const first = card._modelKey;
  card.setConfig({ entities: ['sensor.a', 'sensor.b'], display_unit: 'L', show_value: false, show_percentage: false });
  assert.notEqual(card._modelKey, first);
  assert.equal(card._config.show_value, false);
  assert.equal(card._config.show_percentage, false);
  card.setConfig({ entities: ['sensor.a', 'sensor.b'], display_unit: 'W' });
  assert.notEqual(card._modelKey, first);
});

test('throttle coalesces latest state, freezes hover, catches up on reconnect and clears timers', () => {
  const { Card, timers, advance } = setup();
  const card = waterCard(Card, { refresh_interval: 5 });
  const push = (a) => { card.hass = hass({ 'sensor.a': state(a, 'L'), 'sensor.b': state(2, 'L') }); };
  push(1);
  assert.equal(card.paints, 1); // initial paint, no delay
  push(3);
  advance(2000);
  push(4);
  assert.equal(card.paints, 1);
  assert.equal(timers.size, 1);
  card._setFrozen(true);
  advance(3000);
  assert.equal(card.paints, 1);
  push(5);
  card._setFrozen(false);
  assert.equal(card.paints, 2);
  assert.equal(card._model.slices.find((s) => s.id === 'sensor.a').base, 5);
  push(6);
  card.isConnected = false;
  card.disconnectedCallback();
  assert.equal(timers.size, 0);
  push(7);
  card.isConnected = true;
  card.connectedCallback();
  assert.equal(card.paints, 3);
  assert.equal(card._model.slices.find((s) => s.id === 'sensor.a').base, 7);
  assert.equal(timers.size, 0);
});

test('returning to the displayed state cancels a pending refresh', () => {
  const { Card, timers } = setup();
  const card = waterCard(Card, { refresh_interval: 5 });
  card.hass = hass({ 'sensor.a': state(1, 'L') });
  card.hass = hass({ 'sensor.a': state(2, 'L') });
  assert.equal(timers.size, 1);
  card.hass = hass({ 'sensor.a': state(1, 'L') });
  assert.equal(timers.size, 0);
  assert.equal(card.paints, 1);
});

test('editor exposes generic settings and retains explicit false/zero values', () => {
  const { registry } = setup();
  const Editor = registry.get('usage-pie-card-editor');
  const editor = new Editor();
  editor._initialized = true;
  editor._form = {};
  editor.setConfig({ entities: ['sensor.a'], display_unit: 'm³', refresh_interval: 0,
    show_value: false, show_percentage: false });
  const names = Array.from(editor._form.schema, (s) => s.name);
  for (const name of ['display_unit', 'refresh_interval', 'show_value', 'show_percentage']) {
    assert.ok(names.includes(name));
  }
  assert.deepEqual(Array.from(editor._form.schema.find((s) => s.name === 'display_unit').selector.select.options,
    (o) => o.value), ['W', 'kW', 'L', 'm³']);
  assert.equal(editor._form.data.show_value, false);
  assert.equal(editor._form.data.refresh_interval, 0);
  editor._valueChanged({ stopPropagation() {}, detail: { value: {
    display_unit: 'L', refresh_interval: 0, show_value: false, show_percentage: false,
  } } });
  assert.equal(editor._config.show_value, false);
  assert.equal(editor._config.show_percentage, false);
  assert.equal(editor._config.refresh_interval, 0);
  assert.equal(editor._config.entities.length, 1);
});

test('unfreezing before the due time respects the throttle', () => {
  const { Card, advance } = setup();
  const card = waterCard(Card, { refresh_interval: 5 });
  card.hass = hass({ 'sensor.a': state(1, 'L') });
  card._setFrozen(true);
  card.hass = hass({ 'sensor.a': state(3, 'L') });
  advance(1000);
  card._setFrozen(false);
  assert.equal(card.paints, 1);
  advance(4000);
  assert.equal(card.paints, 2);
  assert.equal(card._model.totalText, '3');
});

test('rejects invalid refresh intervals', () => {
  const { Card } = setup();
  const card = new Card();
  for (const refresh_interval of [-1, '5', Infinity]) {
    assert.throws(() => card.setConfig({ entities: ['sensor.a'], refresh_interval }), /refresh_interval/);
  }
});
