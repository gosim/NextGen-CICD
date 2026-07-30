// @ts-check
/*
 * NextGen CICD — Mission Control · Frontend-Logik
 * Konsumiert ausschließlich GET /stream (SSE, Events "state" + optional "test").
 * Reine DOM-Updates, idempotentes Diff-armes Rendern, keine externen Abhängigkeiten.
 */

const SVGNS = 'http://www.w3.org/2000/svg';
const XLINK = 'http://www.w3.org/1999/xlink';
const ENVS = /** @type {const} */ (['int', 'abnahme', 'prod']);

/** Versions-Palette laut CONTRACT §7 — Index = letzte Ziffer der Version (nur Blau/Violett). */
const VERSION_PALETTE = [
  '#3274d9', // 0
  '#a352cc', // 1
  '#1f60c4', // 2
  '#c77eea', // 3
  '#8f3bb8', // 4
  '#5794f2', // 5
  '#7c2ea3', // 6
  '#8ab8ff', // 7
  '#2a5698', // 8
  '#deb6f2', // 9
];

// --------------------------------------------------------------------------
// Hilfsfunktionen
// --------------------------------------------------------------------------

/** @param {string|null|undefined} version */
function versionColor(version) {
  if (!version) return null;
  const digits = String(version).match(/\d/g);
  if (!digits) return VERSION_PALETTE[0];
  const last = Number(digits[digits.length - 1]);
  return VERSION_PALETTE[last] ?? VERSION_PALETTE[0];
}

/** Lesbare Textfarbe zu einer Badge-Hintergrundfarbe. @param {string} hex */
function contrastText(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#0a1020' : '#ffffff';
}

