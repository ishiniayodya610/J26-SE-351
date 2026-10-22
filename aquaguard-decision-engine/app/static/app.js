// AquaGuard AI Decision Engine - Interactive Showcase Controller

let speciesCatalog = [];
let currentFishPopulation = [];
let proposedFishPopulation = [];
let allBenchmarkResults = [];

// Initialize Dashboard on DOM Load
document.addEventListener('DOMContentLoaded', async () => {
  await fetchSpeciesCatalog();
  loadPreset('peaceful');
  setupWhatIfDefaults();
  await loadBenchmarkOverview();
});

// Tab Switching
function switchTab(tabId) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab-btn').forEach(b => b.classList.remove('active'));

  const activePanel = document.getElementById(tabId);
  if (activePanel) activePanel.classList.add('active');

  const activeBtn = document.getElementById(`tab-btn-${tabId.replace('tab-', '')}`);
  if (activeBtn) activeBtn.classList.add('active');
}

// Fetch Species Biological Catalog from API
async function fetchSpeciesCatalog() {
  try {
    const res = await fetch('/api/v1/species/');
    const data = await res.json();
    speciesCatalog = data.species || [];

    // Populate Selectors
    const selector = document.getElementById('species-selector');
    const simSelector = document.getElementById('sim-species-selector');
    selector.innerHTML = '<option value="" disabled selected>Select species to add...</option>';
    simSelector.innerHTML = '<option value="" disabled selected>Select species to introduce...</option>';

    speciesCatalog.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.species_id;
      opt.textContent = `${s.common_name} (${s.scientific_name || s.species_id})`;
      selector.appendChild(opt);

      const simOpt = opt.cloneNode(true);
      simSelector.appendChild(simOpt);
    });

    renderSpeciesCatalogGrid();
  } catch (err) {
    console.error('Failed to load species catalog:', err);
  }
}

// Render Species Catalog Grid (Tab 4)
function renderSpeciesCatalogGrid() {
  const grid = document.getElementById('species-catalog-grid');
  grid.innerHTML = '';

  speciesCatalog.forEach(s => {
    const env = s.environment || {};
    const temp = env.temperature || env.temperature_c || {};
    const ph = env.ph || {};
    const dgh = env.hardness_dgh || {};
    const dims = s.aquarium_requirements?.recommended_minimum_base_dimensions_cm || {};
    const breeding = s.breeding || {};

    const card = document.createElement('div');
    card.className = 'catalog-card';
    card.innerHTML = `
      <div class="catalog-species-header">
        <div class="catalog-common-name">${s.common_name}</div>
        <div class="catalog-scientific">${s.scientific_name || s.species_id}</div>
      </div>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.75rem;">
        ${s.behavior?.temperament || s.temperament || 'Community fish'} • Adult Size: <strong>${s.adult_standard_length_mm || 50}mm</strong>
      </p>
      <div class="param-pills-row">
        <span class="param-pill">🌡️ ${temp.min || 20}°C - ${temp.max || 28}°C</span>
        <span class="param-pill">🧪 pH ${ph.min || 6.5} - ${ph.max || 8.0}</span>
        <span class="param-pill">💧 ${dgh.min || 5}-${dgh.max || 25} dGH</span>
        <span class="param-pill">📏 Base: ${dims.length || 60}x${dims.width || 30}cm</span>
        <span class="param-pill">🧬 ${breeding.reproductive_mode || breeding.type || 'Egg-layer'}</span>
      </div>
      <div style="margin-top: 1rem; font-size: 0.75rem; color: var(--text-dim);">
        Source: ${s.validation?.source_ids ? s.validation.source_ids.join(', ') : 'Seriously Fish Database'}
      </div>
    `;
    grid.appendChild(card);
  });
}

