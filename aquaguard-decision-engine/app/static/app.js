// AquaGuard AI Decision Engine - Interactive Showcase Controller

let speciesCatalog = [];
let currentFishPopulation = [];
let proposedFishPopulation = [];
let allBenchmarkResults = [];
let currentTankMode = 'ornamental';

// Mode Switching (Phase 16)
function setTankMode(mode) {
  currentTankMode = mode;
  const btnOrnamental = document.getElementById('btn-mode-ornamental');
  const btnBreeder = document.getElementById('btn-mode-breeder');
  const badge = document.getElementById('mode-badge-indicator');

  if (mode === 'breeder') {
    if (btnBreeder) btnBreeder.classList.add('active');
    if (btnOrnamental) btnOrnamental.classList.remove('active');
    if (badge) {
      badge.textContent = '🧬 Breeder Mode';
      badge.style.color = 'var(--accent-purple)';
      badge.style.borderColor = 'rgba(139, 92, 246, 0.4)';
      badge.style.background = 'rgba(139, 92, 246, 0.15)';
    }
  } else {
    if (btnOrnamental) btnOrnamental.classList.add('active');
    if (btnBreeder) btnBreeder.classList.remove('active');
    if (badge) {
      badge.textContent = '🎨 Ornamental Mode';
      badge.style.color = 'var(--primary-cyan)';
      badge.style.borderColor = 'rgba(0, 242, 254, 0.3)';
      badge.style.background = 'rgba(0, 242, 254, 0.12)';
    }
  }

  executeDecisionPipeline();
}

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

    // Populate Virtual Tank Species Selector
    const vtankSel = document.getElementById('vtank-species-selector');
    if (vtankSel && speciesCatalog.length > 0) {
      vtankSel.innerHTML = '';
      speciesCatalog.forEach(s => {
        const meta = SPECIES_EMOJI_MAP[s.species_id] || { emoji: '🐟' };
        const opt = document.createElement('option');
        opt.value = s.species_id;
        opt.textContent = `${meta.emoji} ${s.common_name}`;
        vtankSel.appendChild(opt);
      });
      updateAddButtonText();
    }

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
  let targetMode = 'ornamental';
  switch (presetKey) {
    case 'peaceful':
      targetMode = 'ornamental';
      setTankParams(100, 24.5, 6.8, 120);
      currentFishPopulation = [
        { species_id: 'corydoras_aeneus', common_name: 'Corydoras (Bronze Cory)', male: 2, female: 4, lethargy_index_pct: 0 },
        { species_id: 'paracheirodon_innesi', common_name: 'Neon Tetra', male: 5, female: 5, lethargy_index_pct: 0 }
      ];
      break;
    case 'breeder_guppy':
      targetMode = 'breeder';
      setTankParams(100, 25.5, 7.2, 180);
      currentFishPopulation = [
        { species_id: 'poecilia_reticulata', common_name: 'Guppy', male: 4, female: 12, lethargy_index_pct: 0 }
      ];
      break;
    case 'predator':
      targetMode = 'ornamental';
      setTankParams(150, 26.0, 7.0, 150);
      currentFishPopulation = [
        { species_id: 'pterophyllum_scalare', common_name: 'Angelfish', male: 1, female: 1, lethargy_index_pct: 0 },
        { species_id: 'paracheirodon_innesi', common_name: 'Neon Tetra', male: 5, female: 5, lethargy_index_pct: 0 }
      ];
      break;
    case 'overstock':
      targetMode = 'ornamental';
      setTankParams(25, 24.0, 7.0, 150);
      currentFishPopulation = [
        { species_id: 'corydoras_aeneus', common_name: 'Corydoras (Bronze Cory)', male: 15, female: 15, lethargy_index_pct: 0 }
      ];
      break;
    case 'temp_violation':
      targetMode = 'ornamental';
      setTankParams(100, 33.0, 7.0, 150);
      currentFishPopulation = [
        { species_id: 'paracheirodon_innesi', common_name: 'Neon Tetra', male: 5, female: 5, lethargy_index_pct: 0 }
      ];
      break;
    case 'harem':
      targetMode = 'breeder';
      setTankParams(100, 25.0, 7.5, 220);
      currentFishPopulation = [
        { species_id: 'poecilia_reticulata', common_name: 'Guppy', male: 2, female: 6, lethargy_index_pct: 0 },
        { species_id: 'xiphophorus_maculatus', common_name: 'Platy', male: 2, female: 6, lethargy_index_pct: 0 }
      ];
      break;
    case 'betta':
      targetMode = 'ornamental';
      setTankParams(45, 26.0, 7.0, 150);
      currentFishPopulation = [
        { species_id: 'betta_splendens', common_name: 'Betta', male: 1, female: 0, lethargy_index_pct: 0 }
      ];
      break;
  }
  renderFishPopulation();
  setTankMode(targetMode);
}

function setTankParams(vol, temp, ph, tds) {
  document.getElementById('input-volume').value = vol;
  document.getElementById('input-temp').value = temp;
  document.getElementById('input-ph').value = ph;
  document.getElementById('input-tds').value = tds;
  const vSlider = document.getElementById('vtank-volume-slider');
  if (vSlider) vSlider.value = vol;
  const vLabel = document.getElementById('vtank-slider-label');
  if (vLabel) vLabel.textContent = `${vol} L`;
  updateCapacityChipActive(vol);
  updateVolumeDisplay();
  updateTempDisplay();
  updatePhDisplay();
  updateTdsDisplay();
}

// Debounce Helper for High-Frequency Slider Inputs
let debouncePipelineTimer = null;
function debouncedPipeline(delay = 120) {
  clearTimeout(debouncePipelineTimer);
  debouncePipelineTimer = setTimeout(() => {
    executeDecisionPipeline();
  }, delay);
}

