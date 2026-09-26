const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function runHardeningTests() {
  console.log("=== STARTING FORMULA HARDENING ACCEPTANCE TEST SUITE ===");

  const tempProfile = path.join(os.tmpdir(), 'chrome_cdp_profile_hardening_' + Date.now());
  fs.mkdirSync(tempProfile, { recursive: true });

  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const port = 9224;

  const chromeProcess = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tempProfile}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ], { stdio: 'ignore' });

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
    throw new Error("Could not connect to Chrome on port " + port);
  }

  const listTargets = await new Promise((resolve, reject) => {
    http.get(`http://localhost:${port}/json/list`, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => resolve(JSON.parse(raw)));
    }).on('error', reject);
  });

  const pageTarget = listTargets.find(t => t.type === 'page') || listTargets[0];
  const wsUrl = pageTarget.webSocketDebuggerUrl;

  const ws = new WebSocket(wsUrl);

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let idCounter = 1;
  const pendingRequests = new Map();

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pendingRequests.has(msg.id)) {
      const { resolve, reject } = pendingRequests.get(msg.id);
      pendingRequests.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  };

  function sendCommand(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = idCounter++;
      pendingRequests.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression) {
    const res = await sendCommand("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error("Eval error: " + JSON.stringify(res.exceptionDetails));
    }
    return res.result ? res.result.value : undefined;
  }

  try {
    await sendCommand("Page.enable");
    await sendCommand("Runtime.enable");

    const htmlPath = path.resolve(__dirname, '..', 'timelapse-continuity.html').replace(/\\/g, '/');
    const fileUrl = `file:///${htmlPath}`;
    console.log("Navigating to:", fileUrl);

    await sendCommand("Page.navigate", { url: fileUrl });
    await new Promise(r => setTimeout(r, 2000));

    // -------------------------------------------------------------
    // ACCEPTANCE TEST 1: local_negative_prompt merging
    // -------------------------------------------------------------
    console.log("\n[TEST 1] Testing local_negative_prompt merging into full_copy_ready_prompt...");
    const test1Result = await evaluate(`(() => {
      const sample = JSON.parse(JSON.stringify(window.SCENARIOS.warehouse));
      sample.images[0].local_negative_prompt = "no wet paint smudges, NO WATERMARKS";
      const loaded = window.loadContinuityPlanFromJson(sample);
      const img0Prompt = loaded.images[0].full_copy_ready_prompt;
      
      const hasWetPaint = img0Prompt.includes("no wet paint smudges");
      const hasGlobal = img0Prompt.includes("no magical transformations");
      const negLine = img0Prompt.split('\\n').find(l => l.startsWith('NEGATIVE CONSTRAINTS:'));

      // Check deduplication of 'no watermarks'
      const watermarksCount = (negLine.match(/no watermarks/gi) || []).length;

      return {
        hasWetPaint,
        hasGlobal,
        negLine,
        watermarksCount,
        pass: hasWetPaint && hasGlobal && watermarksCount === 1
      };
    })()`);

    console.log("Test 1 Result:", test1Result);
    if (!test1Result.pass) {
      throw new Error("Test 1 FAILED: local_negative_prompt was not merged and deduplicated correctly.");
    }
    console.log("✓ PASS: Test 1 - local_negative_prompt merged and deduplicated correctly!");

    // -------------------------------------------------------------
    // ACCEPTANCE TEST 2: worker_identity_registry object coercion & invalid type warning
    // -------------------------------------------------------------
    console.log("\n[TEST 2] Testing worker_identity_registry coercion and warnings...");
    const test2Result = await evaluate(`(() => {
      const sample = JSON.parse(JSON.stringify(window.SCENARIOS.warehouse));
      // Object map registry
      sample.core_prompt.worker_identity_registry = {
        "WORKER A": { role: "Site Supervisor", visual_profile: "Neon yellow vest, clipboard" },
        "WORKER B": "Electrician with toolbelt"
      };
      const loadedObj = window.loadContinuityPlanFromJson(sample);
      const coercedArray = loadedObj.core_prompt.worker_identity_registry;
      const hasWorkerA = coercedArray.some(w => w.worker_id === "WORKER A" && w.role === "Site Supervisor");
      const hasWorkerB = coercedArray.some(w => w.worker_id === "WORKER B" && w.visual_profile === "Electrician with toolbelt");
      const objWarning = (loadedObj._importWarnings || []).find(w => w.includes("worker_identity_registry was provided as an object"));

      // Uncoercible registry
      const sampleInvalid = JSON.parse(JSON.stringify(window.SCENARIOS.warehouse));
      sampleInvalid.core_prompt.worker_identity_registry = 12345;
      const loadedInvalid = window.loadContinuityPlanFromJson(sampleInvalid);
      const invalidArray = loadedInvalid.core_prompt.worker_identity_registry;
      const invalidWarning = (loadedInvalid._importWarnings || []).find(w => w.includes("worker_identity_registry had invalid type"));

      return {
        hasWorkerA,
        hasWorkerB,
        objWarning,
        invalidArrayLength: invalidArray.length,
        invalidWarning,
        pass: hasWorkerA && hasWorkerB && Boolean(objWarning) && invalidArray.length === 0 && Boolean(invalidWarning)
      };
    })()`);

    console.log("Test 2 Result:", test2Result);
    if (!test2Result.pass) {
      throw new Error("Test 2 FAILED: worker_identity_registry coercion / warning failed.");
    }
    console.log("✓ PASS: Test 2 - worker_identity_registry coerced with visible warnings!");

    // -------------------------------------------------------------
    // ACCEPTANCE TEST 3: production_summary counts verification & UI stats bar
    // -------------------------------------------------------------
    console.log("\n[TEST 3] Testing production_summary counts verification and UI stats bar...");
    const test3Result = await evaluate(`(() => {
      const sample = JSON.parse(JSON.stringify(window.SCENARIOS.warehouse));
      // Deliberately set wrong total_videos = 8 and total_images = 10
      sample.production_summary.total_videos = 8;
      sample.production_summary.total_images = 10;
      
      const textarea = document.getElementById('import-json-textarea');
      textarea.value = JSON.stringify(sample);

      // Trigger import button
      document.getElementById('btn-submit-import').click();

      // Check currentData and UI stats bar
      const current = window.getCurrentData();
      const statsVideos = document.getElementById('stat-videos-count').textContent.trim();
      const statsImages = document.getElementById('stat-images-count').textContent.trim();
      const warningsBanner = document.getElementById('project-warnings-container');
      const warningsListText = document.getElementById('project-warnings-list').textContent;

      const correctedVideos = current.production_summary.total_videos === 6;
      const correctedImages = current.production_summary.total_images === 7;
      const uiMatchesReal = statsVideos === "6" && statsImages === "7";
      const bannerVisible = !warningsBanner.classList.contains('hidden');
      const warningRecorded = warningsListText.includes('total_videos was 8 in the JSON but 6 video entries were found');

      return {
        correctedVideos,
        correctedImages,
        statsVideos,
        statsImages,
        uiMatchesReal,
        bannerVisible,
        warningRecorded,
        pass: correctedVideos && correctedImages && uiMatchesReal && bannerVisible && warningRecorded
      };
    })()`);

    console.log("Test 3 Result:", test3Result);
    if (!test3Result.pass) {
      throw new Error("Test 3 FAILED: production_summary counts not verified / stats bar wrong.");
    }
    console.log("✓ PASS: Test 3 - production_summary verified and UI stats bar reflects real array!");

    // -------------------------------------------------------------
    // ACCEPTANCE TEST 4: sequence_map validation & auto-rebuild
    // -------------------------------------------------------------
    console.log("\n[TEST 4] Testing sequence_map invalid ID validation and auto-rebuild...");
    const test4Result = await evaluate(`(() => {
      const sample = JSON.parse(JSON.stringify(window.SCENARIOS.warehouse));
      // Sequence map referencing IMAGE 9 when only 7 images exist
      sample.sequence_map = [
        "IMAGE 1", "VIDEO 1 (IMAGE 1 -> IMAGE 2)",
        "IMAGE 2", "VIDEO 2 (IMAGE 2 -> IMAGE 3)",
        "IMAGE 3", "VIDEO 3 (IMAGE 3 -> IMAGE 4)",
        "IMAGE 4", "VIDEO 4 (IMAGE 4 -> IMAGE 5)",
        "IMAGE 5", "VIDEO 5 (IMAGE 5 -> IMAGE 6)",
        "IMAGE 6", "VIDEO 6 (IMAGE 6 -> IMAGE 7)",
        "IMAGE 9"
      ];
      
      const loaded = window.loadContinuityPlanFromJson(sample);
      const lastEntry = loaded.sequence_map[loaded.sequence_map.length - 1];
      const hasWarning = (loaded._importWarnings || []).some(w => w.includes("sequence_map was invalid") && w.includes("IMAGE 9"));

      return {
        lastEntry,
        hasWarning,
        pass: lastEntry === "IMAGE 7" && hasWarning
      };
    })()`);

    console.log("Test 4 Result:", test4Result);
    if (!test4Result.pass) {
      throw new Error("Test 4 FAILED: sequence_map with invalid ID was not rebuilt.");
    }
    console.log("✓ PASS: Test 4 - sequence_map with invalid ID rebuilt automatically with warning!");

    // -------------------------------------------------------------
    // ACCEPTANCE TEST 5: camera_lock edit via Edit Modal updates all prompts
    // -------------------------------------------------------------
    console.log("\n[TEST 5] Testing camera_lock edit via Edit Modal Form Detail...");
    const test5Result = await evaluate(`(() => {
      // Open Edit Modal
      window.openEditProjectModal ? window.openEditProjectModal() : document.getElementById('btn-edit-active-project').click();
      
      const newCameraText = "LOCKED TRIPOD AT 2.8M HEIGHT WITH 50MM ANAMORPHIC LENS ZERO DRIFT";
      document.getElementById('edit-form-camera-lock').value = newCameraText;
      
      // Save changes
      document.getElementById('btn-save-edit-modal').click();

      // Check currentData and each image/video prompt
      const current = window.getCurrentData();
      const rawCoreHasNewCamera = current.core_prompt.raw_core_text.includes(newCameraText);
      const allImagesUpdated = current.images.every(img => img.full_copy_ready_prompt.includes(newCameraText));
      const allVideosUpdated = current.videos.every(vid => vid.full_copy_ready_prompt.includes(newCameraText));

      return {
        rawCoreHasNewCamera,
        allImagesUpdated,
        allVideosUpdated,
        pass: rawCoreHasNewCamera && allImagesUpdated && allVideosUpdated
      };
    })()`);

    console.log("Test 5 Result:", test5Result);
    if (!test5Result.pass) {
      throw new Error("Test 5 FAILED: Editing camera_lock did not update full_copy_ready_prompt across all assets.");
    }
    console.log("✓ PASS: Test 5 - Editing camera_lock immediately updates all asset prompts!");

    // -------------------------------------------------------------
    // ACCEPTANCE TEST 6: All five built-in scenario presets pass Validator Audit
    // -------------------------------------------------------------
    console.log("\n[TEST 6] Testing RFC 8259 Validator Audit for all 5 presets...");
    const test6Result = await evaluate(`(() => {
      const presetKeys = ['warehouse', 'pool', 'tea-house', 'kitchen', 'dapur'];
      const results = {};

      for (const key of presetKeys) {
        // Load scenario directly
        const rawPreset = window.SCENARIOS[key];
        const loaded = window.loadContinuityPlanFromJson(rawPreset);

        // Run audit checks
        const images = loaded.images || [];
        const videos = loaded.videos || [];
        const summary = loaded.production_summary || {};

        const rule1 = images.length === videos.length + 1;
        let rule2 = videos.length > 0;
        for (let i = 0; i < videos.length; i++) {
          const expectedFromNum = i + 1;
          const expectedToNum = i + 2;
          const fromNum = (videos[i].from_image_id || '').match(/\\d+/);
          const toNum = (videos[i].to_image_id || '').match(/\\d+/);
          if (!fromNum || !toNum || parseInt(fromNum[0], 10) !== expectedFromNum || parseInt(toNum[0], 10) !== expectedToNum) {
            rule2 = false;
            break;
          }
        }
        const calcDuration = videos.reduce((acc, v) => acc + (Number(v.target_duration_sec) || Number(summary.video_duration_sec) || 0), 0) || (videos.length * (Number(summary.video_duration_sec) || 10));
        const rule3 = Boolean(calcDuration && summary.actual_total_runtime_sec && calcDuration === summary.actual_total_runtime_sec);

        const workerList = Array.isArray(loaded.core_prompt?.worker_identity_registry)
          ? loaded.core_prompt.worker_identity_registry
          : [];
        const rule4 = workerList.length > 0;

        const rule5 = images.length > 0 && images.every(i => i.full_copy_ready_prompt && i.full_copy_ready_prompt.trim().length > 30) &&
                      videos.length > 0 && videos.every(v => v.full_copy_ready_prompt && v.full_copy_ready_prompt.trim().length > 30);

        let rule6 = false;
        try {
          const parsed = JSON.parse(JSON.stringify(loaded));
          rule6 = Boolean(parsed && typeof parsed === 'object');
        } catch(e) {
          rule6 = false;
        }

        const allPassed = rule1 && rule2 && rule3 && rule4 && rule5 && rule6;
        results[key] = { rule1, rule2, rule3, rule4, rule5, rule6, allPassed };
      }

      const allPresetsPass = Object.values(results).every(r => r.allPassed);
      return {
        results,
        pass: allPresetsPass
      };
    })()`);

    console.log("Test 6 Result:", JSON.stringify(test6Result, null, 2));
    if (!test6Result.pass) {
      throw new Error("Test 6 FAILED: Not all preset scenarios pass the 100% Validator Audit.");
    }
    console.log("✓ PASS: Test 6 - All 5 built-in scenarios achieve 100% PASS on the Validator Audit!");

    console.log("\n=================================================");
    console.log("ALL 6 ACCEPTANCE TESTS PASSED WITH FLYING COLORS!");
    console.log("=================================================");
  } finally {
    ws.close();
    chromeProcess.kill();
    try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch(e) {}
  }
}

runHardeningTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