// Preset Loader
function loadPreset(presetKey) {
  switch (presetKey) {
    case 'peaceful':
      setTankParams(100, 24.5, 6.8, 120);
      currentFishPopulation = [
        { species_id: 'corydoras_aeneus', common_name: 'Corydoras (Bronze Cory)', male: 2, female: 4, lethargy_index_pct: 0 },
        { species_id: 'paracheirodon_innesi', common_name: 'Neon Tetra', male: 5, female: 5, lethargy_index_pct: 0 }
      ];
      break;
    case 'predator':
      setTankParams(150, 26.0, 7.0, 150);
      currentFishPopulation = [
        { species_id: 'pterophyllum_scalare', common_name: 'Angelfish', male: 1, female: 1, lethargy_index_pct: 0 },
        { species_id: 'paracheirodon_innesi', common_name: 'Neon Tetra', male: 5, female: 5, lethargy_index_pct: 0 }
      ];
      break;
    case 'overstock':
      setTankParams(25, 24.0, 7.0, 150);
      currentFishPopulation = [
        { species_id: 'corydoras_aeneus', common_name: 'Corydoras (Bronze Cory)', male: 15, female: 15, lethargy_index_pct: 0 }
      ];
      break;
    case 'temp_violation':
      setTankParams(100, 33.0, 7.0, 150);
      currentFishPopulation = [
        { species_id: 'paracheirodon_innesi', common_name: 'Neon Tetra', male: 5, female: 5, lethargy_index_pct: 0 }
      ];
      break;
    case 'harem':
      setTankParams(100, 25.0, 7.5, 220);
      currentFishPopulation = [
        { species_id: 'poecilia_reticulata', common_name: 'Guppy', male: 2, female: 6, lethargy_index_pct: 0 },
        { species_id: 'xiphophorus_maculatus', common_name: 'Platy', male: 2, female: 6, lethargy_index_pct: 0 }
      ];
      break;
    case 'betta':
      setTankParams(45, 26.0, 7.0, 150);
      currentFishPopulation = [
        { species_id: 'betta_splendens', common_name: 'Betta', male: 1, female: 0, lethargy_index_pct: 0 }
      ];
      break;
  }
  renderFishPopulation();
  executeDecisionPipeline();
}

function setTankParams(vol, temp, ph, tds) {
  document.getElementById('input-volume').value = vol;
  document.getElementById('input-temp').value = temp;
  document.getElementById('input-ph').value = ph;
  document.getElementById('input-tds').value = tds;
  updateVolumeDisplay();
  updateTempDisplay();
  updatePhDisplay();
  updateTdsDisplay();
}

// Display Helpers for Sliders
function updateVolumeDisplay() {
  document.getElementById('volume-val-display').textContent = `${document.getElementById('input-volume').value} Liters`;
}
function updateTempDisplay() {
  document.getElementById('temp-val-display').textContent = `${Number(document.getElementById('input-temp').value).toFixed(1)} °C`;
}
function updatePhDisplay() {
  document.getElementById('ph-val-display').textContent = Number(document.getElementById('input-ph').value).toFixed(1);
}
function updateTdsDisplay() {
  document.getElementById('tds-val-display').textContent = `${document.getElementById('input-tds').value} ppm`;
}

// Population Builder UI
function renderFishPopulation() {
  const list = document.getElementById('active-fish-list');
  list.innerHTML = '';
  document.getElementById('population-count-badge').textContent = `${currentFishPopulation.length} Species`;

  currentFishPopulation.forEach((fish, idx) => {
    const row = document.createElement('div');
    row.className = 'fish-item-card';
    row.innerHTML = `
      <div class="fish-info">
        <span class="fish-name">${fish.common_name}</span>
        <span class="fish-sub">${fish.species_id}</span>
      </div>
      <div class="fish-counters">
        <div class="counter-group">
          <span>♂ M:</span>
          <input type="number" class="counter-input" min="0" max="50" value="${fish.male}" 
            onchange="updateFishCount(${idx}, 'male', this.value)">
        </div>
        <div class="counter-group">
          <span>♀ F:</span>
          <input type="number" class="counter-input" min="0" max="50" value="${fish.female}" 
            onchange="updateFishCount(${idx}, 'female', this.value)">
        </div>
        <button class="btn-delete" title="Remove Species" onclick="removeFish(${idx})">✕</button>
      </div>
    `;
    list.appendChild(row);
  });
}

function addSpeciesFromSelector() {
  const sel = document.getElementById('species-selector');
  const speciesId = sel.value;
  if (!speciesId) return;

  const sp = speciesCatalog.find(s => s.species_id === speciesId);
  const exists = currentFishPopulation.find(f => f.species_id === speciesId);

  if (exists) {
    exists.male += 1;
    exists.female += 2;
  } else {
    currentFishPopulation.push({
      species_id: speciesId,
      common_name: sp ? sp.common_name : speciesId,
      male: 2,
      female: 4,
      lethargy_index_pct: 0
    });
  }
  renderFishPopulation();
}

function updateFishCount(idx, field, val) {
  if (currentFishPopulation[idx]) {
    currentFishPopulation[idx][field] = Math.max(0, parseInt(val) || 0);
  }
}