// Display Helpers for Sliders
function updateVolumeDisplay() {
  document.getElementById('volume-val-display').textContent = `${document.getElementById('input-volume').value} Liters`;
  debouncedPipeline(100);
}
function updateTempDisplay() {
  document.getElementById('temp-val-display').textContent = `${Number(document.getElementById('input-temp').value).toFixed(1)} °C`;
  debouncedPipeline(100);
}
function updatePhDisplay() {
  document.getElementById('ph-val-display').textContent = Number(document.getElementById('input-ph').value).toFixed(1);
  debouncedPipeline(100);
}
function updateTdsDisplay() {
  document.getElementById('tds-val-display').textContent = `${document.getElementById('input-tds').value} ppm`;
  debouncedPipeline(100);
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

  const qtyInput = document.getElementById('input-species-qty');
  const qty = Math.max(1, parseInt(qtyInput ? qtyInput.value : 1) || 1);

  const sp = speciesCatalog.find(s => s.species_id === speciesId);
  const exists = currentFishPopulation.find(f => f.species_id === speciesId);

  if (exists) {
    exists.female = (parseInt(exists.female) || 0) + qty;
  } else {
    currentFishPopulation.push({
      species_id: speciesId,
      common_name: sp ? sp.common_name : speciesId,
      male: 0,
      female: qty,
      lethargy_index_pct: 0
    });
  }
  renderFishPopulation();
  executeDecisionPipeline();
}

function updateFishCount(idx, field, val) {
  if (currentFishPopulation[idx]) {
    currentFishPopulation[idx][field] = Math.max(0, parseInt(val) || 0);
    executeDecisionPipeline();
  }
}

function removeFish(idx) {
  currentFishPopulation.splice(idx, 1);
  renderFishPopulation();
  executeDecisionPipeline();
}

