const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const sampleJsonWithArrayLandmarks = {
  production_summary: {
    project_name: "Transformasi Dapur Nenek - Hawu ke Dapur Modern",
    target_total_duration_sec: 110,
    video_duration_sec: 10,
    total_videos: 11,
    total_images: 12,
    actual_total_runtime_sec: 110,
    aspect_ratio: "9:16",
    temporal_summary: "12 images and 11 videos transformation."
  },
  sequence_map: [
    "IMAGE 1", "VIDEO 1 (IMAGE 1 -> IMAGE 2)",
    "IMAGE 2", "VIDEO 2 (IMAGE 2 -> IMAGE 3)",
    "IMAGE 3", "VIDEO 3 (IMAGE 3 -> IMAGE 4)",
    "IMAGE 4", "VIDEO 4 (IMAGE 4 -> IMAGE 5)",
    "IMAGE 5", "VIDEO 5 (IMAGE 5 -> IMAGE 6)",
    "IMAGE 6", "VIDEO 6 (IMAGE 6 -> IMAGE 7)",
    "IMAGE 7", "VIDEO 7 (IMAGE 7 -> IMAGE 8)",
    "IMAGE 8", "VIDEO 8 (IMAGE 8 -> IMAGE 9)",
    "IMAGE 9", "VIDEO 9 (IMAGE 9 -> IMAGE 10)",
    "IMAGE 10", "VIDEO 10 (IMAGE 10 -> IMAGE 11)",
    "IMAGE 11", "VIDEO 11 (IMAGE 11 -> IMAGE 12)",
    "IMAGE 12"
  ],
  core_prompt: {
    scene_id: "DAPUR-NENEK-RENO-9X16",
    project_description: "Realistic transformation of a traditional rustic Indonesian village kitchen into a modern-minimalist kitchen.",
    aspect_ratio: "9:16 portrait vertical",
    camera_lock: "35mm equivalent wide-angle cinematic prime lens, natural depth of field (f/2.8). Base anchor positioned at the kitchen doorway looking diagonally toward the cooking corner.",
    geometry_lock: "Rectangular 3.5m x 4m rural kitchen space. Exposed timber roof rafters with terracotta tiles.",
    landmark_lock: [
      {
        landmark_id: "LANDMARK 1",
        name: "Corner Post",
        description: "Main structural vertical solid hardwood pillar in the far right corner, identifiable grain and slight historic curvature."
      },
      {
        landmark_id: "LANDMARK 2",
        name: "Roof King Post",
        description: "Central vertical roof support timber overhead with hand-hewn notches."
      },
      {
        landmark_id: "LANDMARK 3",
        name: "Window Aperture",
        description: "Small rectangular window opening on the upper-left wall providing natural daylight."
      },
      {
        landmark_id: "LANDMARK 4",
        name: "Drainage Outlet",
        description: "Small drainage floor opening at the far left wall base."
      }
    ],
    worker_identity_registry: [
      {
        worker_id: "WORKER A",
        role: "Nenek / Grandmother",
        visual_profile: "Indonesian woman, ~70 years old, petite, weathered gentle face, grey hair tied in a neat traditional low bun."
      },
      {
        worker_id: "WORKER B",
        role: "Anak Perempuan / Daughter",
        visual_profile: "Indonesian woman, ~30 years old, 158 cm tall, hair tied in a practical ponytail."
      }
    ],
    material_and_tool_registry: {
      demolition_debris: "Broken red clay bricks, wood ash, soot residue, bamboo strips.",
      new_materials: "White moisture-resistant wall cladding boards, warm oak-finish SPC/vinyl floor planks.",
      tools: "Claw hammer, cordless drill/driver, utility level, hand saw."
    },
    global_physics_rules: "Realistic temporal compression: physical work accelerates logically.",
    global_timelapse_rules: "No instant state jumps; work must visibly progress.",
    global_negative_rules: "no camera drift, no teleporting objects, no morphed materials."
  },
  images: Array.from({ length: 12 }, (_, i) => ({
    image_id: `IMAGE ${i + 1}`,
    state_id: `STATE_${String(i + 1).padStart(2, '0')}`,
    state_purpose: `Stage ${i + 1} progress`,
    full_copy_ready_prompt: `CORE INSTRUCTION... IMAGE ${i + 1}`
  })),
  videos: Array.from({ length: 11 }, (_, i) => ({
    video_id: `VIDEO ${i + 1}`,
    from_image_id: `IMAGE ${i + 1}`,
    to_image_id: `IMAGE ${i + 2}`,
    target_duration_sec: 10,
    full_copy_ready_prompt: `CORE INSTRUCTION... VIDEO ${i + 1}`
  }))
};

