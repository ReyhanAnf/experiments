// TIMELAPSE CONTINUITY — GOOGLE FLOW AUTOMATOR CONTENT SCRIPT
(() => {
  if (window.__TC_FLOW_AUTOMATOR_INJECTED__) return;

  // Restrict execution to Google Labs/Flow domains and local development/testing targets
  const isTargetSite = window.location.hostname === 'labs.google' ||
                       window.location.hostname.endsWith('.google.com') ||
                       window.location.hostname === 'aitestkitchen.withgoogle.com' ||
                       window.location.hostname === 'localhost' ||
                       window.location.hostname === '127.0.0.1' ||
                       window.location.protocol === 'file:';
  if (!isTargetSite) return;

  window.__TC_FLOW_AUTOMATOR_INJECTED__ = true;

  // --- DEFAULT PRESET SCENARIO (FALLBACK) ---
  const DEFAULT_PLAN = {
    production_summary: {
      project_name: "Transformasi Dapur Nenek - Hawu ke Dapur Modern",
      target_total_duration_sec: 110,
      video_duration_sec: 10,
      total_videos: 11,
      total_images: 12
    },
    images: [
      {
        image_id: "IMAGE 1",
        state_id: "STATE_01",
        state_purpose: "Initial raw, traditional rustic village kitchen.",
        full_copy_ready_prompt: "CORE CONTINUITY INSTRUCTION:\nScene ID: DAPUR-NENEK-RENO-9X16\nProject: Transformasi Dapur Nenek\nCamera Lock: Fixed tripod 1.5m elevation, 35mm lens, zero drift.\n\n----------------------------------------\nAPPLY THE CORE PROMPT ABOVE WITHOUT MODIFICATION.\nASSET TYPE: STATIC IMAGE\nIMAGE ID: IMAGE 1 | STATE ID: STATE_01\nSTATE PURPOSE: Initial raw rustic village kitchen.\nNEGATIVE CONSTRAINTS: no magical transformations, no teleporting machinery, no morphing structures, no camera drift, no modern furniture."
      },
      {
        image_id: "IMAGE 2",
        state_id: "STATE_02",
        state_purpose: "Demolition and clearing of old wood stove.",
        full_copy_ready_prompt: "CORE CONTINUITY INSTRUCTION:\nScene ID: DAPUR-NENEK-RENO-9X16\nProject: Transformasi Dapur Nenek\nCamera Lock: Fixed tripod 1.5m elevation, 35mm lens, zero drift.\n\n----------------------------------------\nAPPLY THE CORE PROMPT ABOVE WITHOUT MODIFICATION.\nASSET TYPE: STATIC IMAGE\nIMAGE ID: IMAGE 2 | STATE ID: STATE_02\nSTATE PURPOSE: Demolition of stove complete.\nNEGATIVE CONSTRAINTS: no magical transformations, no teleporting machinery, no camera drift."
      }
    ],
    videos: [
      {
        video_id: "VIDEO 1",
        from_image_id: "IMAGE 1",
        to_image_id: "IMAGE 2",
        target_duration_sec: 10,
        temporal_compression_level: "High",
        full_copy_ready_prompt: "CORE CONTINUITY INSTRUCTION:\nScene ID: DAPUR-NENEK-RENO-9X16\nProject: Transformasi Dapur Nenek\n\n----------------------------------------\nAPPLY THE CORE PROMPT ABOVE WITHOUT MODIFICATION.\nASSET TYPE: TRANSITION VIDEO TIMELAPSE\nVIDEO ID: VIDEO 1 (IMAGE 1 -> IMAGE 2)\nTARGET DURATION: 10 seconds timelapse\nEND STATE CONVERGENCE: Final frame matches IMAGE 2.\nNEGATIVE CONSTRAINTS: no magical transformations, no morphing structures, no camera position drift."
      }
    ]
  };

  // --- STATE ---
  let activePlan = DEFAULT_PLAN;
  let activeStage = 'images'; // 'images' | 'videos'
  let currentImageIdx = 0;
  let currentVideoIdx = 0;
  let autoAdvance = true;
  let isMinimized = false;

  // --- STORAGE HELPERS ---
  function saveState() {
    const data = {
      activePlan,
      activeStage,
      currentImageIdx,
      currentVideoIdx,
      autoAdvance,
      isMinimized
    };
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ tc_flow_state: data });
    } else {
      try { localStorage.setItem('tc_flow_state', JSON.stringify(data)); } catch (e) {}
    }
  }

  function loadState(callback) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['tc_flow_state'], res => {
        if (res && res.tc_flow_state) {
          applyLoadedState(res.tc_flow_state);
        }
        if (callback) callback();
      });
    } else {
      try {
        const raw = localStorage.getItem('tc_flow_state');
        if (raw) applyLoadedState(JSON.parse(raw));
      } catch (e) {}
      if (callback) callback();
    }
  }

  function applyLoadedState(state) {
    if (state.activePlan && Array.isArray(state.activePlan.images) && state.activePlan.images.length > 0) {
      activePlan = state.activePlan;
    }
    if (state.activeStage) activeStage = state.activeStage;
    if (typeof state.currentImageIdx === 'number') currentImageIdx = Math.min(state.currentImageIdx, (activePlan.images || []).length - 1);
    if (typeof state.currentVideoIdx === 'number') currentVideoIdx = Math.min(state.currentVideoIdx, (activePlan.videos || []).length - 1);
    if (typeof state.autoAdvance === 'boolean') autoAdvance = state.autoAdvance;
    if (typeof state.isMinimized === 'boolean') isMinimized = state.isMinimized;
  }

  // --- DOM AUTOMATION / INJECTION HELPERS ---
  function findPromptInput() {
    // 1. Check focused element first
    const active = document.activeElement;
    if (active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && active.type === 'text') || active.isContentEditable)) {
      return active;
    }

    // 2. Query selectors for Google Flow / Labs / VideoFX / ImageFX
    const candidates = [
      'textarea[placeholder*="prompt" i]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      'textarea[aria-label*="prompt" i]',
      'textarea',
      'input[type="text"][placeholder*="prompt" i]',
      'input[type="text"]'
    ];

    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null && !el.closest('#tc-flow-hud')) {
        return el;
      }
    }
    return null;
  }

  function insertTextIntoElement(el, text) {
    if (!el) return false;
    el.focus();

    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      nativeSetter.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el.isContentEditable) {
      // Modern contenteditable injection
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Visual feedback flash
    const prevTransition = el.style.transition;
    const prevOutline = el.style.outline;
    el.style.transition = 'outline 0.15s ease';
    el.style.outline = '3px solid #10b981';
    setTimeout(() => {
      el.style.outline = prevOutline;
      el.style.transition = prevTransition;
    }, 800);

    return true;
  }

  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}

    // Fallback execCommand
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const success = document.execCommand('copy');
    document.body.removeChild(ta);
    return success;
  }

  function findAssetLibraryTrigger() {
    // Look for buttons that open asset drawer or library on Google Flow
    const buttons = Array.from(document.querySelectorAll('button, div[role="button"], [aria-label]'));
    const keywords = ['asset', 'library', 'media', 'add to prompt', 'start frame', 'end frame', 'image', 'lampiran'];
    for (const btn of buttons) {
      if (btn.closest('#tc-flow-hud')) continue;
      const text = (btn.textContent || btn.getAttribute('aria-label') || '').toLowerCase();
      if (keywords.some(k => text.includes(k))) {
        return btn;
      }
    }
    return null;
  }

  // --- RENDER HUD ---
  let hudEl = null;

  function createHud() {
    if (document.getElementById('tc-flow-hud')) return;

    hudEl = document.createElement('div');
    hudEl.id = 'tc-flow-hud';
    if (isMinimized) hudEl.classList.add('tc-minimized');

    hudEl.innerHTML = `
      <div class="tc-hud-header" id="tc-hud-drag-handle">
        <div class="tc-hud-title-wrap">
          <div class="tc-hud-badge-icon">TC</div>
          <span class="tc-hud-title">Flow Automator</span>
        </div>
        <div class="tc-hud-actions">
          <button class="tc-hud-icon-btn" id="tc-hud-btn-toggle-min" title="Minimize/Maximize">_</button>
        </div>
      </div>

      <div class="tc-hud-body">
        <!-- Project Bar -->
        <div class="tc-hud-project-bar">
          <span class="tc-hud-project-name" id="tc-hud-proj-name">Loading...</span>
          <button class="tc-hud-btn-change-project" id="tc-hud-btn-switch-plan">Muat JSON</button>
        </div>

        <!-- Project Loader Drawer (Hidden by default) -->
        <div class="tc-hud-project-loader" id="tc-hud-loader-drawer" style="display: none;">
          <div style="font-weight: 700; font-size: 11px; color: #34d399;">Pilih Preset atau Tempel JSON Proyek:</div>
          <select id="tc-hud-preset-select">
            <option value="dapur">Dapur Tradisional Nenek (110s)</option>
            <option value="warehouse">Industrial Warehouse (60s)</option>
            <option value="pool">Infinity Pool & Decking (40s)</option>
            <option value="tea-house">Japanese Tea Pavilion (50s)</option>
            <option value="kitchen">Chef's Kitchen (30s)</option>
          </select>
          <textarea id="tc-hud-json-input" rows="4" placeholder="Atau tempelkan JSON kontinuitas RFC 8259 di sini..."></textarea>
          <div style="display: flex; gap: 6px; justify-content: flex-end;">
            <button class="tc-hud-btn-secondary" id="tc-hud-btn-cancel-loader">Tutup</button>
            <button class="tc-hud-btn-primary" id="tc-hud-btn-apply-loader" style="padding: 5px 12px; font-size: 11px;">Terapkan</button>
          </div>
        </div>

        <!-- Stage Tabs -->
        <div class="tc-hud-tabs">
          <button class="tc-hud-tab ${activeStage === 'images' ? 'active' : ''}" id="tc-hud-tab-images">Stage 1: Images</button>
          <button class="tc-hud-tab ${activeStage === 'videos' ? 'active' : ''}" id="tc-hud-tab-videos">Stage 2: Videos</button>
        </div>

        <!-- Status Toast -->
        <div class="tc-hud-status" id="tc-hud-status-banner"></div>

        <!-- Dynamic Asset Card Content -->
        <div class="tc-hud-card" id="tc-hud-card-content">
          <!-- Populated dynamically -->
        </div>

        <!-- Navigation Row -->
        <div class="tc-hud-nav-row">
          <button class="tc-hud-btn-secondary" id="tc-hud-btn-prev">◀ Prev</button>
          <label style="font-size: 10px; color: #94a3b8; display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="checkbox" id="tc-hud-chk-autoadvance" ${autoAdvance ? 'checked' : ''}>
            <span>Auto-advance</span>
          </label>
          <button class="tc-hud-btn-secondary" id="tc-hud-btn-next">Next ▶</button>
        </div>
      </div>
    `;

    document.body.appendChild(hudEl);
    attachHudEvents();
    renderHudContent();
    makeDraggable(hudEl, document.getElementById('tc-hud-drag-handle'));
  }

  function showStatus(msg, isError = false) {
    const banner = document.getElementById('tc-hud-status-banner');
    if (!banner) return;
    banner.textContent = msg;
    banner.className = `tc-hud-status ${isError ? 'tc-error' : 'tc-success'}`;
    setTimeout(() => {
      banner.className = 'tc-hud-status';
    }, 3000);
  }

  function renderHudContent() {
    if (!hudEl) return;

    // Project Name
    const projNameEl = document.getElementById('tc-hud-proj-name');
    if (projNameEl) {
      projNameEl.textContent = activePlan.production_summary?.project_name || 'Continuity Project';
      projNameEl.title = projNameEl.textContent;
    }

    const card = document.getElementById('tc-hud-card-content');
    if (!card) return;

    const images = activePlan.images || [];
    const videos = activePlan.videos || [];

    if (activeStage === 'images') {
      if (images.length === 0) {
        card.innerHTML = `<div style="color: #94a3b8; text-align: center; font-size: 11px;">Tidak ada aset gambar dalam proyek ini.</div>`;
        return;
      }
      const curImg = images[currentImageIdx] || images[0];
      const promptText = curImg.full_copy_ready_prompt || curImg.asset_prompt_only || '';

      card.innerHTML = `
        <div class="tc-hud-card-header">
          <span class="tc-hud-asset-id">${curImg.image_id || `IMAGE ${currentImageIdx + 1}`}</span>
          <span class="tc-hud-asset-counter">${currentImageIdx + 1} of ${images.length}</span>
        </div>

        <div class="tc-hud-meta-row">
          <span class="tc-hud-meta-label">State Purpose:</span>
          <span>${curImg.state_purpose || 'Visual milestone anchor'}</span>
        </div>

        <div class="tc-hud-prompt-preview">${escapeHtml(promptText.slice(0, 300))}${promptText.length > 300 ? '...' : ''}</div>

        <button class="tc-hud-btn-primary" id="tc-hud-btn-action-paste">
          <span>⚡ Auto-Paste Image Prompt</span>
        </button>
        <button class="tc-hud-btn-secondary" id="tc-hud-btn-action-copy">
          <span>📋 Copy Prompt to Clipboard</span>
        </button>
      `;
    } else {
      // Stage: Videos
      if (videos.length === 0) {
        card.innerHTML = `<div style="color: #94a3b8; text-align: center; font-size: 11px;">Tidak ada transisi video dalam proyek ini.</div>`;
        return;
      }
      const curVid = videos[currentVideoIdx] || videos[0];
      const promptText = curVid.full_copy_ready_prompt || curVid.asset_prompt_only || '';
      const fromImg = curVid.from_image_id || `IMAGE ${currentVideoIdx + 1}`;
      const toImg = curVid.to_image_id || `IMAGE ${currentVideoIdx + 2}`;

      card.innerHTML = `
        <div class="tc-hud-card-header">
          <span class="tc-hud-asset-id" style="color: #f59e0b; background: rgba(245, 158, 11, 0.12); border-color: rgba(245, 158, 11, 0.25);">
            ${curVid.video_id || `VIDEO ${currentVideoIdx + 1}`}
          </span>
          <span class="tc-hud-asset-counter">${currentVideoIdx + 1} of ${videos.length} (${curVid.target_duration_sec || 10}s)</span>
        </div>

        <!-- Google Flow Library Selection Guide -->
        <div class="tc-hud-frame-box">
          <div class="tc-hud-frame-title">
            <span>🔗 Add Asset to Prompt:</span>
          </div>
          <div class="tc-hud-frame-items">
            <span><b>Start:</b> [${fromImg}]</span>
            <span style="color: #f59e0b;">⟶</span>
            <span><b>End:</b> [${toImg}]</span>
          </div>
          <button class="tc-hud-btn-secondary" id="tc-hud-btn-find-library" style="padding: 4px 8px; font-size: 10px; margin-top: 4px; justify-content: center;">
            <span>🔍 Cari Tombol "Add Asset / Library"</span>
          </button>
        </div>

        <div class="tc-hud-prompt-preview">${escapeHtml(promptText.slice(0, 300))}${promptText.length > 300 ? '...' : ''}</div>

        <button class="tc-hud-btn-primary" id="tc-hud-btn-action-paste" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: #451a03;">
          <span>⚡ Auto-Paste Video Prompt</span>
        </button>
        <button class="tc-hud-btn-secondary" id="tc-hud-btn-action-copy">
          <span>📋 Copy Prompt to Clipboard</span>
        </button>
      `;
    }

    attachCardActionEvents();
  }

  function attachCardActionEvents() {
    const btnPaste = document.getElementById('tc-hud-btn-action-paste');
    const btnCopy = document.getElementById('tc-hud-btn-action-copy');
    const btnFindLibrary = document.getElementById('tc-hud-btn-find-library');

    if (btnPaste) {
      btnPaste.addEventListener('click', () => {
        const item = activeStage === 'images' ? (activePlan.images || [])[currentImageIdx] : (activePlan.videos || [])[currentVideoIdx];
        if (!item) return;

        const promptText = item.full_copy_ready_prompt || item.asset_prompt_only || '';
        
        // Immediate in-page insertion for zero latency
        const inputEl = findPromptInput();
        if (inputEl) {
          insertTextIntoElement(inputEl, promptText);
          showStatus(`✓ Prompt ${item.image_id || item.video_id} berhasil ditempel!`);
        } else {
          showStatus(`✓ Prompt disalin ke clipboard! (Klik kotak prompt Google Flow lalu tekan Ctrl+V)`);
        }

        // Background clipboard synchronization
        copyToClipboard(promptText).catch(() => {});

        if (autoAdvance) {
          setTimeout(() => advanceNext(), 1200);
        }
      });
    }

    if (btnCopy) {
      btnCopy.addEventListener('click', async () => {
        const item = activeStage === 'images' ? (activePlan.images || [])[currentImageIdx] : (activePlan.videos || [])[currentVideoIdx];
        if (!item) return;
        const promptText = item.full_copy_ready_prompt || item.asset_prompt_only || '';
        await copyToClipboard(promptText);
        showStatus(`✓ Prompt disalin ke clipboard!`);
      });
    }

    if (btnFindLibrary) {
      btnFindLibrary.addEventListener('click', () => {
        const btn = findAssetLibraryTrigger();
        if (btn) {
          btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const prevOutline = btn.style.outline;
          btn.style.outline = '4px solid #f59e0b';
          btn.click();
          setTimeout(() => { btn.style.outline = prevOutline; }, 1500);
          showStatus("✓ Menyorot tombol asset library Google Flow!");
        } else {
          showStatus("Gunakan tombol 'Add asset' atau icon gambar di dekat prompt box untuk memilih frame awal & akhir.", true);
        }
      });
    }
  }

  function advanceNext() {
    if (activeStage === 'images') {
      const max = (activePlan.images || []).length;
      if (currentImageIdx < max - 1) {
        currentImageIdx++;
        renderHudContent();
        saveState();
      } else {
        // Switch to videos!
        activeStage = 'videos';
        currentVideoIdx = 0;
        updateTabStyles();
        renderHudContent();
        saveState();
        showStatus("🎉 Semua gambar selesai! Beralih ke Stage 2: Videos.");
      }
    } else {
      const max = (activePlan.videos || []).length;
      if (currentVideoIdx < max - 1) {
        currentVideoIdx++;
        renderHudContent();
        saveState();
      } else {
        showStatus("🏁 Seluruh sekuens gambar & video telah selesai!");
      }
    }
  }

  function advancePrev() {
    if (activeStage === 'images') {
      if (currentImageIdx > 0) {
        currentImageIdx--;
        renderHudContent();
        saveState();
      }
    } else {
      if (currentVideoIdx > 0) {
        currentVideoIdx--;
        renderHudContent();
        saveState();
      } else {
        activeStage = 'images';
        currentImageIdx = (activePlan.images || []).length - 1;
        updateTabStyles();
        renderHudContent();
        saveState();
      }
    }
  }

  function updateTabStyles() {
    const tabImg = document.getElementById('tc-hud-tab-images');
    const tabVid = document.getElementById('tc-hud-tab-videos');
    if (tabImg) tabImg.className = `tc-hud-tab ${activeStage === 'images' ? 'active' : ''}`;
    if (tabVid) tabVid.className = `tc-hud-tab ${activeStage === 'videos' ? 'active' : ''}`;
  }

  function attachHudEvents() {
    const btnToggleMin = document.getElementById('tc-hud-btn-toggle-min');
    if (btnToggleMin) {
      btnToggleMin.addEventListener('click', () => {
        isMinimized = !isMinimized;
        if (hudEl) {
          if (isMinimized) hudEl.classList.add('tc-minimized');
          else hudEl.classList.remove('tc-minimized');
        }
        btnToggleMin.textContent = isMinimized ? '◻' : '_';
        saveState();
      });
    }

    const tabImg = document.getElementById('tc-hud-tab-images');
    const tabVid = document.getElementById('tc-hud-tab-videos');
    if (tabImg) {
      tabImg.addEventListener('click', () => {
        activeStage = 'images';
        updateTabStyles();
        renderHudContent();
        saveState();
      });
    }
    if (tabVid) {
      tabVid.addEventListener('click', () => {
        activeStage = 'videos';
        updateTabStyles();
        renderHudContent();
        saveState();
      });
    }

    const btnPrev = document.getElementById('tc-hud-btn-prev');
    const btnNext = document.getElementById('tc-hud-btn-next');
    if (btnPrev) btnPrev.addEventListener('click', advancePrev);
    if (btnNext) btnNext.addEventListener('click', advanceNext);

    const chkAuto = document.getElementById('tc-hud-chk-autoadvance');
    if (chkAuto) {
      chkAuto.addEventListener('change', (e) => {
        autoAdvance = e.target.checked;
        saveState();
      });
    }

    // Project Loader Drawer triggers
    const btnSwitchPlan = document.getElementById('tc-hud-btn-switch-plan');
    const loaderDrawer = document.getElementById('tc-hud-loader-drawer');
    const btnCancelLoader = document.getElementById('tc-hud-btn-cancel-loader');
    const btnApplyLoader = document.getElementById('tc-hud-btn-apply-loader');

    if (btnSwitchPlan && loaderDrawer) {
      btnSwitchPlan.addEventListener('click', () => {
        const isHidden = loaderDrawer.style.display === 'none';
        loaderDrawer.style.display = isHidden ? 'flex' : 'none';
      });
    }

    if (btnCancelLoader && loaderDrawer) {
      btnCancelLoader.addEventListener('click', () => {
        loaderDrawer.style.display = 'none';
      });
    }

    if (btnApplyLoader && loaderDrawer) {
      btnApplyLoader.addEventListener('click', () => {
        const jsonText = (document.getElementById('tc-hud-json-input')?.value || '').trim();
        if (jsonText) {
          try {
            const parsed = JSON.parse(jsonText);
            if (parsed && Array.isArray(parsed.images) && parsed.images.length > 0) {
              activePlan = parsed;
              currentImageIdx = 0;
              currentVideoIdx = 0;
              activeStage = 'images';
              updateTabStyles();
              renderHudContent();
              loaderDrawer.style.display = 'none';
              saveState();
              showStatus(`✓ Proyek "${activePlan.production_summary?.project_name || 'Custom'}" dimuat!`);
              return;
            }
          } catch (e) {
            showStatus('Syntax JSON belum valid: ' + e.message, true);
            return;
          }
        }

        // If no JSON text, use preset
        const presetKey = document.getElementById('tc-hud-preset-select')?.value || 'dapur';
        if (window.SCENARIOS && window.SCENARIOS[presetKey]) {
          activePlan = JSON.parse(JSON.stringify(window.SCENARIOS[presetKey]));
        } else {
          activePlan = DEFAULT_PLAN;
        }
        currentImageIdx = 0;
        currentVideoIdx = 0;
        activeStage = 'images';
        updateTabStyles();
        renderHudContent();
        loaderDrawer.style.display = 'none';
        saveState();
        showStatus(`✓ Preset "${activePlan.production_summary?.project_name || presetKey}" dimuat!`);
      });
    }
  }

  function makeDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      if (e.target.closest('button')) return;
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;

      element.style.top = (element.offsetTop - pos2) + "px";
      element.style.left = (element.offsetLeft - pos1) + "px";
      element.style.bottom = 'auto';
      element.style.right = 'auto';
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- EXTENSION & WINDOW MESSAGE LISTENERS ---
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
      if (req.type === 'TC_SET_PROJECT') {
        if (req.plan && Array.isArray(req.plan.images)) {
          activePlan = req.plan;
          currentImageIdx = 0;
          currentVideoIdx = 0;
          activeStage = 'images';
          updateTabStyles();
          renderHudContent();
          saveState();
          showStatus(`✓ Proyek diperbarui dari Extension: "${activePlan.production_summary?.project_name}"`);
          sendResponse({ success: true });
        }
      } else if (req.type === 'TC_GET_STATE') {
        sendResponse({
          activePlan,
          activeStage,
          currentImageIdx,
          currentVideoIdx,
          autoAdvance
        });
      }
      return true;
    });
  }

  // Listen to postMessage from web apps (e.g. timelapse-continuity.html sync button)
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'TC_FLOW_EXPORT' && event.data.plan) {
      const plan = event.data.plan;
      if (Array.isArray(plan.images)) {
        activePlan = plan;
        currentImageIdx = 0;
        currentVideoIdx = 0;
        activeStage = 'images';
        saveState();
        if (hudEl) {
          updateTabStyles();
          renderHudContent();
          showStatus(`✓ Proyek disinkronkan: "${activePlan.production_summary?.project_name}"`);
        }
      }
    }
  });

  // --- INITIALIZE ---
  loadState(() => {
    const isContinuityEditor = window.location.pathname.endsWith('timelapse-continuity.html') || 
                               Boolean(document.querySelector('#btn-flow-extension-sync'));
    // Do not inject the floating HUD inside the Timelapse Continuity generator canvas itself
    if (!isContinuityEditor) {
      createHud();
    }
  });
})();