/** @param {string|undefined|null} iso */
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** @param {number|null|undefined} ms */
function fmtDuration(ms) {
  if (ms == null) return '';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/** @param {string} tag @param {Record<string,string>} [attrs] */
function svg(tag, attrs = {}) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// --------------------------------------------------------------------------
// DOM-Referenzen
// --------------------------------------------------------------------------
const el = {
  runTitle: document.getElementById('run-title'),
  runVersion: document.getElementById('run-version'),
  runStatus: document.getElementById('run-status'),
  runLink: /** @type {HTMLAnchorElement} */ (document.getElementById('run-link')),
  ghOff: document.getElementById('gh-off'),
  runUpdated: document.getElementById('run-updated'),
  connHint: document.getElementById('conn-hint'),
  alarmBanner: document.getElementById('alarm-banner'),
  alarmText: document.getElementById('alarm-text'),
  pipeline: document.getElementById('pipeline-band'),
  testPanel: document.getElementById('test-panel'),
  testTitle: document.getElementById('test-title'),
  testProgress: document.getElementById('test-progress'),
  testCompact: document.getElementById('test-compact'),
  testList: document.getElementById('test-list'),
  map: document.getElementById('arch-map'),
  flowDotsLayer: document.getElementById('flow-dots-layer'),
  tickerItems: document.getElementById('ticker-items'),
  tickerMore: document.getElementById('ticker-more'),
  // Overlays
  envOverlay: document.getElementById('env-overlay'),
  envOvTitle: document.getElementById('env-ov-title'),
  envOvBody: document.getElementById('env-ov-body'),
  envOvBug: document.getElementById('env-ov-bug'),
  envOvLink: /** @type {HTMLAnchorElement} */ (document.getElementById('env-ov-link')),
  envOvClose: document.getElementById('env-ov-close'),
  tickerOverlay: document.getElementById('ticker-overlay'),
  tickerOvList: document.getElementById('ticker-ov-list'),
  tickerOvClose: document.getElementById('ticker-ov-close'),
};

/** Letzter vollständiger Snapshot (für Overlays & Merge von test-Events). */
let currentState = /** @type {any} */ (null);

// --------------------------------------------------------------------------
// KOPF / RUN
// --------------------------------------------------------------------------
const RUN_STATUS = {
  queued: { cls: 'queued', text: 'In Warteschlange' },
  in_progress: { cls: 'running', text: 'Läuft' },
  waiting: { cls: 'waiting', text: 'Wartet auf Freigabe' },
};

/** @param {any} github */
function renderHeader(github, generatedAt) {
  const available = github?.available !== false;
  const run = github?.run ?? null;

  el.ghOff.hidden = available;

  // Commit-Titel
  el.runTitle.textContent = run?.title || (available ? 'Kein aktiver Lauf' : 'Kein GitHub-Token');

  // Versions-Badge (Farblogik §7)
  if (run?.version) {
    const color = versionColor(run.version);
    el.runVersion.hidden = false;
    el.runVersion.textContent = `v${run.version}`;
    el.runVersion.style.background = color;
    el.runVersion.style.color = contrastText(color);
  } else {
    el.runVersion.hidden = true;
  }

  // Status-Chip
  let cls = 'idle';
  let text = 'Bereit';
  if (run) {
    if (run.status === 'completed') {
      if (run.conclusion === 'success') {
        cls = 'success';
        text = 'Erfolgreich';
      } else if (run.conclusion === 'failure') {
        cls = 'failure';
        text = 'Fehlgeschlagen';
      } else if (run.conclusion === 'cancelled') {
        cls = 'cancelled';
        text = 'Abgebrochen';
      } else {
        cls = 'success';
        text = 'Abgeschlossen';
      }
    } else if (RUN_STATUS[run.status]) {
      cls = RUN_STATUS[run.status].cls;
      text = RUN_STATUS[run.status].text;
    }
    if (run.workflow === 'stability' && cls === 'running') text = 'Stabilitäts-Lauf';
  }
  el.runStatus.dataset.status = cls;
  el.runStatus.textContent = text;

  // GitHub-Link
  if (available && run?.url) {
    el.runLink.hidden = false;
    el.runLink.href = run.url;
  } else {
    el.runLink.hidden = true;
  }

  el.runUpdated.textContent = generatedAt ? `aktualisiert ${fmtTime(generatedAt)}` : '';
}

// --------------------------------------------------------------------------
// PIPELINE-BAND
// --------------------------------------------------------------------------
function renderStages(github) {
  const stages = Array.isArray(github?.stages) ? github.stages : [];
  const keys = stages.map((s) => s.key).join('|');

  if (el.pipeline.dataset.keys !== keys) {
    // Struktur hat sich geändert (z. B. pipeline ↔ stability) → Knoten neu aufbauen
    el.pipeline.textContent = '';
    stages.forEach((s, i) => {
      if (i > 0) {
        const arrow = document.createElement('div');
        arrow.className = 'stage-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '→';
        el.pipeline.appendChild(arrow);
      }
      const stage = document.createElement('div');
      stage.className = 'stage';
      stage.dataset.key = s.key;
      stage.innerHTML =
        '<div class="stage-node">' +
        '<span class="stage-ic" aria-hidden="true"></span>' +
        '<span class="stage-spin" aria-hidden="true"></span>' +
        '<span class="stage-txt"></span>' +
        '</div>' +
        '<div class="stage-step"></div>';
      el.pipeline.appendChild(stage);
    });
    el.pipeline.dataset.keys = keys;
  }

  // Werte idempotent aktualisieren
  stages.forEach((s) => {
    const node = el.pipeline.querySelector(`.stage[data-key="${s.key}"]`);
    if (!node) return;
    node.dataset.status = s.status || 'idle';
    const txt = node.querySelector('.stage-txt');
    if (txt.textContent !== s.label) txt.textContent = s.label;

    const stepEl = node.querySelector('.stage-step');
    const stepText = s.status === 'running' && s.currentStep ? s.currentStep : '';
    if (stepEl.textContent !== stepText) stepEl.textContent = stepText;

    if (s.url) {
      node.classList.add('clickable');
      node.dataset.url = s.url;
      node.setAttribute('title', 'Auf GitHub öffnen');
    } else {
      node.classList.remove('clickable');
      delete node.dataset.url;
      node.removeAttribute('title');
    }
  });
}

el.pipeline.addEventListener('click', (e) => {
  const stage = /** @type {HTMLElement} */ (e.target).closest('.stage');
  if (stage && stage.dataset.url) window.open(stage.dataset.url, '_blank', 'noopener');
});

// --------------------------------------------------------------------------
// TESTFALL-PANEL
// --------------------------------------------------------------------------
const TC_SYMBOL = { passed: '✓', failed: '✗', flaky: '⚠', skipped: '–' };

/** Nur diese Suite bekommt die aufgeschlüsselte Einzeltest-Liste. */
const DETAIL_SUITE = 'int-regression';

/** Anzeige-Namen der Suiten (CONTRACT §5 project). */
const SUITE_LABEL = {
  'int-regression': 'INT-Regression',
  abnahme: 'Abnahme',
  smoke: 'Smoke',
  quarantine: 'Quarantäne',
};

function renderTests(tests) {
  const cases = Array.isArray(tests?.cases) ? tests.cases : [];
  const visible = !!(tests?.active || cases.length);
  el.testPanel.hidden = !visible;
  if (!visible) {
    el.testList.textContent = '';
    el.testCompact.hidden = true;
    return;
  }

  const total = tests.summary?.total ?? cases.length;
  const done = cases.filter((c) => c.status && c.status !== 'running').length;
  // Einzeltest-Show NUR beim echten Pipeline-Gate (source=gate, int-regression).
  // Der Stabilitäts-Check ist Hintergrund-Monitoring — immer ruhige Kompaktzeile.
  const detailed = tests.suite === DETAIL_SUITE && tests.source === 'gate';

  if (detailed) {
    const suite = SUITE_LABEL[tests.suite] || tests.suite;
    const env = tests.env ? tests.env.toUpperCase() : '—';
    el.testTitle.textContent = `🛡 Quality Gate: ${suite} gegen ${env}`;
    el.testProgress.textContent = `${done}/${total}`;
    el.testCompact.hidden = true;
    renderTestList(cases);
  } else {
    // Kompaktzeile (Stabilitäts-Check jeder Suite; Gate: abnahme/smoke/quarantine)
    el.testTitle.textContent =
      tests.source === 'stability' ? '🔍 Stabilitäts-Check' : '🛡 Quality Gate';
    el.testProgress.textContent = '';
    el.testList.textContent = '';
    renderTestCompact(tests);
  }
}

/** Einzeltest-Liste reconcilen (Reihenfolge = Datenreihenfolge). */
function renderTestList(cases) {
  const seen = new Set();
  cases.forEach((c) => {
    seen.add(c.id);
    let li = el.testList.querySelector(`.test-case[data-id="${cssEscape(c.id)}"]`);
    if (!li) {
      li = document.createElement('li');
      li.className = 'test-case';
      li.dataset.id = c.id;
      li.innerHTML =
        '<span class="tc-ic" aria-hidden="true"></span>' +
        '<span class="tc-title"></span>' +
        '<span class="tc-dur"></span>';
      el.testList.appendChild(li);
    }
    updateCase(li, c);
    // In Datenreihenfolge einsortieren
    el.testList.appendChild(li);
  });

  // Verwaiste entfernen
  el.testList.querySelectorAll('.test-case').forEach((li) => {
    if (!seen.has(li.dataset.id)) li.remove();
  });
}

/**
 * Kompaktzeile für Nicht-Regression-Suiten: „🛡 <Suite> gegen <ENV>: n/total"
 * — statischer „…läuft"-Text solange aktiv, danach ✓ grün / ✗ rot (+k flaky gelb).
 * Keine Einzel-Einträge, keine Slide-/Spin-Effekte (beruhigtes Panel).
 */
function renderTestCompact(tests) {
  const s = tests.summary || {};
  const total = s.total ?? 0;
  const passed = s.passed ?? 0;
  const failed = s.failed ?? 0;
  const flaky = s.flaky ?? 0;
  const active = !!tests.active;
  const suiteLabel = SUITE_LABEL[tests.suite] || tests.suite || 'Suite';
  const env = tests.env ? tests.env.toUpperCase() : '—';

  el.testCompact.hidden = false;
  el.testCompact.dataset.state = active ? 'active' : failed > 0 ? 'fail' : 'ok';
  el.testCompact.textContent = '';

  const shield = document.createElement('span');
  shield.className = 'tcx-shield';
  shield.setAttribute('aria-hidden', 'true');
  shield.textContent = '🛡';

  const label = document.createElement('span');
  label.className = 'tcx-label';
  label.textContent = `${suiteLabel} gegen ${env}:`;

  const count = document.createElement('span');
  count.className = 'tcx-count';
  count.textContent = `${passed}/${total}`;

  el.testCompact.append(shield, label, count);

  if (active) {
    // Beruhigte Kompaktzeile: statischer „…läuft"-Text statt Dreh-Spinner.
    const running = document.createElement('span');
    running.className = 'tcx-running';
    running.textContent = '…läuft';
    el.testCompact.append(running);
  } else {
    const res = document.createElement('span');
    res.className = 'tcx-res ' + (failed > 0 ? 'fail' : 'ok');
    res.textContent = failed > 0 ? '✗' : '✓';
    el.testCompact.append(res);
    if (flaky > 0) {
      const fl = document.createElement('span');
      fl.className = 'tcx-flaky';
      fl.textContent = `+${flaky} flaky`;
      el.testCompact.append(fl);
    }
  }
}

/** @param {HTMLElement} li */
function updateCase(li, c) {
  const status = c.status || 'running';
  if (li.dataset.status !== status) li.dataset.status = status;

  const icCell = li.querySelector('.tc-ic');
  // Beruhigtes Panel: laufende Tests bekommen ein statisches „○" (kein rotierender
  // Spinner) — Statuswechsel ist ein reiner Icon-/Farbwechsel.
  const sym = status === 'running' ? '○' : TC_SYMBOL[status] || '•';
  if (icCell.textContent !== sym) icCell.textContent = sym;

  const title = li.querySelector('.tc-title');
  if (title.textContent !== c.title) {
    title.textContent = c.title || c.id;
    title.setAttribute('title', c.title || c.id);
  }

  const dur = li.querySelector('.tc-dur');
  const durText = status === 'running' ? '' : fmtDuration(c.durationMs);
  if (dur.textContent !== durText) dur.textContent = durText;

  // Fehlertext (failed/flaky) — aufklappbar
  const hasError = (status === 'failed' || status === 'flaky') && c.error;
  let details = li.querySelector('.tc-error');
  if (hasError) {
    if (!details) {
      details = document.createElement('details');
      details.className = 'tc-error';
      details.innerHTML = '<summary>Fehlerdetails</summary><pre></pre>';
      li.appendChild(details);
    }
    const pre = details.querySelector('pre');
    if (pre.textContent !== c.error) pre.textContent = c.error;
  } else if (details) {
    details.remove();
  }
}

/** Minimaler Selector-Escape für data-id (Fallback wenn CSS.escape fehlt). */
function cssEscape(s) {
  return window.CSS && CSS.escape ? CSS.escape(String(s)) : String(s).replace(/["\\\]]/g, '\\$&');
}

// --------------------------------------------------------------------------
// ARCHITEKTUR-KARTE
// --------------------------------------------------------------------------

/** aktive Fluss-Punkt-Gruppen: flowId -> <g> */
const flowDots = new Map();

function renderMap(state) {
  const choreo = state.choreography || {};
  const active = new Set(choreo.active || []);
  const flows = new Set(choreo.flows || []);

  // 1) Aktive Komponenten pulsieren lassen
  el.map.querySelectorAll('[data-component]').forEach((node) => {
    node.classList.toggle('active', active.has(node.getAttribute('data-component')));
  });

  // 2) Fluss-Pfade hervorheben + wandernde Punkte verwalten
  el.map.querySelectorAll('.flow-path').forEach((path) => {
    const id = path.id.replace(/^flow-/, '');
    path.classList.toggle('flow-active', flows.has(id));
  });
  syncFlowDots(flows);

  // 2b) Während eines Rollback-Pulls glüht die Stapel-Spitze (§3)
  const rollbackActive = [...flows].some((f) => f.endsWith('rollback-pull'));
  const topCard = document.getElementById('ghcr-card-0');
  if (topCard) topCard.classList.toggle('glow', rollbackActive);

  // 3) Umgebungen: Health-Punkt, Versions-Badge
  const environments = state.environments || {};
  ENVS.forEach((env) => {
    const data = environments[env];
    const box = el.map.querySelector(`.env-box[data-env="${env}"]`);
    if (!box) return;

    const up = data?.health === 'up';
    const down = data?.health === 'down';
    box.querySelectorAll('.health-dot').forEach((dot) => {
      dot.classList.toggle('health-up', up);
      dot.classList.toggle('health-down', down);
    });

    const vGroup = box.querySelector('.env-version');
    const rect = vGroup.querySelector('rect');
    const text = vGroup.querySelector('text');
    if (data?.version) {
      const color = versionColor(data.version);
      rect.style.fill = color;
      text.style.fill = contrastText(color);
      const label = `v${data.version}`;
      if (text.textContent !== label) text.textContent = label;
    } else {
      rect.style.fill = '';
      text.style.fill = '';
      if (text.textContent !== '–') text.textContent = '–';
    }
  });

  // 4) Alarm
  const alarm = choreo.alarm || null;
  ENVS.forEach((env) => {
    const box = el.map.querySelector(`.env-box[data-env="${env}"]`);
    if (box) box.classList.toggle('alarm', !!alarm && alarm.env === env);
  });
  if (alarm) {
    const envName = String(alarm.env || '').toUpperCase();
    el.alarmText.textContent = `Rollback läuft — ${envName} wird wiederhergestellt`;
    el.alarmBanner.hidden = false;
  } else {
    el.alarmBanner.hidden = true;
  }

  // 5) Freigabe-Symbole auf den Kettenpfeilen pulsieren, wenn die Stage wartet
  const stages = Array.isArray(state.github?.stages) ? state.github.stages : [];
  const stageStatus = (key) => stages.find((st) => st.key === key)?.status;
  const approvalWait = {
    'approval-int-abnahme': stageStatus('abnahme-approval') === 'waiting',
    'approval-abnahme-prod': stageStatus('prod-approval') === 'waiting',
  };
  for (const [id, waiting] of Object.entries(approvalWait)) {
    const node = document.getElementById(id);
    if (node) node.classList.toggle('waiting', waiting);
  }
}

/** @param {Set<string>} flows */
function syncFlowDots(flows) {
  if (prefersReducedMotion.matches) {
    // Punkte werden per CSS ausgeblendet; nichts erzeugen
    flowDots.forEach((g) => g.remove());
    flowDots.clear();
    return;
  }
  // Neue aktive Flüsse: Punkte anlegen
  flows.forEach((flowId) => {
    if (flowDots.has(flowId)) return;
    const path = document.getElementById(`flow-${flowId}`);
    if (!path) return;
    const restore = path.classList.contains('flow-restore');
    const g = svg('g', { class: 'flow-dots' + (restore ? ' flow-dots-restore' : '') });
    for (let i = 0; i < 4; i++) {
      const dot = svg('circle', { r: '5', class: 'flow-dot' });
      const motion = svg('animateMotion', {
        dur: '2.2s',
        repeatCount: 'indefinite',
        begin: `${(i * 0.55).toFixed(2)}s`,
        calcMode: 'linear',
      });
      const mpath = svg('mpath', { href: `#flow-${flowId}` });
      mpath.setAttributeNS(XLINK, 'href', `#flow-${flowId}`);
      motion.appendChild(mpath);
      dot.appendChild(motion);
      g.appendChild(dot);
    }
    el.flowDotsLayer.appendChild(g);
    flowDots.set(flowId, g);
  });
  // Nicht mehr aktive Flüsse: Punkte entfernen
  flowDots.forEach((g, flowId) => {
    if (!flows.has(flowId)) {
      g.remove();
      flowDots.delete(flowId);
    }
  });
}

// --------------------------------------------------------------------------
// GHCR — IMAGE-STAPEL
// --------------------------------------------------------------------------
const GHCR_SLOTS = 3;
const ENV_CHIP = { int: 'INT', abnahme: 'ABN', prod: 'PROD' };
/** Zuletzt gerenderte Stapel-Spitze — Wechsel löst die Slide-Animation aus. */
let lastRegistryTop = null;

/**
 * Rendert den Image-Stapel (max. 3 Karten, oben = neueste).
 * Ändert sich images[0].version, rutscht eine neue Karte von oben ein,
 * die übrigen rücken nach (CSS-Keyframes). Je Karte: Versions-Badge +
 * Env-Chips für jede Umgebung, deren Version der Karten-Version entspricht.
 */
function renderRegistry(state) {
  const images = Array.isArray(state.registry?.images) ? state.registry.images.slice(0, GHCR_SLOTS) : [];
  const environments = state.environments || {};
  const topVersion = images[0]?.version ?? null;
  const isNewTop = lastRegistryTop !== null && topVersion !== null && topVersion !== lastRegistryTop;

  // „LATEST ✓"-Band auf der NEUESTEN promoteten Karte (Position im Stapel egal, da
  // images[] bereits neueste-zuerst sortiert ist → erster Treffer = neueste). „NEU"
  // dezent auf noch nicht promoteten Karten.
  const latestPromotedIdx = images.findIndex((im) => im?.promoted === true);

  // Deploy-Lese-Hervorhebung: läuft ein <env>-pull, glüht die Karte, deren Version
  // gerade in eine Umgebung gezogen wird (github.run.version, Fallback images[0]).
  const flows = new Set(state.choreography?.flows || []);
  const pullActive = ENVS.some((e) => flows.has(`${e}-pull`));
  const readVersion = state.github?.run?.version ?? images[0]?.version ?? null;

  for (let i = 0; i < GHCR_SLOTS; i++) {
    const card = document.getElementById(`ghcr-card-${i}`);
    if (!card) continue;
    fillGhcrCard(card, images[i], environments);
    card.classList.toggle('is-latest', i === latestPromotedIdx);
    card.classList.toggle('is-neu', !!images[i]?.version && images[i]?.promoted !== true);
    card.classList.toggle('pull-glow', pullActive && !!images[i]?.version && images[i].version === readVersion);
  }

  // Stapel-Animation nur bei echtem Wechsel der Spitze (nicht beim Erst-Anstrich)
  if (isNewTop && !prefersReducedMotion.matches) {
    for (let i = 0; i < GHCR_SLOTS; i++) {
      const card = document.getElementById(`ghcr-card-${i}`);
      if (!card || card.classList.contains('empty')) continue;
      const cls = i === 0 ? 'card-enter' : 'card-shift';
      card.classList.remove('card-enter', 'card-shift');
      void card.getBoundingClientRect(); // Reflow erzwingen → Keyframe neu starten
      card.classList.add(cls);
    }
  }
  lastRegistryTop = topVersion;

  renderGhcrGhost(state, images);
}

/**
 * Geister-Karte über der Stapel-Spitze: sichtbar, solange die CI-Stage läuft UND
 * die gerade gebaute Version (github.run.version) noch nicht im Stapel steht.
 * Sobald sie in images[0] auftaucht, verschwindet der Geist und die reguläre
 * Enter-Animation der echten Karte übernimmt.
 */
function renderGhcrGhost(state, images) {
  const ghost = document.getElementById('ghcr-ghost');
  if (!ghost) return;
  const stages = Array.isArray(state.github?.stages) ? state.github.stages : [];
  const ciRunning = stages.find((s) => s.key === 'ci')?.status === 'running';
  const runVersion = state.github?.run?.version ?? null;
  const known = images.some((im) => im?.version === runVersion);
  const building = ciRunning && !!runVersion && !known;

  ghost.classList.toggle('visible', building);
  if (building) {
    const txt = ghost.querySelector('.ghcr-ghost-txt');
    const label = `v${runVersion} · wird gebaut…`;
    if (txt.textContent !== label) txt.textContent = label;
  }
}

/** Füllt eine einzelne Stapel-Karte (oder markiert sie als leer/gestrichelt). */
function fillGhcrCard(card, img, environments) {
  const badgeBg = card.querySelector('.ghcr-badge-bg');
  const badgeTxt = card.querySelector('.ghcr-badge-txt');
  const chips = card.querySelector('.ghcr-chips');

  if (!img || !img.version) {
    card.classList.add('empty');
    if (badgeTxt.textContent !== '–') badgeTxt.textContent = '–';
    badgeBg.style.fill = '';
    badgeTxt.style.fill = '';
    if (chips.dataset.envs !== '') {
      chips.dataset.envs = '';
      chips.textContent = '';
    }
    return;
  }

  card.classList.remove('empty');
  const color = versionColor(img.version) || VERSION_PALETTE[0];
  badgeBg.style.fill = color;
  badgeTxt.style.fill = contrastText(color);
  const label = `v${img.version}`;
  if (badgeTxt.textContent !== label) badgeTxt.textContent = label;

  // Env-Chips: jede Umgebung, deren Version dieser Karte entspricht → Drift sichtbar
  const matching = ENVS.filter((e) => environments[e]?.version === img.version);
  const want = matching.join(',');
  if (chips.dataset.envs !== want) {
    chips.dataset.envs = want;
    chips.textContent = '';
    matching.forEach((env, idx) => {
      const g = svg('g', { class: `ghcr-chip chip-${env}`, transform: `translate(${12 + idx * 50},52)` });
      g.appendChild(svg('rect', { x: '0', y: '0', width: '46', height: '24', rx: '12', class: 'ghcr-chip-bg' }));
      const t = svg('text', { x: '23', y: '17', 'text-anchor': 'middle', class: 'ghcr-chip-txt' });
      t.textContent = ENV_CHIP[env];
      g.appendChild(t);
      chips.appendChild(g);
    });
  }
}

// --------------------------------------------------------------------------
// BACKUP-BANK — je Umgebung ein Dump-Stapel mittig unter seiner Env-Box
// --------------------------------------------------------------------------

/**
 * Rendert die drei Dump-Stapel (backup-int / -abnahme / -prod) aus der v4-Datenform
 * state.backups.<env> = { at, sizeBytes, tag, count } | null.
 * Je Stapel: sichtbare oberste Karte (Zeit via fmtTime, Größe in kB) + Anzahl-Badge
 * („×count"); null ⇒ gestrichelter Platzhalter „kein Backup".
 * Bei aktivem <env>-backup- ODER <env>-restore-Flow pulsiert der Stapelrahmen (.active);
 * bei restore zusätzlich rote Glut auf der sichtbaren Karte (.restoring, §3).
 */
function renderBackups(state) {
  const backups = state.backups || {};
  const flows = new Set(state.choreography?.flows || []);

  ENVS.forEach((env) => {
    const stack = el.map.querySelector(`[data-component="backup-${env}"]`);
    if (!stack) return;
    fillBackupStack(stack, backups[env]);

    const backupActive = flows.has(`${env}-backup`);
    const restoreActive = flows.has(`${env}-restore`);
    stack.classList.toggle('active', backupActive || restoreActive);
    stack.classList.toggle('restoring', restoreActive);
  });
}

/** Füllt einen einzelnen Dump-Stapel (oder schaltet auf den Platzhalter „kein Backup"). */
function fillBackupStack(stack, entry) {
  const hasData = !!(entry && entry.at);
  stack.classList.toggle('empty', !hasData);

  const timeTxt = stack.querySelector('.backup-time');
  const sizeTxt = stack.querySelector('.backup-size');
  const countTxt = stack.querySelector('.backup-count-txt');

  if (!hasData) {
    if (timeTxt.textContent !== '—') timeTxt.textContent = '—';
    if (sizeTxt.textContent !== '') sizeTxt.textContent = '';
    if (countTxt.textContent !== '') countTxt.textContent = '';
    stack.dataset.key = '';
    return;
  }

  const kb = Math.round((entry.sizeBytes || 0) / 1024);
  const count = entry.count || 0;
  const key = `${entry.at}|${entry.sizeBytes}|${count}`;
  if (stack.dataset.key === key) return; // idempotent — nichts geändert
  stack.dataset.key = key;

  timeTxt.textContent = fmtTime(entry.at);
  sizeTxt.textContent = `${kb.toLocaleString('de-DE')} kB`;
  countTxt.textContent = `×${count}`;
}

// --------------------------------------------------------------------------
// TICKER
// --------------------------------------------------------------------------
let lastTickerKeys = [];

function renderTicker(ticker) {
  const items = Array.isArray(ticker) ? ticker : [];
  const visible = items.slice(0, 3);
  const keys = visible.map((t) => `${t.at}|${t.text}`);

  el.tickerItems.textContent = '';
  visible.forEach((t, i) => {
    const li = document.createElement('li');
    li.className = 'ticker-item';
    if (!lastTickerKeys.includes(keys[i])) li.classList.add('slide-in');
    const time = document.createElement('span');
    time.className = 'ti-time';
    time.textContent = fmtTime(t.at);
    const txt = document.createElement('span');
    txt.className = 'ti-text';
    txt.textContent = t.text;
    txt.setAttribute('title', t.text);
    li.appendChild(time);
    li.appendChild(txt);
    el.tickerItems.appendChild(li);
  });
  lastTickerKeys = keys;

  el.tickerMore.hidden = items.length <= 3;
}

function openTickerOverlay() {
  const items = Array.isArray(currentState?.ticker) ? currentState.ticker : [];
  el.tickerOvList.textContent = '';
  items.forEach((t) => {
    const li = document.createElement('li');
    const time = document.createElement('span');
    time.className = 'ti-time';
    time.textContent = fmtTime(t.at);
    const txt = document.createElement('span');
    txt.textContent = t.text;
    li.appendChild(time);
    li.appendChild(txt);
    el.tickerOvList.appendChild(li);
  });
  el.tickerOverlay.hidden = false;
}

// --------------------------------------------------------------------------
// ENV-DETAIL-OVERLAY
// --------------------------------------------------------------------------
const ENV_LABEL = { int: 'INT (Integration)', abnahme: 'ABNAHME', prod: 'PROD (Produktion)' };

function openEnvOverlay(env) {
  const data = currentState?.environments?.[env];
  el.envOvTitle.textContent = `Umgebung ${ENV_LABEL[env] || env.toUpperCase()}`;

  const rows = [
    ['Version', data?.version ? `v${data.version}` : '—', false],
    ['Git-SHA', data?.gitSha || '—', true],
    ['Health', data?.health === 'up' ? 'up · erreichbar' : data?.health === 'down' ? 'down · nicht erreichbar' : 'unbekannt', false],
  ];
  const instances = Array.isArray(data?.instances) ? data.instances : [];
  rows.push(['Instanzen', instances.length ? instances.join(', ') : '—', true]);

  el.envOvBody.innerHTML = '';
  rows.forEach(([label, value, mono]) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    if (mono) dd.className = 'mono';
    dd.textContent = value;
    el.envOvBody.appendChild(dt);
    el.envOvBody.appendChild(dd);
  });

  // Demo-Bug-Warnhinweis
  if (data?.demoBug && data.demoBug !== 'none') {
    el.envOvBug.hidden = false;
    el.envOvBug.textContent = `⚠ Demo-Bug aktiv: „${data.demoBug}" — diese Version ist absichtlich fehlerhaft (Rollback-Demo).`;
  } else {
    el.envOvBug.hidden = true;
  }

  el.envOvLink.hidden = true;
  el.envOverlay.hidden = false;
}

// Env-Boxen klick-/tastaturbar machen
el.map.querySelectorAll('.env-box').forEach((box) => {
  const env = box.getAttribute('data-env');
  box.addEventListener('click', () => openEnvOverlay(env));
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openEnvOverlay(env);
    }
  });
});