async function testArrayLandmarks() {
  console.log("=== STARTING ARRAY LANDMARKS VERIFICATION IN CHROME CDP ===");

  const tempProfile = path.join(os.tmpdir(), 'chrome_cdp_profile_lm_' + Date.now());
  fs.mkdirSync(tempProfile, { recursive: true });

  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const port = 9223;

  const chromeProcess = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tempProfile}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ], { stdio: 'ignore' });

  // Wait for Chrome
  let versionData = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      versionData = await new Promise((resolve, reject) => {
        http.get(`http://localhost:${port}/json/version`, res => {
          let raw = '';
          res.on('data', chunk => raw += chunk);
          res.on('end', () => {
            try { resolve(JSON.parse(raw)); } catch(e) { reject(e); }
          });
        }).on('error', reject);
      });
      if (versionData) break;
    } catch (e) {}
  }

  if (!versionData) {
    chromeProcess.kill();
    throw new Error("Could not connect to Chrome on port 9223");
  }

  const listTargets = await new Promise((resolve, reject) => {
    http.get(`http://localhost:${port}/json/list`, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => resolve(JSON.parse(raw)));
    }).on('error', reject);
  });

  const pageTarget = listTargets.find(t => t.type === 'page') || listTargets[0];
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  let msgId = 1;
  const pendingRequests = new Map();
  const consoleErrors = [];
  const uncaughtExceptions = [];

  function sendCommand(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pendingRequests.set(id, { resolve, reject, method });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pendingRequests.has(data.id)) {
      const { resolve, reject, method } = pendingRequests.get(data.id);
      pendingRequests.delete(data.id);
      if (data.error) {
        reject(new Error(`Command ${method} failed: ${JSON.stringify(data.error)}`));
      } else {
        resolve(data.result);
      }
    } else if (data.method === 'Runtime.consoleAPICalled') {
      const type = data.params.type;
      const text = data.params.args.map(a => a.value || a.description || '').join(' ');
      if (type === 'error') {
        console.error("BROWSER CONSOLE ERROR:", text);
        consoleErrors.push(text);
      } else {
        console.log(`[Browser Console ${type}]:`, text);
      }
    } else if (data.method === 'Runtime.exceptionThrown') {
      const ex = data.params.exceptionDetails;
      console.error("BROWSER UNCAUGHT EXCEPTION:", ex.text, ex.exception ? ex.exception.description : '');
      uncaughtExceptions.push(ex);
    }
  };

  await sendCommand('Runtime.enable');
  await sendCommand('Page.enable');

  const fileUrl = `file:///d:/07_PROJECTS/Personal/experiments/timelapse-continuity.html`;
  console.log(`Navigating to ${fileUrl}...`);
  await sendCommand('Page.navigate', { url: fileUrl });
  await new Promise(r => setTimeout(r, 1500));

  // Test 1: Paste sample JSON with Array of Objects in Edit Project Modal
  console.log("Testing Edit Project Modal with array-of-objects landmark_lock...");
  const editModalResult = await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        // Open Edit Modal
        const btnEdit = document.getElementById('btn-edit-active-project');
        btnEdit.click();
        const modal = document.getElementById('edit-project-modal');
        const modalOpen = !modal.classList.contains('hidden');

        // Switch to JSON tab
        document.getElementById('tab-edit-json').click();

        // Paste JSON with array of objects landmark_lock
        const jsonStr = ${JSON.stringify(JSON.stringify(sampleJsonWithArrayLandmarks, null, 2))};
        const textarea = document.getElementById('edit-direct-json-textarea');
        textarea.value = jsonStr;
        textarea.dispatchEvent(new Event('input'));

        // Check validation status
        const validStatus = document.getElementById('edit-json-status').textContent;

        // Click Save
        document.getElementById('btn-save-edit-modal').click();

        // Check if modal closed and if error banner appeared
        const errorBanner = document.getElementById('edit-error-banner');
        const hasError = !errorBanner.classList.contains('hidden');
        const errorText = document.getElementById('edit-error-msg')?.textContent;
        const modalClosed = modal.classList.contains('hidden');

        // Verify active project title
        const activeTitle = document.getElementById('active-project-title')?.textContent.trim();

        // Verify landmarks pills in Scene Bible
        const landmarkPills = Array.from(document.querySelectorAll('#bible-landmarks-list span')).map(s => ({
          text: s.textContent,
          title: s.title
        }));

        // Verify Scene Bible contains no [object Object]
        const bibleHtml = document.getElementById('scene-bible-card')?.innerHTML || '';
        const containsObjectObject = bibleHtml.includes('[object Object]');

        // Verify copy-ready prompt in first video and first image has no [object Object]
        const firstImgPrompt = document.querySelector('.card-prompt-preview')?.textContent || '';
        const promptContainsObjectObject = firstImgPrompt.includes('[object Object]');

        // Re-open edit modal to check form tab population
        btnEdit.click();
        const formLandmarkVal = document.getElementById('edit-form-landmark-lock').value;
        const formLandmarkHasObject = formLandmarkVal.includes('[object Object]');
        document.getElementById('btn-cancel-edit-modal').click();

        return {
          modalOpen,
          validStatus,
          hasError,
          errorText,
          modalClosed,
          activeTitle,
          landmarkPillsCount: landmarkPills.length,
          landmarkPills,
          containsObjectObject,
          promptContainsObjectObject,
          formLandmarkVal,
          formLandmarkHasObject
        };
      })()
    `,
    returnByValue: true
  });

  console.log("Edit Modal Array-of-Objects Verification Result:", JSON.stringify(editModalResult.result.value, null, 2));

  // Test 2: Test Import Modal with Array of Strings landmark_lock
  console.log("\nTesting Import Modal with array-of-strings landmark_lock...");
  const sampleArrayStrings = JSON.parse(JSON.stringify(sampleJsonWithArrayLandmarks));
  sampleArrayStrings.production_summary.project_name = "Array Strings Landmark Test Project";
  sampleArrayStrings.core_prompt.landmark_lock = [
    "Permanent North Garden Maple Tree",
    "Center Overhead Concrete Joint",
    "West Tie-rod Cluster"
  ];

  const importModalResult = await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        document.getElementById('btn-open-importer').click();
        const importModal = document.getElementById('import-modal');
        const textarea = document.getElementById('import-json-textarea');
        textarea.value = ${JSON.stringify(JSON.stringify(sampleArrayStrings, null, 2))};
        textarea.dispatchEvent(new Event('input'));

        document.getElementById('btn-submit-import').click();

        const modalClosed = importModal.classList.contains('hidden');
        const activeTitle = document.getElementById('active-project-title')?.textContent.trim();
        const landmarkPills = Array.from(document.querySelectorAll('#bible-landmarks-list span')).map(s => s.textContent);

        return {
          modalClosed,
          activeTitle,
          landmarkPills
        };
      })()
    `,
    returnByValue: true
  });

  console.log("Import Modal Array-of-Strings Verification Result:", JSON.stringify(importModalResult.result.value, null, 2));

  // Clean up
  ws.close();
  chromeProcess.kill();
  try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (e) {}

  if (consoleErrors.length > 0 || uncaughtExceptions.length > 0) {
    console.error(`FAILED: ${consoleErrors.length} console errors, ${uncaughtExceptions.length} exceptions.`);
    process.exit(1);
  }

  const r1 = editModalResult.result.value;
  const r2 = importModalResult.result.value;

  if (r1.hasError) {
    throw new Error(`Edit modal showed error: ${r1.errorText}`);
  }
  if (!r1.modalClosed) {
    throw new Error("Edit modal failed to close upon save!");
  }
  if (r1.containsObjectObject || r1.formLandmarkHasObject || r1.promptContainsObjectObject) {
    throw new Error("Found '[object Object]' in rendered HTML, form field, or copy-ready prompt!");
  }
  if (r1.landmarkPillsCount !== 4) {
    throw new Error(`Expected 4 landmark pills, got ${r1.landmarkPillsCount}`);
  }

  console.log("\n>>> ALL ARRAY LANDMARKS TESTS PASSED WITH ZERO CONSOLE ERRORS! <<<\n");
}

testArrayLandmarks().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