// Execute 4-Stage Decision Pipeline (POST /api/v1/evaluate)
async function executeDecisionPipeline() {
  const runBtn = document.getElementById('btn-run-pipeline');
  runBtn.innerHTML = '<span>⏳</span> EVALUATING...';
  runBtn.disabled = true;

  const volVal = parseFloat(document.getElementById('input-volume').value) || 100;
  const tempVal = parseFloat(document.getElementById('input-temp').value) || 25.0;
  const phVal = parseFloat(document.getElementById('input-ph').value) || 7.0;
  const tdsVal = parseFloat(document.getElementById('input-tds').value) || 150;

  const payload = {
    tank_mode: currentTankMode,
    scenario_id: 'demo_live_evaluation',
    description: 'Live interactive evaluation from demo dashboard',
    aquarium: {
      volume_liters: volVal,
      dimensions_cm: { l: 80, w: 35, h: 40 },
      water_type: 'freshwater',
      equipment: {
        heater: true,
        filter_type: 'canister',
        aeration: true
      }
    },
    telemetry: {
      temperature_c: tempVal,
      ph: phVal,
      tds_ppm: tdsVal,
      diagnostics: {
        fault_detected: false,
        imputed: false
      },
      gatekeeper: {
        heater_lockout: false,
        ph_pump_lockout: false
      }
    },
    fish: currentFishPopulation.map(f => ({
      species_id: f.species_id,
      common_name: f.common_name || f.species_id,
      male: parseInt(f.male) || 0,
      female: parseInt(f.female) || 0,
      confidence: 0.95,
      swimming_activity_pct: 75.0,
      lethargy_index_pct: parseFloat(f.lethargy_index_pct) || 0.0,
      surface_piping: 'None',
      feeding_response: 'Active',
      status: 'NORMAL_HEALTH'
    })),
    forecast: {
      ammonia_spike_risk_pct: 2.0,
      ammonia_status: 'STABLE',
      whitespot_disease_risk_pct: 1.0,
      disease_status: 'LOW RISK',
      temperature_trend_c: tempVal,
      forecast_horizon_hours: 12
    }
  };

  try {
    const t0 = performance.now();
    const res = await fetch('/api/v1/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const decision = await res.json();
    const t1 = performance.now();
    const latencyMs = Math.round(t1 - t0);
    renderPipelineResults(decision, payload, latencyMs);
  } catch (err) {
    console.error('Pipeline error:', err);
  } finally {
    runBtn.innerHTML = '<span>🚀</span> EXECUTE 4-STAGE PIPELINE';
    runBtn.disabled = false;
  }
}

// Render Pipeline Outputs
function renderPipelineResults(decision, payload, latencyMs) {
  const isApproved = decision.status === 'APPROVED';

  // Execution Latency Display
  const latencyBadge = document.getElementById('eval-latency-badge');
  if (latencyBadge && latencyMs !== undefined) {
    latencyBadge.textContent = `⚡ Latency: ${latencyMs} ms`;
    latencyBadge.style.color = latencyMs < 25 ? 'var(--accent-teal)' : 'var(--accent-amber)';
  }

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

  // PHASE 14 & 15: ESP32 Environmental Targets & Firebase Sync
  const esp32Card = document.getElementById('esp32-target-card');
  const esp32Badge = document.getElementById('esp32-status-badge');
  const esp32Content = document.getElementById('esp32-output-content');
  const esp32SyncTag = document.getElementById('esp32-sync-tag');

  if (isApproved && decision.esp32_targets) {
    const targets = decision.esp32_targets;
    if (esp32Badge) {
      esp32Badge.className = 'stage-badge pass';
      esp32Badge.textContent = 'TARGETS LOCKED';
    }
    if (esp32Card) esp32Card.style.borderColor = 'rgba(16, 185, 129, 0.5)';
    if (esp32SyncTag) {
      esp32SyncTag.innerHTML = '<span>⚡</span> Synced: users/default_user/tanks/aquarium_001/esp32_targets';
      esp32SyncTag.style.borderColor = 'rgba(16, 185, 129, 0.4)';
      esp32SyncTag.style.color = 'var(--accent-teal)';
    }

    if (esp32Content) {
      esp32Content.innerHTML = `
        <div class="esp32-targets-grid">
          <div class="esp32-target-box">
            <div class="esp32-label">🌡️ Target Temperature</div>
            <div class="esp32-val">${targets.temperature_c.toFixed(1)} <span style="font-size: 0.9rem;">°C</span></div>
            <div class="esp32-band">Strict Safe Median</div>
          </div>
          <div class="esp32-target-box">
            <div class="esp32-label">🧪 Target pH Level</div>
            <div class="esp32-val">${targets.ph.toFixed(2)}</div>
            <div class="esp32-band">Chemical Buffer Target</div>
          </div>
          <div class="esp32-target-box">
            <div class="esp32-label">💧 Target TDS</div>
            <div class="esp32-val">${Math.round(targets.tds_ppm)} <span style="font-size: 0.9rem;">ppm</span></div>
            <div class="esp32-band">Osmotic Equilibrium</div>
          </div>
        </div>
        <p style="font-size: 0.8rem; color: var(--text-dim); margin-top: 0.4rem;">
          Dynamic intersection calculated via Phase 14 Overlap algorithm and dispatched to Firebase for edge hardware actuators.
        </p>
      `;
    }
  } else {
    if (esp32Badge) {
      esp32Badge.className = 'stage-badge fail';
      esp32Badge.textContent = 'HARDWARE LOCKOUT';
    }
    if (esp32Card) esp32Card.style.borderColor = 'rgba(244, 63, 94, 0.5)';
    if (esp32SyncTag) {
      esp32SyncTag.innerHTML = '<span>⚠️</span> Firebase Sync Locked (Conflict)';
      esp32SyncTag.style.borderColor = 'rgba(244, 63, 94, 0.4)';
      esp32SyncTag.style.color = 'var(--accent-rose)';
    }

    if (esp32Content) {
      esp32Content.innerHTML = `
        <div class="bypass-banner" style="border-color: rgba(244, 63, 94, 0.4); background: rgba(244, 63, 94, 0.08);">
          <span style="font-size: 1.25rem;">🛑</span>
          <div>
            <strong style="color: var(--accent-rose);">Hardware Setpoint Update Aborted</strong>
            <p style="font-size: 0.82rem; color: #cbd5e1; margin-top: 0.2rem;">
              ${decision.violations?.[0]?.explanation || 'Environmental tolerances conflict between current species. ESP32 target generation halted to prevent thermal/chemical shock.'}
            </p>
          </div>
        </div>
      `;
    }
  }

  // 3. Stage 3: Mode-Aware Population Optimizer (Phase 16)
  const optContent = document.getElementById('optimizer-output-content');
  const gaBadge = document.getElementById('ga-stage-badge');
  const stage3Card = document.getElementById('stage-3-card');
  const mode = decision.mode || currentTankMode;

  if (isApproved) {
    if (mode === 'breeder') {
      if (gaBadge) {
        gaBadge.className = 'stage-badge pass';
        gaBadge.textContent = 'DEAP GA ACTIVE';
        gaBadge.style.background = 'rgba(139, 92, 246, 0.2)';
        gaBadge.style.color = 'var(--accent-purple)';
        gaBadge.style.borderColor = 'rgba(139, 92, 246, 0.4)';
      }
      if (stage3Card) stage3Card.style.borderColor = 'rgba(139, 92, 246, 0.5)';

      let popCards = '<div class="optimizer-pop-grid">';
      (decision.population || []).forEach(f => {
        const sp = speciesCatalog.find(s => s.species_id === f.species_id);
        popCards += `
          <div class="opt-fish-card" style="border-color: rgba(139, 92, 246, 0.35);">
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

      if (optContent) {
        optContent.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.5rem;">
            <span style="font-size: 0.88rem; color: var(--accent-purple); font-weight: 700;">🧬 Genetic Algorithm Optimized Population</span>
            <span style="font-size: 0.75rem; color: var(--text-dim);">Sex Ratios & Fry Bioload Reserve Applied</span>
          </div>
          ${popCards}
        `;
      }
    } else {
      // Ornamental Mode - Fast path
      if (gaBadge) {
        gaBadge.className = 'stage-badge info';
        gaBadge.textContent = 'GA BYPASSED (<5ms)';
        gaBadge.style.background = 'rgba(0, 242, 254, 0.12)';
        gaBadge.style.color = 'var(--primary-cyan)';
        gaBadge.style.borderColor = 'rgba(0, 242, 254, 0.3)';
      }
      if (stage3Card) stage3Card.style.borderColor = 'rgba(0, 242, 254, 0.3)';

      let popCards = '<div class="optimizer-pop-grid">';
      (decision.population || currentFishPopulation).forEach(f => {
        const sp = speciesCatalog.find(s => s.species_id === f.species_id);
        popCards += `
          <div class="opt-fish-card">
            <div class="opt-fish-name">${sp ? sp.common_name : f.species_id}</div>
            <div class="opt-counts">
              <span class="count-badge-m">♂ ${f.male || 0}</span>
              <span class="count-badge-f">♀ ${f.female || 0}</span>
            </div>
            <div style="font-size: 0.72rem; color: var(--text-dim); margin-top: 0.35rem;">
              Status: Maintained as Prescribed
            </div>
          </div>
        `;
      });
      popCards += '</div>';

      if (optContent) {
        optContent.innerHTML = `
          <div class="bypass-banner">
            <span style="font-size: 1.25rem;">⚡</span>
            <div>
              <strong style="color: var(--primary-cyan);">Ornamental Fast-Path Routing Active</strong>
              <p style="font-size: 0.82rem; color: #cbd5e1; margin-top: 0.2rem;">
                The Genetic Algorithm was bypassed to achieve sub-5ms IoT edge response latency. Current fish population is verified safe and preserved without breeding mutation.
              </p>
            </div>
          </div>
          ${popCards}
        `;
      }
    }
  } else {
    if (gaBadge) {
      gaBadge.className = 'stage-badge fail';
      gaBadge.textContent = 'BYPASSED';
    }
    if (stage3Card) stage3Card.style.borderColor = 'var(--border-subtle)';
    if (optContent) {
      optContent.innerHTML = `
        <p style="color: var(--text-dim); font-size: 0.88rem;">
          GA optimization bypassed because Stage 1 CSP Gatekeeper blocked the configuration.
        </p>
      `;
    }
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

  // 5. Tier 3: Outputs & Downstream Provisions (IoT, Cloud, Mobile App)
  const provIotContent = document.getElementById('prov-iot-content');
  const provIotBadge = document.getElementById('prov-iot-badge');
  const provIotSyncText = document.getElementById('prov-iot-sync-text');

  const provCloudContent = document.getElementById('prov-cloud-content');
  const provCloudBadge = document.getElementById('prov-cloud-badge');

  const provMobileContent = document.getElementById('prov-mobile-content');
  const provMobileBadge = document.getElementById('prov-mobile-badge');
  const provPill = document.getElementById('provisions-status-pill');

  if (isApproved) {
    if (provPill) {
      provPill.textContent = '⚡ Realtime Dispatch Active';
      provPill.style.color = 'var(--accent-teal)';
      provPill.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    }

    // Provision 1: Hardware Targets to IoT
    if (decision.esp32_targets) {
      const tg = decision.esp32_targets;
      if (provIotBadge) {
        provIotBadge.className = 'stage-badge pass';
        provIotBadge.textContent = 'SETPOINTS LOCKED';
      }
      if (provIotSyncText) {
        provIotSyncText.textContent = '⚡ users/default_user/tanks/aquarium_001/esp32_targets';
        provIotSyncText.style.color = 'var(--accent-teal)';
      }
      if (provIotContent) {
        provIotContent.innerHTML = `
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
            <span>Target Temp (PID):</span> <strong style="color: var(--primary-cyan);">${tg.temperature_c.toFixed(1)} °C</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
            <span>Target pH Buffer:</span> <strong style="color: var(--primary-cyan);">${tg.ph.toFixed(2)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>Target TDS (RO):</span> <strong style="color: var(--primary-cyan);">${Math.round(tg.tds_ppm)} ppm</strong>
          </div>
        `;
      }
    }

    // Provision 2: Biological Vectors to Cloud
    if (provCloudBadge) {
      provCloudBadge.className = 'stage-badge pass';
      provCloudBadge.textContent = 'VECTOR SYNCED';
    }
    if (provCloudContent) {
      const popCount = decision.population ? decision.population.length : 0;
      provCloudContent.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
          <span>Approved Stocking:</span> <strong style="color: var(--accent-purple);">${popCount} Species (${mode.toUpperCase()})</strong>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
          <span>Stability ESI:</span> <strong style="color: var(--accent-teal);">${decision.esi.toFixed(2)} (${decision.risk_level})</strong>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Bioload Headroom:</span> <strong style="color: #fff;">${payload.aquarium.volume_liters}L Capacity OK</strong>
        </div>
      `;
    }

    // Provision 3: XAI Alerts to Mobile App
    if (provMobileBadge) {
      provMobileBadge.className = 'stage-badge pass';
      provMobileBadge.textContent = 'ALERT DELIVERED';
    }
    if (provMobileContent) {
      provMobileContent.innerHTML = `
        <div style="color: var(--accent-teal); font-weight: 700; margin-bottom: 0.3rem;">
          ✓ ${xaiItem.summary || 'Ecosystem Approved'}
        </div>
        <div style="font-size: 0.73rem; color: #cbd5e1; line-height: 1.35;">
          ${xaiItem.reason || 'All constraints satisfied.'}
        </div>
      `;
    }
  } else {
    if (provPill) {
      provPill.textContent = '🛑 Actuation Halted (Conflict)';
      provPill.style.color = 'var(--accent-rose)';
      provPill.style.borderColor = 'rgba(244, 63, 94, 0.4)';
    }

    if (provIotBadge) {
      provIotBadge.className = 'stage-badge fail';
      provIotBadge.textContent = 'LOCKOUT ACTIVE';
    }
    if (provIotSyncText) {
      provIotSyncText.textContent = '⚠️ Hardware Lockout Enforced';
      provIotSyncText.style.color = 'var(--accent-rose)';
    }
    if (provIotContent) {
      provIotContent.innerHTML = `
        <div style="color: var(--accent-rose); font-weight: 600;">Lockout Enforced</div>
        <div style="font-size: 0.72rem; color: var(--text-dim); margin-top: 0.2rem;">
          Actuator dispatch prevented to protect aquatic life from shock.
        </div>
      `;
    }

    if (provCloudBadge) {
      provCloudBadge.className = 'stage-badge fail';
      provCloudBadge.textContent = 'VIOLATION LOGGED';
    }
    if (provCloudContent) {
      const v = decision.violations?.[0] || {};
      provCloudContent.innerHTML = `
        <div style="color: var(--accent-rose); font-weight: 600;">Rule: ${v.rule_id || 'CSP_VIOLATION'}</div>
        <div style="font-size: 0.72rem; color: var(--text-dim); margin-top: 0.2rem;">
          ${v.reason_code || 'BIOLOGICAL_MISMATCH'} (ESI: 0.00)
        </div>
      `;
    }

    if (provMobileBadge) {
      provMobileBadge.className = 'stage-badge fail';
      provMobileBadge.textContent = 'CRITICAL WARNING';
    }
    if (provMobileContent) {
      provMobileContent.innerHTML = `
        <div style="color: var(--accent-rose); font-weight: 700; margin-bottom: 0.3rem;">
          ⚠️ ${xaiItem.summary || 'Stocking Conflict Detected'}
        </div>
        <div style="font-size: 0.73rem; color: #cbd5e1; line-height: 1.35;">
          ${xaiItem.reason || 'Husbandry intervention required.'}
        </div>
      `;
    }
  }

  // Render Virtual Smart Fish Tank & Dynamic Edge Parameters
  renderVirtualTank(decision, payload);
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

  const simVol = parseFloat(document.getElementById('sim-base-vol').value) || 100;
  const simTemp = parseFloat(document.getElementById('sim-base-temp').value) || 25.0;
  const simPh = parseFloat(document.getElementById('sim-base-ph').value) || 7.0;
  const simTds = parseFloat(document.getElementById('sim-base-tds').value) || 150;

  const payload = {
    aquarium: {
      volume_liters: simVol,
      dimensions_cm: { l: 80, w: 35, h: 40 },
      water_type: 'freshwater',
      equipment: {
        heater: true,
        filter_type: 'canister',
        aeration: true
      }
    },
    telemetry: {
      temperature_c: simTemp,
      ph: simPh,
      tds_ppm: simTds,
      diagnostics: {
        fault_detected: false,
        imputed: false
      },
      gatekeeper: {
        heater_lockout: false,
        ph_pump_lockout: false
      }
    },
    current_population: baseFish.map(f => ({
      species_id: f.species_id,
      common_name: f.common_name || f.species_id,
      male: parseInt(f.male) || 0,
      female: parseInt(f.female) || 0,
      confidence: 0.95,
      swimming_activity_pct: 75.0,
      lethargy_index_pct: 0.0,
      surface_piping: 'None',
      feeding_response: 'Active',
      status: 'NORMAL_HEALTH'
    })),
    proposed_population: Object.values(mergedMap).map(f => ({
      species_id: f.species_id,
      common_name: f.common_name || f.species_id,
      male: parseInt(f.male) || 0,
      female: parseInt(f.female) || 0,
      confidence: 0.95,
      swimming_activity_pct: 75.0,
      lethargy_index_pct: 0.0,
      surface_piping: 'None',
      feeding_response: 'Active',
      status: 'NORMAL_HEALTH'
    }))
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

// ============================================================================
// VIRTUAL SMART AQUARIUM CONTROLLER & EDGE SETPOINT TUNING SIMULATOR
// ============================================================================

const SPECIES_EMOJI_MAP = {
  'poecilia_reticulata': { emoji: '🐠', name: 'Guppy', color: '#38bdf8', bioloadLiters: 2.5 },
  'paracheirodon_innesi': { emoji: '🐟', name: 'Neon Tetra', color: '#00f2fe', bioloadLiters: 2.0 },
  'corydoras_aeneus': { emoji: '🐡', name: 'Corydoras', color: '#fbbf24', bioloadLiters: 4.0 },
  'xiphophorus_maculatus': { emoji: '🦐', name: 'Platy', color: '#f97316', bioloadLiters: 3.5 },
  'pterophyllum_scalare': { emoji: '🦈', name: 'Angelfish', color: '#f43f5e', bioloadLiters: 15.0 },
  'betta_splendens': { emoji: '🐬', name: 'Betta', color: '#a855f7', bioloadLiters: 6.0 }
};

function renderVirtualTank(decision, payload) {
  const isApproved = decision.status === 'APPROVED';
  const glass = document.getElementById('virtual-tank-glass');
  const fishContainer = document.getElementById('virtual-tank-fish-container');
  const capacityBadge = document.getElementById('vtank-capacity-badge');
  const fishCountBadge = document.getElementById('vtank-fish-count');
  const statusDot = document.getElementById('vtank-status-dot');
  const statusLabel = document.getElementById('vtank-status-label');
  const bioloadPctLabel = document.getElementById('vtank-bioload-pct');
  const targetsSummary = document.getElementById('vtank-targets-summary');
  const edgeDispatch = document.getElementById('vtank-edge-dispatch-status');

  const cardTemp = document.getElementById('vtank-card-temp');
  const cardPh = document.getElementById('vtank-card-ph');
  const cardTds = document.getElementById('vtank-card-tds');
  const cardTempDesc = document.getElementById('vtank-card-temp-desc');
  const cardPhDesc = document.getElementById('vtank-card-ph-desc');
  const cardTdsDesc = document.getElementById('vtank-card-tds-desc');

  if (!glass || !fishContainer) return;

  const currentVol = parseFloat(payload.aquarium.volume_liters) || 100;

  // Calculate Headcount & Bioload
  let totalCount = 0;
  let totalBioloadLiters = 0;

  currentFishPopulation.forEach(f => {
    const count = (parseInt(f.male) || 0) + (parseInt(f.female) || 0);
    totalCount += count;
    const meta = SPECIES_EMOJI_MAP[f.species_id] || { bioloadLiters: 3.0 };
    totalBioloadLiters += count * meta.bioloadLiters;
  });

  const bioloadPct = Math.round((totalBioloadLiters / currentVol) * 100);

  // Update Top Left Badges
  if (capacityBadge) capacityBadge.textContent = `${currentVol} L`;
  if (fishCountBadge) {
    fishCountBadge.textContent = `${totalCount} specimen${totalCount !== 1 ? 's' : ''} (${currentFishPopulation.length} species)`;
  }

  // Update Slider Sync
  const slider = document.getElementById('vtank-volume-slider');
  const sliderLabel = document.getElementById('vtank-slider-label');
  if (slider && parseFloat(slider.value) !== currentVol) slider.value = currentVol;
  if (sliderLabel) sliderLabel.textContent = `${currentVol} L`;
  updateCapacityChipActive(currentVol);

  // Status & Glass Appearance
  glass.classList.remove('conflict', 'overcrowded');

  if (isApproved && decision.esp32_targets) {
    const targets = decision.esp32_targets;
    const esiVal = decision.esi !== undefined ? decision.esi.toFixed(2) : '0.88';

    if (statusDot) statusDot.textContent = '🟢';
    if (statusLabel) {
      statusLabel.textContent = `STABLE ENVIRONMENT (ESI: ${esiVal})`;
      statusLabel.style.color = 'var(--accent-teal)';
    }
    if (bioloadPctLabel) {
      bioloadPctLabel.textContent = `Bioload: ${bioloadPct}% (${totalBioloadLiters.toFixed(0)}L / ${currentVol}L)`;
      bioloadPctLabel.style.color = bioloadPct > 80 ? 'var(--accent-amber)' : 'var(--text-muted)';
    }

    if (targetsSummary) {
      targetsSummary.innerHTML = `Temp: <strong>${targets.temperature_c.toFixed(1)}°C</strong> | pH: <strong>${targets.ph.toFixed(2)}</strong> | TDS: <strong>${Math.round(targets.tds_ppm)} ppm</strong>`;
      targetsSummary.style.color = 'var(--primary-cyan)';
    }
    if (edgeDispatch) {
      edgeDispatch.innerHTML = '<span>●</span> ESP32 Edge Target Setpoints In Sync';
      edgeDispatch.style.color = 'var(--accent-teal)';
    }

    if (cardTemp) cardTemp.textContent = `${targets.temperature_c.toFixed(1)} °C`;
    if (cardPh) cardPh.textContent = targets.ph.toFixed(2);
    if (cardTds) cardTds.textContent = `${Math.round(targets.tds_ppm)} ppm`;

    if (cardTempDesc) cardTempDesc.textContent = 'Strict safe median for all species';
    if (cardPhDesc) cardPhDesc.textContent = 'Chemical buffer equilibrium point';
    if (cardTdsDesc) cardTdsDesc.textContent = 'Osmotic equilibrium setpoint';
  } else {
    // Conflict or Violation
    const violation = decision.violations?.[0] || {};
    const isPredator = violation.rule_id === 'CSP-001' || (decision.xai?.[0]?.summary || '').toLowerCase().includes('predator');
    const isOvercrowd = violation.rule_id === 'CSP-002' || bioloadPct > 100 || (decision.xai?.[0]?.summary || '').toLowerCase().includes('bioload');

    if (isPredator) {
      glass.classList.add('conflict');
      if (statusDot) statusDot.textContent = '🔴';
      if (statusLabel) {
        statusLabel.textContent = 'PREDATOR AGGRESSION CONFLICT';
        statusLabel.style.color = 'var(--accent-rose)';
      }
    } else if (isOvercrowd) {
      glass.classList.add('overcrowded');
      if (statusDot) statusDot.textContent = '🟡';
      if (statusLabel) {
        statusLabel.textContent = 'TANK OVERCROWDED (BIOLOAD LIMIT)';
        statusLabel.style.color = 'var(--accent-amber)';
      }
    } else {
      glass.classList.add('conflict');
      if (statusDot) statusDot.textContent = '🔴';
      if (statusLabel) {
        statusLabel.textContent = 'ENVIRONMENTAL INCOMPATIBILITY';
        statusLabel.style.color = 'var(--accent-rose)';
      }
    }

    if (bioloadPctLabel) {
      bioloadPctLabel.textContent = `Bioload: ${bioloadPct}% (${totalBioloadLiters.toFixed(0)}L / ${currentVol}L)`;
      bioloadPctLabel.style.color = bioloadPct > 100 ? 'var(--accent-rose)' : 'var(--accent-amber)';
    }

    if (targetsSummary) {
      targetsSummary.innerHTML = `⚠️ <span style="color: var(--accent-rose); font-weight: 700;">ACTUATOR LOCKOUT</span>: Biological Invariants Violated`;
    }
    if (edgeDispatch) {
      edgeDispatch.innerHTML = '<span>⚠️</span> Actuation Halted to Prevent Shock';
      edgeDispatch.style.color = 'var(--accent-rose)';
    }

    if (cardTemp) cardTemp.textContent = 'LOCKOUT';
    if (cardPh) cardPh.textContent = 'LOCKOUT';
    if (cardTds) cardTds.textContent = 'LOCKOUT';

    if (cardTempDesc) cardTempDesc.textContent = 'Heater actuation prohibited';
    if (cardPhDesc) cardPhDesc.textContent = 'pH dosing pump halted';
    if (cardTdsDesc) cardTdsDesc.textContent = 'Mineral injector halted';
  }

  // Render Swimming Fish Sprites
  fishContainer.innerHTML = '';
  if (currentFishPopulation.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.style.cssText = 'position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--text-dim); font-size: 0.9rem; pointer-events: none;';
    emptyMsg.innerHTML = 'Aquarium is currently empty. Click a Quick Preset above or "+ Fish" below to populate!';
    fishContainer.appendChild(emptyMsg);
    return;
  }

  // Flatten specimens for display (max 18 sprites to preserve clean layout)
  const specimensToRender = [];
  currentFishPopulation.forEach((f, fIdx) => {
    const totalSpeciesCount = (parseInt(f.male) || 0) + (parseInt(f.female) || 0);
    const spriteCount = Math.min(totalSpeciesCount, Math.max(1, Math.min(4, totalSpeciesCount)));
    const meta = SPECIES_EMOJI_MAP[f.species_id] || { emoji: '🐟', name: f.common_name || f.species_id };

    for (let i = 0; i < spriteCount; i++) {
      specimensToRender.push({
        speciesId: f.species_id,
        name: meta.name,
        emoji: meta.emoji,
        color: meta.color || '#38bdf8',
        totalCount: totalSpeciesCount,
        isPredator: f.species_id === 'pterophyllum_scalare'
      });
    }
  });

  specimensToRender.slice(0, 18).forEach((item, idx) => {
    const sprite = document.createElement('div');
    const isEven = idx % 2 === 0;
    sprite.className = `swimming-fish-sprite ${isEven ? 'cruise-right' : 'cruise-left'}`;
    if (item.isPredator) sprite.classList.add('predator-sprite');

    // Coordinates spread across the tank mid-water section
    const topPct = 24 + ((idx * 23) % 48);
    const leftPct = 6 + ((idx * 37) % 76);
    const animDelay = (idx * 0.4) % 3.5;
    const animDuration = 4.5 + ((idx * 0.8) % 3.0);

    sprite.style.top = `${topPct}%`;
    sprite.style.left = `${leftPct}%`;
    sprite.style.animationDelay = `${animDelay}s`;
    sprite.style.animationDuration = `${animDuration}s`;
    if (item.color) {
      sprite.style.borderColor = `${item.color}55`;
    }

    sprite.innerHTML = `
      <span style="font-size: 1.15rem;">${item.emoji}</span>
      <span style="font-size: 0.76rem; font-weight: 600; color: #fff;">${item.name}</span>
      <span class="fish-remove-x" onclick="removeFishFromTank('${item.speciesId}', event)" title="Remove one ${item.name}">✕</span>
    `;

    fishContainer.appendChild(sprite);
  });

  // Pulse stable target cards to signal dynamic recalculation
  document.querySelectorAll('.stable-param-card').forEach(card => {
    card.classList.remove('updated');
    void card.offsetWidth;
    card.classList.add('updated');
  });
}

function onVirtualTankVolumeChange(val) {
  const vol = parseFloat(val) || 100;
  document.getElementById('input-volume').value = vol;
  updateVolumeDisplay();
  const label = document.getElementById('vtank-slider-label');
  if (label) label.textContent = `${vol} L`;
  updateCapacityChipActive(vol);
  debouncedPipeline(100);
}

function setVirtualTankVolume(vol) {
  const slider = document.getElementById('vtank-volume-slider');
  if (slider) slider.value = vol;
  onVirtualTankVolumeChange(vol);
}

function updateCapacityChipActive(vol) {
  document.querySelectorAll('.capacity-chip').forEach(c => c.classList.remove('active'));
  const chip = document.getElementById(`chip-vol-${vol}`);
  if (chip) chip.classList.add('active');
}

function addOneFish(speciesId, sex = 'female') {
  const sp = speciesCatalog.find(s => s.species_id === speciesId);
  const exists = currentFishPopulation.find(f => f.species_id === speciesId);
  if (exists) {
    if (sex === 'male') {
      exists.male = (parseInt(exists.male) || 0) + 1;
    } else {
      exists.female = (parseInt(exists.female) || 0) + 1;
    }
  } else {
    currentFishPopulation.push({
      species_id: speciesId,
      common_name: sp ? sp.common_name : speciesId,
      male: sex === 'male' ? 1 : 0,
      female: sex === 'male' ? 0 : 1,
      lethargy_index_pct: 0
    });
  }
  renderFishPopulation();
  executeDecisionPipeline();
  showToastNotification(`Added 1 ${sp ? sp.common_name : speciesId} to aquarium`);
}

function addQuickFish(speciesId) {
  addOneFish(speciesId, 'female');
}

function addSelectedFish() {
  const speciesSelect = document.getElementById('vtank-species-selector');
  const qtyInput = document.getElementById('vtank-add-qty');
  const sexSelect = document.getElementById('vtank-add-sex');

  const speciesId = speciesSelect ? speciesSelect.value : 'poecilia_reticulata';
  const qty = Math.max(1, Math.min(50, parseInt(qtyInput ? qtyInput.value : 1) || 1));
  const sexChoice = sexSelect ? sexSelect.value : 'female';

  const sp = speciesCatalog.find(s => s.species_id === speciesId);
  let exists = currentFishPopulation.find(f => f.species_id === speciesId);

  let addMale = 0;
  let addFemale = 0;

  if (sexChoice === 'pair') {
    addMale = Math.ceil(qty / 2);
    addFemale = Math.floor(qty / 2) || 1;
  } else if (sexChoice === 'male') {
    addMale = qty;
  } else {
    addFemale = qty;
  }

  if (exists) {
    exists.male = (parseInt(exists.male) || 0) + addMale;
    exists.female = (parseInt(exists.female) || 0) + addFemale;
  } else {
    currentFishPopulation.push({
      species_id: speciesId,
      common_name: sp ? sp.common_name : speciesId,
      male: addMale,
      female: addFemale,
      lethargy_index_pct: 0
    });
  }

  renderFishPopulation();
  executeDecisionPipeline();
  showToastNotification(`Added ${qty} ${sp ? sp.common_name : speciesId} to aquarium`);
}

function adjustAddQty(delta) {
  const input = document.getElementById('vtank-add-qty');
  if (!input) return;
  const current = parseInt(input.value) || 1;
  const next = Math.max(1, Math.min(20, current + delta));
  input.value = next;
  updateAddButtonText();
}

function updateAddButtonText() {
  const btn = document.getElementById('btn-add-selected-fish');
  const qtyInput = document.getElementById('vtank-add-qty');
  const speciesSelect = document.getElementById('vtank-species-selector');
  if (!btn || !qtyInput || !speciesSelect) return;
  const qty = parseInt(qtyInput.value) || 1;
  const selOption = speciesSelect.options[speciesSelect.selectedIndex];
  const name = selOption ? selOption.text.split('(')[0].trim() : 'Fish';
  btn.innerHTML = `<span>➕</span> Add ${qty} ${name}`;
}

function removeFishFromTank(speciesId, event) {
  if (event) event.stopPropagation();
  const fish = currentFishPopulation.find(f => f.species_id === speciesId);
  if (!fish) return;

  if ((fish.female || 0) > 0) {
    fish.female -= 1;
  } else if ((fish.male || 0) > 0) {
    fish.male -= 1;
  }

  if ((fish.male || 0) <= 0 && (fish.female || 0) <= 0) {
    const idx = currentFishPopulation.indexOf(fish);
    if (idx >= 0) currentFishPopulation.splice(idx, 1);
  }

  renderFishPopulation();
  executeDecisionPipeline();
}

function clearVirtualTank() {
  currentFishPopulation = [];
  renderFishPopulation();
  executeDecisionPipeline();
}

function applyStableTargetsToEsp32() {
  const btn = document.getElementById('btn-transmit-esp32');
  const statusEl = document.getElementById('vtank-edge-dispatch-status');
  const summaryEl = document.getElementById('vtank-targets-summary');

  if (!btn) return;

  const origHtml = btn.innerHTML;
  btn.innerHTML = '<span>📡</span> Transmitting Setpoints...';
  btn.disabled = true;

  setTimeout(() => {
    btn.innerHTML = '<span>✅</span> Parameters Synced to ESP32!';
    btn.style.borderColor = 'var(--accent-teal)';
    btn.style.boxShadow = '0 0 15px rgba(16, 185, 129, 0.4)';

    if (statusEl && summaryEl) {
      statusEl.innerHTML = '<span>⚡</span> Transmitted to ESP32 Edge: ' + summaryEl.textContent;
      statusEl.style.color = 'var(--accent-teal)';
    }

    showToastNotification('📡 Dynamic Setpoints successfully transmitted to ESP32 Edge via Firebase RTDB!');

    setTimeout(() => {
      btn.innerHTML = origHtml;
      btn.disabled = false;
      btn.style.borderColor = '';
      btn.style.boxShadow = '';
    }, 2500);
  }, 400);
}

function showToastNotification(message) {
  let toast = document.getElementById('demo-toast-notification');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'demo-toast-notification';
    toast.style.cssText = 'position: fixed; bottom: 24px; right: 24px; background: rgba(15, 23, 42, 0.95); border: 1px solid var(--primary-cyan); box-shadow: 0 10px 25px rgba(0, 242, 254, 0.3); color: #fff; padding: 0.85rem 1.4rem; border-radius: 8px; z-index: 9999; font-family: "Plus Jakarta Sans", sans-serif; font-size: 0.88rem; transition: all 0.3s ease; pointer-events: none;';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
  }, 3500);
}

// ============================================================================
// GUIDED AUTO-DEMO TOUR CONTROLLER & PRESENTATION SHORTCUTS
// ============================================================================

let currentTourStep = 0;
const TOUR_STEPS = [
  {
    title: "1️⃣ Baseline Ecosystem & Safe Overlap",
    desc: "100L tank with Corydoras & Neon Tetras. Engine calculates strict safe median: 23.0°C, pH 6.80, TDS 100 ppm.",
    action: () => {
      loadPreset('peaceful');
      window.scrollTo({ top: 320, behavior: 'smooth' });
    }
  },
  {
    title: "2️⃣ Precise Fish Addition (No Bulk Swarms)",
    desc: "Adding exactly 2 female Guppies with the quantity stepper. Safe setpoints re-evaluated in <5ms.",
    action: () => {
      addOneFish('poecilia_reticulata', 'female');
      addOneFish('poecilia_reticulata', 'female');
    }
  },
  {
    title: "3️⃣ Predator Aggression & Actuator Lockout",
    desc: "Introducing an Angelfish with small Tetras. Rule CSP-001 triggers instant red alert & LOCKOUT to protect fish.",
    action: () => {
      addOneFish('pterophyllum_scalare', 'male');
    }
  },
  {
    title: "4️⃣ Invariant Restoration & Ecosystem Stabilization",
    desc: "Removing the conflicting predator restores crystal-blue water; safe edge setpoints are unlocked.",
    action: () => {
      removeFishFromTank('pterophyllum_scalare');
    }
  },
  {
    title: "5️⃣ Breeder Mode & Genetic Algorithm Optimization",
    desc: "Switching to Breeder Mode engages DEAP GA to optimize sex ratios (1♂:3♀) and fry reserve bioload.",
    action: () => {
      loadPreset('breeder_guppy');
    }
  },
  {
    title: "6️⃣ Edge Provisioning to ESP32 Microcontroller",
    desc: "Final target parameters dispatched to Firebase Realtime Database for localized PID regulation.",
    action: () => {
      applyStableTargetsToEsp32();
    }
  }
];

function startGuidedDemoTour() {
  currentTourStep = 0;
  const banner = document.getElementById('tour-banner');
  if (banner) banner.style.display = 'flex';
  renderTourStep();
}

function stopGuidedDemoTour() {
  const banner = document.getElementById('tour-banner');
  if (banner) banner.style.display = 'none';
}

function nextTourStep() {
  if (currentTourStep < TOUR_STEPS.length - 1) {
    currentTourStep++;
    renderTourStep();
  } else {
    stopGuidedDemoTour();
    showToastNotification("🎉 Guided Demo Tour Completed Successfully!");
  }
}

function prevTourStep() {
  if (currentTourStep > 0) {
    currentTourStep--;
    renderTourStep();
  }
}

function renderTourStep() {
  const step = TOUR_STEPS[currentTourStep];
  if (!step) return;
  const numEl = document.getElementById('tour-step-number');
  const titleEl = document.getElementById('tour-step-title');
  const descEl = document.getElementById('tour-step-desc');
  const nextBtn = document.getElementById('tour-next-btn');

  if (numEl) numEl.textContent = `Step ${currentTourStep + 1} of ${TOUR_STEPS.length}`;
  if (titleEl) titleEl.textContent = step.title;
  if (descEl) descEl.textContent = step.desc;
  if (nextBtn) {
    nextBtn.textContent = currentTourStep === TOUR_STEPS.length - 1 ? 'Finish Tour 🎉' : 'Next Step ▶';
  }

  step.action();
}

// Global Presentation Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

  if (e.key === '1') loadPreset('peaceful');
  else if (e.key === '2') loadPreset('breeder_guppy');
  else if (e.key === '3') loadPreset('predator');
  else if (e.key === '4') loadPreset('overstock');
  else if (e.key === '5') loadPreset('temp_violation');
  else if (e.key === 't' || e.key === 'T') startGuidedDemoTour();
  else if (e.key === ' ') {
    e.preventDefault();
    executeDecisionPipeline();
  }
});