// Overlay-Schließen
function closeOverlays() {
  el.envOverlay.hidden = true;
  el.tickerOverlay.hidden = true;
}
el.envOvClose.addEventListener('click', closeOverlays);
el.tickerOvClose.addEventListener('click', closeOverlays);
el.tickerMore.addEventListener('click', openTickerOverlay);
[el.envOverlay, el.tickerOverlay].forEach((ov) => {
  ov.addEventListener('click', (e) => {
    if (e.target === ov) closeOverlays();
  });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeOverlays();
});

// --------------------------------------------------------------------------
// DEMO-STEUERUNG (workflow_dispatch + Freigaben über den Server)
// --------------------------------------------------------------------------
const ctrl = {
  bar: document.getElementById('control-bar'),
  approvals: document.getElementById('ctrl-approvals'),
  feedback: document.getElementById('ctrl-feedback'),
  rollback: document.getElementById('ctrl-rollback'),
  rollbackEnv: document.getElementById('ctrl-rollback-env'),
  rollbackDb: document.getElementById('ctrl-rollback-db'),
};

let feedbackTimer = null;
function ctrlFeedback(text, isError) {
  ctrl.feedback.textContent = text;
  ctrl.feedback.classList.toggle('is-error', Boolean(isError));
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => {
    ctrl.feedback.textContent = '';
  }, 6000);
}

