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

  // --- PROMPT COMPILERS & NORMALIZER (ALIGNED WITH NEW SCHEMA) ---
  function cleanDot(s) {
    if (!s) return '';
    return String(s).trim().replace(/\.+$/, '');
  }

  function cleanComma(s) {
    if (!s) return '';
    return String(s).trim().replace(/[.,;]+$/, '');
  }

  function formatCastRegistry(val) {
    if (!val) return 'Persistent crew with consistent uniforms and gear';
    if (typeof val === 'string') return cleanDot(val);
    if (Array.isArray(val)) {
      return cleanDot(val.map((w, idx) => {
        if (typeof w === 'string') return w;
        const id = w.worker_id || w.id || `WORKER ${String.fromCharCode(65 + idx)}`;
        const role = w.role ? ` (${w.role})` : '';
        const profile = w.visual_profile || w.description || w.profile || '';
        return `${id}${role}: ${profile}`;
      }).join('; '));
    }
    return cleanDot(JSON.stringify(val));
  }

  function formatEquipmentTools(val) {
    if (!val) return 'Tools and equipment staged neatly';
    if (typeof val === 'string') return cleanDot(val);
    if (Array.isArray(val)) {
      return cleanDot(val.map((e, idx) => {
        if (typeof e === 'string') return e;
        const id = e.equipment_id || e.id || `EQUIPMENT ${idx + 1}`;
        const type = e.type ? ` (${e.type})` : '';
        const profile = e.visual_profile || e.description || '';
        return `${id}${type}: ${profile}`;
      }).join('; '));
    }
    return cleanDot(JSON.stringify(val));
  }

  // - Rangkai prompt dengan format berurutan:
  //   [project_meta.style_preset]. [core.scene_environment]. [image.camera_setup]. [image.state_description]. Active work: [image.active_work]. Worker action: [image.worker_action]. Visible details: [image.visible_materials]. Persistent cast: [core.worker_registry]. Equipment present: [core.equipment_and_tools]. [core.quality_and_negative], [image.local_negative].
  function compileImageCopyReadyPrompt(planOrMeta, coreOrImg, maybeImg) {
    let meta = {};
    let core = {};
    let img = {};

    if (maybeImg) {
      meta = planOrMeta || {};
      core = coreOrImg || {};
      img = maybeImg;
    } else if (coreOrImg) {
      if (planOrMeta && (planOrMeta.project_meta || planOrMeta.production_summary || planOrMeta.core || planOrMeta.core_prompt)) {
        meta = planOrMeta.project_meta || planOrMeta.production_summary || {};
        core = planOrMeta.core || planOrMeta.core_prompt || {};
        img = coreOrImg;
      } else {
        core = planOrMeta || {};
        meta = activePlan?.project_meta || activePlan?.production_summary || {};
        img = coreOrImg;
      }
    }

    const stylePreset = cleanDot(meta.style_preset) || 'Photorealistic documentary timelapse, raw 8k texture, hyper-detailed restoration';
    const sceneEnv = cleanDot(core.scene_environment || core.project_description || core.environment_lock) || 'Detailed room layout, dimensions, structural architecture, natural and artificial lighting setup';
    const camSetup = cleanDot(img.camera_setup || core.camera_lock) || 'Wide-angle lens, eye-level tripod mount, facing North';
    const stateDesc = cleanDot(img.state_description || img.state_purpose || img.material_state) || 'Detailed physical state of materials, surface decay, debris accumulation, and initial environment';
    const activeWork = cleanDot(img.active_work) || 'None';
    const workerAct = cleanDot(img.worker_action || img.worker_actions) || 'Workers stationary in frame';
    const visMat = cleanDot(img.visible_materials || img.physical_evidence || img.material_state) || 'Observable surface textures and structural elements';
    const castReg = formatCastRegistry(core.worker_registry || core.worker_identity_registry);
    const equipTools = formatEquipmentTools(core.equipment_and_tools || core.equipment_registry || core.material_and_tool_registry);
    const qualityNeg = cleanComma(core.quality_and_negative || core.global_negative_rules || 'Photorealistic, 8k, cinematic lighting, physically accurate, volumetric dust --no text, watermarks, UI overlays, logos, morphed limbs, floating tools, impossible physics');
    const localNeg = cleanDot(img.local_negative || img.local_negative_prompt);

    const negBlock = localNeg ? `${qualityNeg}, ${localNeg}.` : `${qualityNeg}.`;

    return `${stylePreset}. ${sceneEnv}. ${camSetup}. ${stateDesc}. Active work: ${activeWork}. Worker action: ${workerAct}. Visible details: ${visMat}. Persistent cast: ${castReg}. Equipment present: ${equipTools}. ${negBlock}`;
  }

  // - Rangkai prompt khusus Image-to-Video Google Flow:
  //   Documentary timelapse transition from STATE {from_image_index} to STATE {to_image_index}. Motion dynamics: [video.motion_dynamics]. Camera movement: [video.camera_motion]. Worker activity: [video.worker_movements]. Material change: [video.material_evolution]. Ensure smooth physical progression ending precisely at the target condition. [core.quality_and_negative].
  function compileVideoCopyReadyPrompt(planOrMeta, coreOrVid, maybeVid) {
    let meta = {};
    let core = {};
    let vid = {};

    if (maybeVid) {
      meta = planOrMeta || {};
      core = coreOrVid || {};
      vid = maybeVid;
    } else if (coreOrVid) {
      if (planOrMeta && (planOrMeta.project_meta || planOrMeta.production_summary || planOrMeta.core || planOrMeta.core_prompt)) {
        meta = planOrMeta.project_meta || planOrMeta.production_summary || {};
        core = planOrMeta.core || planOrMeta.core_prompt || {};
        vid = coreOrVid;
      } else {
        core = planOrMeta || {};
        meta = activePlan?.project_meta || activePlan?.production_summary || {};
        vid = coreOrVid;
      }
    }

    const fromIdx = vid.from_image_index != null ? vid.from_image_index : (vid.from_image_id ? (vid.from_image_id.match(/\d+/) ? parseInt(vid.from_image_id.match(/\d+/)[0], 10) : vid.from_image_id) : 1);
    const toIdx = vid.to_image_index != null ? vid.to_image_index : (vid.to_image_id ? (vid.to_image_id.match(/\d+/) ? parseInt(vid.to_image_id.match(/\d+/)[0], 10) : vid.to_image_id) : 2);

    const motionDyn = cleanDot(vid.motion_dynamics || vid.timelapse_behavior || vid.physical_workload) || 'Aggressive fast-forward timelapse of physical labor and material progression';
    const camMotion = cleanDot(vid.camera_motion || core.camera_lock) || 'Tripod remains locked with zero drift';
    const workerMov = cleanDot(vid.worker_movements || vid.worker_actions) || 'Workers moving in high-speed timelapse motion with task-oriented momentum';
    const matEvol = cleanDot(vid.material_evolution || vid.material_movement) || 'Surfaces undergo realistic progressive physical transformation';
    const qualityNeg = cleanDot(core.quality_and_negative || core.global_negative_rules || 'Photorealistic, 8k, cinematic lighting, physically accurate, volumetric dust --no text, watermarks, UI overlays, logos, morphed limbs, floating tools, impossible physics');

    return `Documentary timelapse transition from STATE ${fromIdx} to STATE ${toIdx}. Motion dynamics: ${motionDyn}. Camera movement: ${camMotion}. Worker activity: ${workerMov}. Material change: ${matEvol}. Ensure smooth physical progression ending precisely at the target condition. ${qualityNeg}.`;
  }

  function normalizePlan(rawInput) {
    if (!rawInput || typeof rawInput !== 'object') return DEFAULT_PLAN;
    const plan = JSON.parse(JSON.stringify(rawInput));

    const rawCore = plan.core || plan.core_prompt || {};
    plan.core = {
      scene_environment: rawCore.scene_environment || rawCore.project_description || rawCore.environment_lock || "Detailed room layout, dimensions, structural architecture, natural and artificial lighting setup.",
      anchor_landmarks: rawCore.anchor_landmarks || rawCore.landmark_lock || "1. Primary structural wall; 2. Main entrance; 3. Central ceiling beam.",
      worker_registry: typeof rawCore.worker_registry === 'string' ? rawCore.worker_registry : formatCastRegistry(rawCore.worker_registry || rawCore.worker_identity_registry),
      equipment_and_tools: typeof rawCore.equipment_and_tools === 'string' ? rawCore.equipment_and_tools : formatEquipmentTools(rawCore.equipment_and_tools || rawCore.equipment_registry),
      quality_and_negative: rawCore.quality_and_negative || "Photorealistic, 8k, cinematic lighting, physically accurate, volumetric dust --no text, watermarks, UI overlays, logos, morphed limbs, floating tools, impossible physics"
    };
    plan.core_prompt = plan.core;

    const rawMeta = plan.project_meta || plan.production_summary || {};
    const imgLen = Array.isArray(plan.images) ? plan.images.length : 0;
    const vidLen = Array.isArray(plan.videos) ? plan.videos.length : 0;

    plan.project_meta = {
      project_name: rawMeta.project_name || "Continuous Timelapse Project",
      total_images: rawMeta.total_images || imgLen,
      total_videos: rawMeta.total_videos || vidLen,
      target_aspect_ratio: rawMeta.target_aspect_ratio || "16:9",
      style_preset: rawMeta.style_preset || "Photorealistic documentary timelapse, raw 8k texture, hyper-detailed restoration"
    };
    plan.production_summary = {
      project_name: plan.project_meta.project_name,
      total_images: plan.project_meta.total_images,
      total_videos: plan.project_meta.total_videos,
      target_aspect_ratio: plan.project_meta.target_aspect_ratio,
      style_preset: plan.project_meta.style_preset
    };

    if (Array.isArray(plan.images)) {
      plan.images = plan.images.map((img, idx) => {
        const imageIndex = img.image_index != null ? Number(img.image_index) : (idx + 1);
        const normImg = {
          image_index: imageIndex,
          state_id: img.state_id || `STATE_${String(imageIndex).padStart(2, '0')}`,
          phase_name: img.phase_name || img.state_purpose || `Milestone Phase ${imageIndex}`,
          camera_setup: img.camera_setup || plan.core.scene_environment || "Wide-angle lens, eye-level tripod mount, facing North.",
          state_description: img.state_description || img.state_purpose || img.material_state || "Detailed physical state of materials, surface decay, debris accumulation, and initial environment.",
          active_work: img.active_work || "None",
          worker_action: img.worker_action || img.worker_actions || "Workers at station.",
          visible_materials: img.visible_materials || img.physical_evidence || img.material_state || "Observable surface textures and structural elements.",
          local_negative: img.local_negative || img.local_negative_prompt || "",
          image_id: img.image_id || `IMAGE ${imageIndex}`,
          state_purpose: img.phase_name || img.state_purpose || `Milestone Phase ${imageIndex}`
        };
        const hasLegacyPrompt = img.full_copy_ready_prompt && img.full_copy_ready_prompt.startsWith('CORE CONTINUITY INSTRUCTION');
        normImg.full_copy_ready_prompt = (!img.full_copy_ready_prompt || hasLegacyPrompt)
          ? compileImageCopyReadyPrompt(plan.project_meta, plan.core, normImg)
          : img.full_copy_ready_prompt;
        return normImg;
      });
    }

    if (Array.isArray(plan.videos)) {
      plan.videos = plan.videos.map((vid, idx) => {
        const videoIndex = vid.video_index != null ? Number(vid.video_index) : (idx + 1);
        const fromImgIdx = vid.from_image_index != null ? Number(vid.from_image_index) : (vid.from_image_id ? (parseInt(vid.from_image_id.replace(/\D/g, ''), 10) || (idx + 1)) : (idx + 1));
        const toImgIdx = vid.to_image_index != null ? Number(vid.to_image_index) : (vid.to_image_id ? (parseInt(vid.to_image_id.replace(/\D/g, ''), 10) || (idx + 2)) : (idx + 2));
        const durationSec = Number(vid.duration_sec != null ? vid.duration_sec : (vid.target_duration_sec != null ? vid.target_duration_sec : 5));

        const normVid = {
          video_index: videoIndex,
          from_image_index: fromImgIdx,
          to_image_index: toImgIdx,
          transition_strategy: vid.transition_strategy || "static_continuous",
          duration_sec: durationSec,
          camera_motion: vid.camera_motion || "Tripod remains rigidly locked with zero drift.",
          motion_dynamics: vid.motion_dynamics || vid.timelapse_behavior || vid.physical_workload || "Aggressive fast-forward timelapse of physical labor and material progression.",
          worker_movements: vid.worker_movements || vid.worker_actions || "Workers moving in high-speed timelapse motion with task-oriented momentum.",
          material_evolution: vid.material_evolution || vid.material_movement || "Surfaces undergo realistic progressive physical transformation.",
          convergence_target: vid.convergence_target || vid.end_state_convergence || `Motion seamlessly slows down and lands identically on the framing and physical layout of IMAGE ${toImgIdx}.`,
          video_id: vid.video_id || `VIDEO ${videoIndex}`,
          from_image_id: vid.from_image_id || `IMAGE ${fromImgIdx}`,
          to_image_id: vid.to_image_id || `IMAGE ${toImgIdx}`,
          target_duration_sec: durationSec
        };
        const hasLegacyPrompt = vid.full_copy_ready_prompt && vid.full_copy_ready_prompt.startsWith('CORE CONTINUITY INSTRUCTION');
        normVid.full_copy_ready_prompt = (!vid.full_copy_ready_prompt || hasLegacyPrompt)
          ? compileVideoCopyReadyPrompt(plan.project_meta, plan.core, normVid)
          : vid.full_copy_ready_prompt;
        return normVid;
      });
    }

    return plan;
  }

  // --- DEFAULT PRESET SCENARIO (FALLBACK) ---
  const RAW_DEFAULT_PLAN = {
    project_meta: {
      project_name: "Transformasi Dapur Nenek - Hawu ke Dapur Modern",
      total_images: 2,
      total_videos: 1,
      target_aspect_ratio: "9:16",
      style_preset: "Hyper-realistic documentary footage, raw 8k texture, hyper-detailed restoration, cinematic lighting"
    },
    core: {
      scene_environment: "Dapur pedesaan tradisional berdinding gedek bambu anyam, lantai semen kasar, tungku hawu kayu bakar tanah liat.",
      anchor_landmarks: "1. Jendela kayu berkisi bambu; 2. Tiang kayu jati penyangga utama; 3. Saluran pembuangan air dinding timur.",
      worker_registry: "Pak Tukang (50 tahun, kaos oblong abu-abu pudar, celana training hitam, handuk kecil melingkar di leher).",
      equipment_and_tools: "Cangkul, palu godam 5kg, ember adukan semen hitam, sendok semen, gerobak dorong merah.",
      quality_and_negative: "Photorealistic, 8k, cinematic lighting, physically accurate, volumetric dust --no text, watermarks, UI overlays, logos, morphed limbs, floating tools, impossible physics"
    },
    images: [
      {
        image_index: 1,
        state_id: "STATE_01",
        phase_name: "Kondisi Awal Dapur Tradisional",
        camera_setup: "Tripod fixed 1.5m elevation, 35mm lens, angle 45 derajat menghadap tungku hawu dan jendela timur.",
        state_description: "Dapur tradisional desa dengan tungku hawu tanah liat menghitam penuh jelaga arang, tumpukan kayu bakar kering di sudut, dinding gedek bambu kecokelatan tua.",
        active_work: "Pengukuran awal dan penandaan area pembongkaran tungku dengan kapur putih.",
        worker_action: "Pak Tukang berdiri di depan tungku memegang meteran kayu dan kapur penanda.",
        visible_materials: "Debu abu tungku, abu kayu putih keabuan, kayu bakar jati kering, dinding bambu lapuk alami.",
        local_negative: "no modern cabinets, no granite countertop, no clean tiles"
      },
      {
        image_index: 2,
        state_id: "STATE_02",
        phase_name: "Pembongkaran Tungku & Pembersihan Area",
        camera_setup: "Tripod fixed 1.5m elevation, 35mm lens, angle 45 derajat menghadap tungku hawu dan jendela timur.",
        state_description: "Tungku hawu lama telah dihancurkan rata dengan lantai semen, puing bata merah dan tanah liat terkumpul rapi di karung goni.",
        active_work: "Mengangkut karung puing dan menyiram lantai dasar sebelum pemasangan pondasi meja dapur baru.",
        worker_action: "Pak Tukang membungkuk mengikat karung goni berisi serpihan tanah liat dan menyapu sisa reruntuhan.",
        visible_materials: "Bongkahan bata bakar hancur, pecahan tanah liat tungku, debu semen basah tersapu, karung goni cokelat.",
        local_negative: "no intact old stove, no new kitchen set installed yet"
      }
    ],
    videos: [
      {
        video_index: 1,
        from_image_index: 1,
        to_image_index: 2,
        transition_strategy: "static_continuous",
        duration_sec: 10,
        camera_motion: "Tripod remains rigidly locked with zero drift.",
        motion_dynamics: "Aggressive fast-forward timelapse pembongkaran tungku tanah liat menggunakan palu godam dan pengangkutan puing ke luar ruangan.",
        worker_movements: "Pak Tukang bergerak cepat dalam akselerasi timelapse memukul tungku hingga runtuh dan membersihkan sisa abu.",
        material_evolution: "Tungku hawu tanah liat perlahan hancur runtuh menjadi gundukan puing, lalu tersapu bersih menyisakan lantai semen rata.",
        convergence_target: "Gerakan melambat secara mulus dan mendarat presisi pada komposisi dan kondisi fisik IMAGE 2."
      }
    ]
  };

  const DEFAULT_PLAN = normalizePlan(RAW_DEFAULT_PLAN);

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
      activePlan = normalizePlan(state.activePlan);
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
      projNameEl.textContent = activePlan.project_meta?.project_name || activePlan.production_summary?.project_name || 'Continuity Project';
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
      const promptText = curImg.full_copy_ready_prompt || compileImageCopyReadyPrompt(activePlan.project_meta, activePlan.core, curImg);
      const imgLabel = curImg.image_index != null ? `IMAGE ${curImg.image_index}` : (curImg.image_id || `IMAGE ${currentImageIdx + 1}`);
      const stateLabel = curImg.state_id || `STATE_${String(currentImageIdx + 1).padStart(2, '0')}`;
      const phaseLabel = curImg.phase_name || curImg.state_purpose || 'Visual milestone';

      card.innerHTML = `
        <div class="tc-hud-card-header">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="tc-hud-asset-id">${imgLabel}</span>
            <span style="font-size: 10px; font-family: monospace; color: #10b981; background: rgba(16, 185, 129, 0.12); padding: 1px 5px; border-radius: 4px; border: 1px solid rgba(16, 185, 129, 0.25);">${stateLabel}</span>
          </div>
          <span class="tc-hud-asset-counter">${currentImageIdx + 1} of ${images.length}</span>
        </div>

        <div class="tc-hud-meta-row">
          <span class="tc-hud-meta-label">Phase:</span>
          <span style="font-weight: 500;">${escapeHtml(phaseLabel)}</span>
        </div>

        ${curImg.active_work ? `
        <div class="tc-hud-meta-row">
          <span class="tc-hud-meta-label">Active:</span>
          <span>${escapeHtml(curImg.active_work)}</span>
        </div>` : ''}

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
      const promptText = curVid.full_copy_ready_prompt || compileVideoCopyReadyPrompt(activePlan.project_meta, activePlan.core, curVid);
      const fromImgNum = curVid.from_image_index != null ? curVid.from_image_index : (curVid.from_image_id ? (parseInt(curVid.from_image_id.replace(/\D/g, ''), 10) || (currentVideoIdx + 1)) : (currentVideoIdx + 1));
      const toImgNum = curVid.to_image_index != null ? curVid.to_image_index : (curVid.to_image_id ? (parseInt(curVid.to_image_id.replace(/\D/g, ''), 10) || (currentVideoIdx + 2)) : (currentVideoIdx + 2));
      const vidLabel = curVid.video_index != null ? `VIDEO ${curVid.video_index}` : (curVid.video_id || `VIDEO ${currentVideoIdx + 1}`);
      const durSec = curVid.duration_sec != null ? curVid.duration_sec : (curVid.target_duration_sec || 5);

      card.innerHTML = `
        <div class="tc-hud-card-header">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="tc-hud-asset-id" style="color: #f59e0b; background: rgba(245, 158, 11, 0.12); border-color: rgba(245, 158, 11, 0.25);">
              ${vidLabel}
            </span>
            <span style="font-size: 10px; font-family: monospace; color: #38bdf8; background: rgba(56, 189, 248, 0.12); padding: 1px 5px; border-radius: 4px; border: 1px solid rgba(56, 189, 248, 0.25);">STATE ${fromImgNum} ⟶ STATE ${toImgNum}</span>
          </div>
          <span class="tc-hud-asset-counter">${currentVideoIdx + 1} of ${videos.length} (${durSec}s)</span>
        </div>

        <!-- Google Flow Library Selection Guide -->
        <div class="tc-hud-frame-box">
          <div class="tc-hud-frame-title">
            <span>🔗 Add Asset to Prompt:</span>
          </div>
          <div class="tc-hud-frame-items">
            <span><b>Start:</b> [STATE ${fromImgNum} / IMAGE ${fromImgNum}]</span>
            <span style="color: #f59e0b;">⟶</span>
            <span><b>End:</b> [STATE ${toImgNum} / IMAGE ${toImgNum}]</span>
          </div>
          <button class="tc-hud-btn-secondary" id="tc-hud-btn-find-library" style="padding: 4px 8px; font-size: 10px; margin-top: 4px; justify-content: center;">
            <span>🔍 Cari Tombol "Add Asset / Library"</span>
          </button>
        </div>

        <div class="tc-hud-prompt-preview">${escapeHtml(promptText.slice(0, 300))}${promptText.length > 300 ? '...' : ''}</div>

        <button class="tc-hud-btn-primary" id="tc-hud-btn-action-paste" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: #451a03;">
          <span>⚡ Auto-Paste Google Flow Video Prompt</span>
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

        const promptText = item.full_copy_ready_prompt || (activeStage === 'images'
          ? compileImageCopyReadyPrompt(activePlan.project_meta, activePlan.core, item)
          : compileVideoCopyReadyPrompt(activePlan.project_meta, activePlan.core, item));
        
        // Immediate in-page insertion for zero latency
        const inputEl = findPromptInput();
        if (inputEl) {
          insertTextIntoElement(inputEl, promptText);
          showStatus(`✓ Prompt ${item.image_index != null ? `IMAGE ${item.image_index}` : (item.video_index != null ? `VIDEO ${item.video_index}` : (item.image_id || item.video_id))} berhasil ditempel!`);
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
        const promptText = item.full_copy_ready_prompt || (activeStage === 'images'
          ? compileImageCopyReadyPrompt(activePlan.project_meta, activePlan.core, item)
          : compileVideoCopyReadyPrompt(activePlan.project_meta, activePlan.core, item));
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
              activePlan = normalizePlan(parsed);
              currentImageIdx = 0;
              currentVideoIdx = 0;
              activeStage = 'images';
              updateTabStyles();
              renderHudContent();
              loaderDrawer.style.display = 'none';
              saveState();
              showStatus(`✓ Proyek "${activePlan.project_meta?.project_name || activePlan.production_summary?.project_name || 'Custom'}" dimuat!`);
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
          activePlan = normalizePlan(window.SCENARIOS[presetKey]);
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
        showStatus(`✓ Preset "${activePlan.project_meta?.project_name || activePlan.production_summary?.project_name || presetKey}" dimuat!`);
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
          activePlan = normalizePlan(req.plan);
          currentImageIdx = 0;
          currentVideoIdx = 0;
          activeStage = 'images';
          updateTabStyles();
          renderHudContent();
          saveState();
          showStatus(`✓ Proyek diperbarui dari Extension: "${activePlan.project_meta?.project_name || activePlan.production_summary?.project_name}"`);
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
        activePlan = normalizePlan(plan);
        currentImageIdx = 0;
        currentVideoIdx = 0;
        activeStage = 'images';
        saveState();
        if (hudEl) {
          updateTabStyles();
          renderHudContent();
          showStatus(`✓ Proyek disinkronkan: "${activePlan.project_meta?.project_name || activePlan.production_summary?.project_name}"`);
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