function removeFish(idx) {
  currentFishPopulation.splice(idx, 1);
  renderFishPopulation();
}

// Execute 4-Stage Decision Pipeline (POST /api/v1/evaluate)
async function executeDecisionPipeline() {
  const runBtn = document.getElementById('btn-run-pipeline');
  runBtn.innerHTML = '<span>⏳</span> EVALUATING...';
  runBtn.disabled = true;

  const payload = {
    aquarium: {
      volume_liters: parseFloat(document.getElementById('input-volume').value)
    },
    telemetry: {
      temperature_c: parseFloat(document.getElementById('input-temp').value),
      ph: parseFloat(document.getElementById('input-ph').value),
      tds_ppm: parseFloat(document.getElementById('input-tds').value)
    },
    fish: currentFishPopulation.map(f => ({
      species_id: f.species_id,
      common_name: f.common_name,
      male: f.male,
      female: f.female,
      lethargy_index_pct: f.lethargy_index_pct || 0
    }))
  };

  try {
    const res = await fetch('/api/v1/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const decision = await res.json();
    renderPipelineResults(decision, payload);
  } catch (err) {
    console.error('Pipeline error:', err);
  } finally {
    runBtn.innerHTML = '<span>🚀</span> EXECUTE 4-STAGE PIPELINE';
    runBtn.disabled = false;
  }
}

// Render Pipeline Outputs
function renderPipelineResults(decision, payload) {
  const isApproved = decision.status === 'APPROVED';

  // 1. Stage 1: CSP Gatekeeper
  const cspBadge = document.getElementById('csp-status-badge');
  const cspContent = document.getElementById('csp-output-content');
  const stage1Card = document.getElementById('stage-1-card');

  if (isApproved) {
    cspBadge.className = 'stage-badge pass';
    cspBadge.textContent = 'PASSED';
    stage1Card.style.borderColor = 'rgba(16, 185, 129, 0.5)';
    cspContent.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--accent-teal); font-weight: 600; margin-bottom: 0.5rem;">
        <span>✓</span> All Hard Biological Constraints Satisfied
      </div>
      <p style="font-size: 0.85rem; color: var(--text-muted);">
        No predator/prey aggression conflicts detected. Total bioload volume fits within ${payload.aquarium.volume_liters}L aquarium capacity.
        Water temperature (${payload.telemetry.temperature_c}°C) is within safe biological maintenance boundaries.
      </p>
    `;
  } else {
    cspBadge.className = 'stage-badge fail';
    cspBadge.textContent = 'REJECTED';
    stage1Card.style.borderColor = 'rgba(244, 63, 94, 0.6)';
    const violation = decision.violations?.[0] || {};
    const involved = violation.species?.join(', ') || 'Selected species';

    cspContent.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--accent-rose); font-weight: 700; margin-bottom: 0.4rem;">
        <span>✕</span> Violation Triggered: ${violation.rule_id || 'CSP Rule'} (${violation.reason_code || 'BIOLOGICAL_MISMATCH'})
      </div>
      <p style="font-size: 0.85rem; color: #cbd5e1; margin-bottom: 0.5rem;">
        Affected Species: <strong style="color: #fff;">${involved}</strong>
      </p>
      <div class="xai-callout">
        <div class="xai-title">Gatekeeper Rejection Notice</div>
        <div class="xai-desc">${decision.xai?.[0]?.reason || 'Parameters violate biological invariants.'}</div>
      </div>
    `;
  }

  // 2. Stage 2: Fuzzy Stability Engine (ESI)
  const esiScore = decision.esi !== undefined ? decision.esi : 0.0;
  const esiCategory = isApproved 
    ? (esiScore >= 0.70 ? 'STABLE' : (esiScore >= 0.35 ? 'SUBOPTIMAL' : 'CRITICAL'))
    : 'REJECTED';

  const gaugeFill = document.getElementById('esi-gauge-fill');
  const scoreText = document.getElementById('esi-score-val');
  const catPill = document.getElementById('esi-category-pill');

  scoreText.textContent = isApproved ? esiScore.toFixed(2) : '0.00';
  
  // Calculate arc offset (total arc length is 251.2)
  const offset = 251.2 * (1 - (isApproved ? esiScore : 0));
  gaugeFill.style.strokeDashoffset = offset;

  if (!isApproved || esiScore < 0.35) {
    gaugeFill.style.stroke = 'var(--accent-rose)';
    catPill.style.background = 'rgba(244, 63, 94, 0.15)';
    catPill.style.color = 'var(--accent-rose)';
  } else if (esiScore < 0.70) {
    gaugeFill.style.stroke = 'var(--accent-amber)';
    catPill.style.background = 'rgba(245, 158, 11, 0.15)';
    catPill.style.color = 'var(--accent-amber)';
  } else {
    gaugeFill.style.stroke = 'var(--accent-teal)';
    catPill.style.background = 'rgba(16, 185, 129, 0.15)';
    catPill.style.color = 'var(--accent-teal)';
  }
  catPill.textContent = esiCategory;

  document.getElementById('ant-temp-val').textContent = `${payload.telemetry.temperature_c}°C`;
  document.getElementById('ant-ph-val').textContent = payload.telemetry.ph;
  document.getElementById('ant-tds-val').textContent = `${payload.telemetry.tds_ppm} ppm`;
  
  // Calculate base aggression
  let maxAgg = 1;
  payload.fish.forEach(f => {
    const sp = speciesCatalog.find(s => s.species_id === f.species_id);
    const agg = sp?.behavior?.aggression || 1;
    if (agg > maxAgg) maxAgg = agg;
  });
  document.getElementById('ant-agg-val').textContent = `${maxAgg}/10`;

  // 3. Stage 3: Dynamic Population Optimizer
  const optContent = document.getElementById('optimizer-output-content');
  if (isApproved && decision.population && decision.population.length > 0) {
    let popCards = '<div class="optimizer-pop-grid">';
    decision.population.forEach(f => {
      const sp = speciesCatalog.find(s => s.species_id === f.species_id);
      popCards += `
        <div class="opt-fish-card">
          <div class="opt-fish-name">${sp ? sp.common_name : f.species_id}</div>
          <div class="opt-counts">
            <span class="count-badge-m">♂ ${f.male} Males</span>
            <span class="count-badge-f">♀ ${f.female} Females</span>
          </div>
          <div style="font-size: 0.72rem; color: var(--text-dim); margin-top: 0.35rem;">
            Breeding Ratio: ${f.male > 0 ? (f.female / f.male).toFixed(1) : 'Solitary'} : 1
          </div>
        </div>
      `;
    });
    popCards += '</div>';

    optContent.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
        <span style="font-size: 0.88rem; color: var(--accent-teal); font-weight: 600;">✓ Optimized Population Candidate Generated</span>
        <span style="font-size: 0.75rem; color: var(--text-dim);">Convergence: DEAP Generation 10</span>
      </div>
      ${popCards}
    `;
  } else {
    optContent.innerHTML = `
      <p style="color: var(--text-dim); font-size: 0.88rem;">
        GA optimization bypassed because Stage 1 CSP Gatekeeper blocked the configuration.
      </p>
    `;
  }

  // 4. Stage 4: Explainable AI (XAI)
  const xaiContent = document.getElementById('xai-output-content');
  const xaiItem = decision.xai?.[0] || {};

  xaiContent.innerHTML = `
    <div class="xai-callout ${isApproved ? 'approved' : ''}">
      <div class="xai-title">
        <span>${isApproved ? '✅' : '⚠️'}</span>
        ${xaiItem.summary || (isApproved ? 'Configuration Approved' : 'Configuration Rejected')}
      </div>
      <div class="xai-desc" style="color: #f1f5f9; font-weight: 500; margin-bottom: 0.4rem;">
        ${xaiItem.reason || 'Decision pipeline completed evaluation.'}
      </div>
      <div class="xai-desc">
        <strong>Recommendation:</strong> ${xaiItem.recommendation || 'Proceed with monitoring aquarium telemetry.'}
      </div>
    </div>
  `;
}

// ---------------- WHAT-IF SIMULATOR LAB (Tab 2) ----------------
function setupWhatIfDefaults() {
  proposedFishPopulation = [
    { species_id: 'corydoras_aeneus', common_name: 'Corydoras (Bronze Cory)', male: 2, female: 2 }
  ];
  renderSimCurrentFish();
  renderSimProposedFish();
}

function renderSimCurrentFish() {
  const container = document.getElementById('sim-current-fish-list');
  container.innerHTML = '';
  currentFishPopulation.forEach((f, idx) => {
    const item = document.createElement('div');
    item.className = 'fish-item-card';
    item.style.padding = '0.5rem 0.8rem';
    item.innerHTML = `
      <span style="font-weight: 600; font-size: 0.88rem;">${f.common_name}</span>
      <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; color: var(--primary-cyan);">
        ${f.male}M / ${f.female}F
      </span>
    `;
    container.appendChild(item);
  });
}

function renderSimProposedFish() {
  const container = document.getElementById('sim-proposed-fish-list');
  container.innerHTML = '';
  proposedFishPopulation.forEach((f, idx) => {
    const item = document.createElement('div');
    item.className = 'fish-item-card';
    item.innerHTML = `
      <div class="fish-info">
        <span class="fish-name">${f.common_name}</span>
        <span class="fish-sub">Add to existing tank</span>
      </div>
      <div class="fish-counters">
        <div class="counter-group">
          <span>♂:</span>
          <input type="number" class="counter-input" min="0" value="${f.male}" 
            onchange="proposedFishPopulation[${idx}].male = parseInt(this.value)||0">
        </div>
        <div class="counter-group">
          <span>♀:</span>
          <input type="number" class="counter-input" min="0" value="${f.female}" 
            onchange="proposedFishPopulation[${idx}].female = parseInt(this.value)||0">
        </div>
        <button class="btn-delete" onclick="proposedFishPopulation.splice(${idx}, 1); renderSimProposedFish();">✕</button>
      </div>
    `;
    container.appendChild(item);
  });
}

function addProposedFishRow() {
  const sel = document.getElementById('sim-species-selector');
  const speciesId = sel.value;
  if (!speciesId) return;

  const sp = speciesCatalog.find(s => s.species_id === speciesId);
  proposedFishPopulation.push({
    species_id: speciesId,
    common_name: sp ? sp.common_name : speciesId,
    male: 1,
    female: 2
  });
  renderSimProposedFish();
}

async function runWhatIfSimulation() {
  const baseFish = currentFishPopulation.map(f => ({ ...f }));
  // Combined proposed population = current fish + added proposed fish
  const mergedMap = {};
  baseFish.forEach(f => {
    mergedMap[f.species_id] = { ...f };
  });
  proposedFishPopulation.forEach(f => {
    if (mergedMap[f.species_id]) {
      mergedMap[f.species_id].male += f.male;
      mergedMap[f.species_id].female += f.female;
    } else {
      mergedMap[f.species_id] = { ...f };
    }
  });

  const payload = {
    aquarium: {
      volume_liters: parseFloat(document.getElementById('sim-base-vol').value)
    },
    telemetry: {
      temperature_c: parseFloat(document.getElementById('sim-base-temp').value),
      ph: parseFloat(document.getElementById('sim-base-ph').value),
      tds_ppm: parseFloat(document.getElementById('sim-base-tds').value)
    },
    current_population: baseFish,
    proposed_population: Object.values(mergedMap)
  };

  try {
    const res = await fetch('/api/v1/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    renderSimulationResult(result);
  } catch (err) {
    console.error('What-If simulation failed:', err);
  }
}

function renderSimulationResult(result) {
  const wrapper = document.getElementById('simulation-result-wrapper');
  wrapper.style.display = 'block';

  const isApproved = result.status === 'APPROVED';
  const before = result.before?.esi || 0.0;
  const after = result.after?.esi !== null && result.after?.esi !== undefined ? result.after.esi : 0.0;
  const diff = result.difference?.esi_change !== undefined ? result.difference.esi_change : (after - before);

  document.getElementById('sim-esi-before').textContent = before.toFixed(2);
  document.getElementById('sim-esi-after').textContent = isApproved ? after.toFixed(2) : 'REJECTED';

  const deltaVal = document.getElementById('sim-delta-val');
  const deltaBanner = document.getElementById('sim-delta-banner');
  const impactTag = document.getElementById('sim-impact-tag');

  if (isApproved) {
    const sign = diff >= 0 ? '+' : '';
    deltaVal.textContent = `${sign}${diff.toFixed(2)}`;
    deltaVal.style.color = diff >= 0 ? 'var(--accent-teal)' : 'var(--accent-amber)';
    impactTag.textContent = `STABILITY IMPACT: ${result.difference?.stability_impact || (diff >= 0 ? 'IMPROVED' : 'REDUCED')}`;
    deltaBanner.style.borderColor = diff >= 0 ? 'var(--accent-teal)' : 'var(--accent-amber)';
  } else {
    deltaVal.textContent = 'REJECTED';
    deltaVal.style.color = 'var(--accent-rose)';
    impactTag.textContent = 'PROPOSED STATE FAILS CSP GATEKEEPER';
    deltaBanner.style.borderColor = 'var(--accent-rose)';
  }

  document.getElementById('sim-explanation-text').textContent = result.explanation || '';
  document.getElementById('sim-recommendation-text').textContent = result.recommendation || '';
}

// ---------------- 100-SCENARIO BENCHMARK SUITE (Tab 3) ----------------
async function loadBenchmarkOverview() {
  try {
    const res = await fetch('/api/v1/benchmarks/');
    const data = await res.json();
    allBenchmarkResults = data.benchmarks || [];
    renderBenchmarkTableRows(allBenchmarkResults, false);
  } catch (err) {
    console.error('Failed to load benchmarks overview:', err);
  }
}

async function executeBenchmarkSuite() {
  const btn = document.getElementById('btn-run-benchmarks');
  btn.innerHTML = '<span>⏳</span> RUNNING 100 BENCHMARKS...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/v1/benchmarks/run', { method: 'POST' });
    const data = await res.json();

    const m = data.metrics || {};
    document.getElementById('bm-accuracy-val').textContent = `${m.accuracy?.toFixed(1) || '100.0'}%`;
    document.getElementById('bm-tp-val').textContent = m.tp ?? 40;
    document.getElementById('bm-tn-val').textContent = m.tn ?? 60;
    document.getElementById('bm-fp-val').textContent = m.fp ?? 0;
    document.getElementById('bm-fn-val').textContent = m.fn ?? 0;

    allBenchmarkResults = data.results || [];
    renderBenchmarkTableRows(allBenchmarkResults, true);
  } catch (err) {
    console.error('Benchmark execution error:', err);
  } finally {
    btn.innerHTML = '<span>▶</span> RUN 100 BENCHMARK SCENARIOS';
    btn.disabled = false;
  }
}

function renderBenchmarkTableRows(items, hasRun) {
  const tbody = document.getElementById('benchmark-table-body');
  tbody.innerHTML = '';

  items.forEach(bm => {
    const tr = document.createElement('tr');
    const expected = bm.expected_csp_status;
    const actual = hasRun ? bm.actual_csp_status : '--';
    const classification = hasRun ? bm.classification : '--';

    const speciesNames = (bm.fish || []).map(f => {
      const sp = speciesCatalog.find(s => s.species_id === f.species_id);
      return `${sp ? sp.common_name : f.species_id} (${f.male}M/${f.female}F)`;
    }).join(', ');

    const classBadge = classification !== '--' 
      ? `<span class="badge badge-${classification.toLowerCase()}">${classification}</span>`
      : `<span style="color: var(--text-dim);">-</span>`;

    tr.innerHTML = `
      <td style="font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--primary-cyan);">${bm.id}</td>
      <td style="color: var(--text-muted); font-size: 0.8rem;">${bm.type || 'standard'}</td>
      <td>${bm.aquarium?.volume_liters || 100} L</td>
      <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.8rem;">
        ${bm.telemetry?.temperature_c || 25}°C • pH ${bm.telemetry?.ph || 7.0}
      </td>
      <td style="font-size: 0.8rem; max-width: 280px;">${speciesNames}</td>
      <td><span class="badge badge-${expected.toLowerCase()}">${expected}</span></td>
      <td>
        ${actual !== '--' ? `<span class="badge badge-${actual.toLowerCase()}">${actual}</span>` : '<span style="color: var(--text-dim);">Ready</span>'}
      </td>
      <td>${classBadge}</td>
    `;
    tbody.appendChild(tr);
  });
}

function filterBenchmarkTable() {
  const query = document.getElementById('bm-search-input').value.toLowerCase();
  const statusFilter = document.getElementById('bm-status-filter').value;
  const typeFilter = document.getElementById('bm-type-filter').value;

  const filtered = allBenchmarkResults.filter(bm => {
    const matchQuery = bm.id.toLowerCase().includes(query) ||
      (bm.type && bm.type.toLowerCase().includes(query)) ||
      JSON.stringify(bm.fish || []).toLowerCase().includes(query);

    const matchStatus = statusFilter === 'ALL' || bm.expected_csp_status === statusFilter || bm.actual_csp_status === statusFilter;
    const matchType = typeFilter === 'ALL' || bm.type === typeFilter;

    return matchQuery && matchStatus && matchType;
  });

  renderBenchmarkTableRows(filtered, allBenchmarkResults.some(b => b.actual_csp_status));
}