async function ctrlPost(path, body, button) {
  if (button) button.disabled = true;
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      ctrlFeedback(data.message ?? 'Ausgelöst.');
    } else {
      ctrlFeedback(data.error ?? `Fehler (HTTP ${response.status})`, true);
    }
  } catch {
    ctrlFeedback('Server nicht erreichbar.', true);
  } finally {
    // Kurze Sperre gegen Doppelklicks; der Live-Zustand zeigt den Fortschritt.
    setTimeout(() => {
      if (button) button.disabled = false;
    }, 2000);
  }
}

for (const button of ctrl.bar.querySelectorAll('[data-scenario]')) {
  button.addEventListener('click', () => {
    ctrlPost('/actions/trigger', { scenario: button.dataset.scenario }, button);
  });
}
ctrl.rollback.addEventListener('click', () => {
  ctrlPost(
    '/actions/trigger',
    { scenario: 'rollback', env: ctrl.rollbackEnv.value, restoreDb: ctrl.rollbackDb.checked },
    ctrl.rollback,
  );
});

/** Freigabe-Buttons dynamisch aus pendingApprovals; Steuerung nur mit GitHub-Token sichtbar. */
function renderControls(github) {
  ctrl.bar.hidden = !github?.available;
  const pending = Array.isArray(github?.pendingApprovals) ? github.pendingApprovals : [];
  const want = pending.join(',');
  if (ctrl.approvals.dataset.pending === want) return;
  ctrl.approvals.dataset.pending = want;
  ctrl.approvals.replaceChildren(
    ...pending.map((env) => {
      const button = document.createElement('button');
      button.className = 'ctrl-btn ctrl-approve';
      button.textContent = `✅ ${env === 'abnahme' ? 'Abnahme' : 'PROD'} freigeben`;
      button.addEventListener('click', () => ctrlPost('/actions/approve', { env }, button));
      return button;
    }),
  );
}

// --------------------------------------------------------------------------
// STATE-ANWENDUNG
// --------------------------------------------------------------------------
function applyState(state) {
  if (!state || typeof state !== 'object') return;
  currentState = state;
  renderHeader(state.github, state.generatedAt);
  renderStages(state.github);
  renderTests(state.tests || {});
  renderMap(state);
  renderRegistry(state);
  renderBackups(state);
  renderTicker(state.ticker);
  renderControls(state.github);
}

/** Einzelnes Live-Test-Event (Zusatzsignal) in den aktuellen Snapshot einpflegen. */
function applyTestEvent(tc) {
  if (!tc || !tc.id) return;
  if (!currentState) currentState = {};
  if (!currentState.tests) currentState.tests = { active: true, cases: [] };
  const tests = currentState.tests;
  if (!Array.isArray(tests.cases)) tests.cases = [];
  tests.active = true;
  const idx = tests.cases.findIndex((c) => c.id === tc.id);
  if (idx >= 0) tests.cases[idx] = { ...tests.cases[idx], ...tc };
  else tests.cases.push(tc);
  renderTests(tests);
}

// --------------------------------------------------------------------------
// VERBINDUNG (SSE) + Fallback
// --------------------------------------------------------------------------
function setConnected(connected) {
  el.connHint.hidden = connected;
}

function connect() {
  const source = new EventSource('/stream');

  source.addEventListener('open', () => setConnected(true));

  source.addEventListener('state', (e) => {
    setConnected(true);
    try {
      applyState(JSON.parse(e.data));
    } catch (err) {
      console.error('Ungültiger state-Snapshot:', err);
    }
  });

  source.addEventListener('test', (e) => {
    try {
      applyTestEvent(JSON.parse(e.data));
    } catch (err) {
      console.error('Ungültiges test-Event:', err);
    }
  });

  // EventSource verbindet nach Abbruch automatisch neu — wir zeigen nur den Hinweis.
  source.addEventListener('error', () => {
    if (source.readyState !== EventSource.OPEN) setConnected(false);
  });
}

// Schneller Erst-Anstrich über den REST-Fallback (SSE übernimmt danach live).
fetch('/api/state')
  .then((r) => (r.ok ? r.json() : null))
  .then((s) => {
    if (s && !currentState) applyState(s);
  })
  .catch(() => {
    /* egal — SSE liefert den Snapshot ohnehin */
  });

connect();
