const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function runExtensionTestSuite() {
  console.log("=================================================================");
  console.log("=== STARTING GOOGLE FLOW AUTOMATOR EXTENSION TEST SUITE ===");
  console.log("=================================================================\n");

  const repoRoot = path.resolve(__dirname, '..');
  const extDir = path.resolve(repoRoot, 'extensions', 'google-flow-automator');

  // --- STEP 1: VALIDATE MANIFEST & EXTENSION STRUCTURE ---
  console.log("--- STEP 1: Validating Manifest V3 & Extension Assets ---");
  const manifestPath = path.join(extDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error("manifest.json not found at " + manifestPath);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log("Manifest Version:", manifest.manifest_version);
  console.log("Extension Name:", manifest.name);

  if (manifest.manifest_version !== 3) {
    throw new Error("Expected Manifest V3, got: " + manifest.manifest_version);
  }

  // Check critical files
  const requiredFiles = [
    'content.js',
    'content.css',
    'popup.html',
    'popup.js',
    'background.js',
    'icons/icon16.png',
    'icons/icon48.png',
    'icons/icon128.png',
    'README.md'
  ];

  for (const rel of requiredFiles) {
    const full = path.join(extDir, rel);
    if (!fs.existsSync(full)) {
      throw new Error("Required extension file missing: " + rel);
    }
    const stat = fs.statSync(full);
    console.log(`✓ Verified ${rel} (${stat.size} bytes)`);
  }

  // --- STEP 2: START HTTP SERVER ---
  console.log("\n--- STEP 2: Starting Local Test HTTP Server ---");
  const port = 8991;
  const server = http.createServer((req, res) => {
    const reqPath = req.url.split('?')[0];
    let filePath = null;
    let contentType = 'text/html; charset=utf-8';

    if (reqPath === '/' || reqPath === '/mock_google_flow.html') {
      filePath = path.join(repoRoot, 'tests', 'mock_google_flow.html');
    } else if (reqPath === '/timelapse-continuity.html') {
      filePath = path.join(repoRoot, 'timelapse-continuity.html');
    } else if (reqPath === '/popup.html') {
      filePath = path.join(extDir, 'popup.html');
    } else if (reqPath === '/popup.js') {
      filePath = path.join(extDir, 'popup.js');
      contentType = 'application/javascript; charset=utf-8';
    }

    if (filePath && fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  await new Promise(r => server.listen(port, r));
  console.log(`Test server active on http://localhost:${port}`);

  // --- STEP 3: LAUNCH CHROME CDP ---
  console.log("\n--- STEP 3: Launching Headless Chrome via CDP ---");
  const tempProfile = path.join(os.tmpdir(), 'chrome_flow_test_' + Date.now());
  fs.mkdirSync(tempProfile, { recursive: true });

  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const cdpPort = 9223;

  const chromeProcess = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${tempProfile}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ], { stdio: 'ignore' });

  let ws = null;
  const consoleErrors = [];
  const uncaughtExceptions = [];

  try {
    let versionData = null;
    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 400));
      try {
        versionData = await new Promise((resolve, reject) => {
          http.get(`http://localhost:${cdpPort}/json/version`, res => {
            let raw = '';
            res.on('data', chunk => raw += chunk);
            res.on('end', () => {
              try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
            });
          }).on('error', reject);
        });
        if (versionData) break;
      } catch (e) {}
    }

    if (!versionData) throw new Error("Could not connect to Chrome on CDP port " + cdpPort);
    console.log("Connected to Chrome:", versionData.Browser);

    const listTargets = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${cdpPort}/json/list`, res => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => resolve(JSON.parse(raw)));
      }).on('error', reject);
    });

    const pageTarget = listTargets.find(t => t.type === 'page') || listTargets[0];
    ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    let msgId = 1;
    const pendingRequests = new Map();

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
          console.error("[Browser Console ERROR]:", text);
          consoleErrors.push(text);
        } else {
          console.log(`[Browser Console ${type}]:`, text);
        }
      } else if (data.method === 'Runtime.exceptionThrown') {
        const ex = data.params.exceptionDetails;
        console.error("[Browser UNCAUGHT EXCEPTION]:", ex.text, ex.exception ? ex.exception.description : '');
        uncaughtExceptions.push(ex);
      }
    };

    await sendCommand('Runtime.enable');
    await sendCommand('Page.enable');
    await sendCommand('DOM.enable');

    // --- STEP 4: LOAD MOCK GOOGLE FLOW PAGE & INJECT EXTENSION SCRIPTS ---
    console.log("\n--- STEP 4: Navigating to Mock Google Flow Page ---");
    const mockUrl = `http://localhost:${port}/mock_google_flow.html`;

    let pageLoadedPromise = new Promise(resolve => {
      const handler = (event) => {
        const data = JSON.parse(event.data);
        if (data.method === 'Page.loadEventFired') {
          ws.removeEventListener('message', handler);
          resolve();
        }
      };
      ws.addEventListener('message', handler);
    });

    await sendCommand('Page.navigate', { url: mockUrl });
    await pageLoadedPromise;

    // Inject Extension CSS & JS directly into Mock Google Flow
    console.log("Injecting Extension content.css and content.js into page...");
    const contentCss = fs.readFileSync(path.join(extDir, 'content.css'), 'utf8');
    const contentJs = fs.readFileSync(path.join(extDir, 'content.js'), 'utf8');

    await sendCommand('Runtime.evaluate', {
      expression: `
        (() => {
          const style = document.createElement('style');
          style.textContent = ${JSON.stringify(contentCss)};
          document.head.appendChild(style);
        })()
      `
    });

    await sendCommand('Runtime.evaluate', {
      expression: contentJs
    });

    await new Promise(r => setTimeout(r, 600));

    // --- STEP 5: VERIFY FLOATING HUD INJECTION ---
    console.log("\n--- STEP 5: Verifying Floating HUD Injected & Styled ---");
    const hudCheck = await sendCommand('Runtime.evaluate', {
      expression: `
        (() => {
          const hud = document.getElementById('tc-flow-hud');
          if (!hud) return null;
          return {
            id: hud.id,
            title: hud.querySelector('.tc-hud-title')?.textContent,
            projectName: hud.querySelector('#tc-hud-proj-name')?.textContent,
            assetId: hud.querySelector('.tc-hud-asset-id')?.textContent.trim(),
            activeTab: hud.querySelector('.tc-hud-tab.active')?.textContent.trim()
          };
        })()
      `,
      returnByValue: true
    });

    console.log("HUD Info:", hudCheck.result.value);
    if (!hudCheck.result.value) {
      throw new Error("HUD was not injected!");
    }
    if (hudCheck.result.value.activeTab !== 'Stage 1: Images') {
      throw new Error("Default tab should be Stage 1: Images, got: " + hudCheck.result.value.activeTab);
    }

    // --- STEP 6: TEST AUTO-PASTE IMAGE PROMPT ---
    console.log("\n--- STEP 6: Testing Stage 1 Image Auto-Paste into Google Flow ---");
    const pasteImgResult = await sendCommand('Runtime.evaluate', {
      expression: `
        (() => {
          const btn = document.getElementById('tc-hud-btn-action-paste');
          btn.click();
          const textarea = document.getElementById('prompt-input');
          return {
            buttonText: btn.textContent.trim(),
            statusText: document.getElementById('tc-hud-status-banner')?.textContent.trim(),
            promptInserted: textarea.value
          };
        })()
      `,
      returnByValue: true
    });

    console.log("Status Banner:", pasteImgResult.result.value.statusText);
    console.log("Prompt Preview:", pasteImgResult.result.value.promptInserted.slice(0, 120) + '...');

    if (!pasteImgResult.result.value.promptInserted.includes('Active work:') ||
        !pasteImgResult.result.value.promptInserted.includes('Worker action:')) {
      throw new Error("Image 1 prompt was not correctly inserted into Google Flow textarea!");
    }

    // --- STEP 7: TEST NAVIGATION (PREV / NEXT) ---
    console.log("\n--- STEP 7: Testing Next Navigation ---");
    await sendCommand('Runtime.evaluate', {
      expression: `document.getElementById('tc-hud-btn-next').click();`
    });
    await new Promise(r => setTimeout(r, 400));

    const nextImgCheck = await sendCommand('Runtime.evaluate', {
      expression: `document.querySelector('.tc-hud-asset-id')?.textContent.trim()`,
      returnByValue: true
    });
    console.log("Current Asset ID after Next:", nextImgCheck.result.value);
    if (nextImgCheck.result.value !== 'IMAGE 2') {
      throw new Error("Expected IMAGE 2 after Next, got: " + nextImgCheck.result.value);
    }

    // --- STEP 8: TEST STAGE 2 VIDEOS & ASSET LIBRARY HELPER ---
    console.log("\n--- STEP 8: Testing Stage 2 (Videos) & Asset Library Linking ---");
    await sendCommand('Runtime.evaluate', {
      expression: `document.getElementById('tc-hud-tab-videos').click();`
    });
    await new Promise(r => setTimeout(r, 400));

    const videoDetails = await sendCommand('Runtime.evaluate', {
      expression: `
        (() => {
          const card = document.getElementById('tc-hud-card-content');
          return {
            assetId: card.querySelector('.tc-hud-asset-id')?.textContent.trim(),
            frameGuide: card.querySelector('.tc-hud-frame-items')?.textContent.trim(),
            hasFindLibraryBtn: Boolean(document.getElementById('tc-hud-btn-find-library'))
          };
        })()
      `,
      returnByValue: true
    });
    console.log("Video Details:", videoDetails.result.value);

    if (!videoDetails.result.value.frameGuide.includes('IMAGE 1') || !videoDetails.result.value.frameGuide.includes('IMAGE 2')) {
      throw new Error("Frame guide missing Start/End image references: " + videoDetails.result.value.frameGuide);
    }

    // Test Library Finder button
    console.log("Testing 'Cari Tombol Add Asset / Library' helper...");
    const libraryClickResult = await sendCommand('Runtime.evaluate', {
      expression: `
        (() => {
          const btn = document.getElementById('tc-hud-btn-find-library');
          btn.click();
          return {
            drawerDisplay: document.getElementById('library-drawer').style.display,
            statusText: document.getElementById('tc-hud-status-banner')?.textContent.trim()
          };
        })()
      `,
      returnByValue: true
    });
    console.log("Library Finder Result:", libraryClickResult.result.value);
    if (libraryClickResult.result.value.drawerDisplay !== 'block') {
      throw new Error("Library button was not triggered by HUD helper!");
    }

    // Test Auto-Paste Video Prompt
    console.log("Auto-pasting video prompt...");
    const pasteVidResult = await sendCommand('Runtime.evaluate', {
      expression: `
        (() => {
          const btn = document.getElementById('tc-hud-btn-action-paste');
          btn.click();
          const textarea = document.getElementById('prompt-input');
          return {
            statusText: document.getElementById('tc-hud-status-banner')?.textContent.trim(),
            promptInserted: textarea.value
          };
        })()
      `,
      returnByValue: true
    });
    console.log("Video Prompt Status:", pasteVidResult.result.value.statusText);
    console.log("Video Prompt Preview:", pasteVidResult.result.value.promptInserted.slice(0, 120) + '...');

    if (!pasteVidResult.result.value.promptInserted.includes('Documentary timelapse transition') ||
        !pasteVidResult.result.value.promptInserted.includes('Motion dynamics:')) {
      throw new Error("Video prompt was not correctly inserted into textarea!");
    }

    // --- STEP 9: TEST WEB SYNC (POSTMESSAGE TC_FLOW_EXPORT) ---
    console.log("\n--- STEP 9: Testing Web App 1-Click Sync (TC_FLOW_EXPORT) ---");
    const customTestProject = {
      project_meta: {
        project_name: "Modern Penthouse Sky Terrace",
        total_images: 2,
        total_videos: 1,
        target_aspect_ratio: "16:9",
        style_preset: "Photorealistic documentary timelapse"
      },
      core: {
        scene_environment: "Penthouse terrace overlooking city skyline.",
        anchor_landmarks: "1. Glass balustrade; 2. Concrete planter; 3. Steel pergola.",
        worker_registry: "Lead Carpenter in grey overalls.",
        equipment_and_tools: "Cordless drill, spirit level, teak wood slats.",
        quality_and_negative: "Photorealistic, 8k --no morphing"
      },
      images: [
        {
          image_index: 1,
          state_id: "STATE_01",
          phase_name: "Initial Empty Terrace",
          camera_setup: "Tripod fixed 1.5m facing North.",
          state_description: "Empty concrete slab before decking installation.",
          active_work: "Snapping reference chalk lines.",
          worker_action: "Kneeling on concrete with chalk reel.",
          visible_materials: "Chalk markings and raw concrete.",
          local_negative: "no finished teak decking"
        }
      ],
      videos: []
    };

    await sendCommand('Runtime.evaluate', {
      expression: `
        window.postMessage({
          type: 'TC_FLOW_EXPORT',
          plan: ${JSON.stringify(customTestProject)}
        }, '*');
      `
    });
    await new Promise(r => setTimeout(r, 400));

    const updatedProjName = await sendCommand('Runtime.evaluate', {
      expression: `document.getElementById('tc-hud-proj-name')?.textContent`,
      returnByValue: true
    });
    console.log("Updated Project Name in HUD after postMessage sync:", updatedProjName.result.value);

    if (updatedProjName.result.value !== 'Modern Penthouse Sky Terrace') {
      throw new Error("Project name was not updated via postMessage sync!");
    }

    // --- STEP 10: TEST POPUP PAGE INTEGRITY ---
    console.log("\n--- STEP 10: Testing Extension Popup Page ---");
    const popupUrl = `http://localhost:${port}/popup.html`;

    pageLoadedPromise = new Promise(resolve => {
      const handler = (event) => {
        const data = JSON.parse(event.data);
        if (data.method === 'Page.loadEventFired') {
          ws.removeEventListener('message', handler);
          resolve();
        }
      };
      ws.addEventListener('message', handler);
    });

    await sendCommand('Page.navigate', { url: popupUrl });
    await pageLoadedPromise;

    const popupUiCheck = await sendCommand('Runtime.evaluate', {
      expression: `
        (() => {
          return {
            title: document.title,
            hasProjectBox: Boolean(document.getElementById('pop-project-name')),
            hasJsonInput: Boolean(document.getElementById('pop-json-input')),
            hasSendBtn: Boolean(document.getElementById('pop-btn-send')),
            hasOpenFlowBtn: Boolean(document.getElementById('pop-btn-open-flow'))
          };
        })()
      `,
      returnByValue: true
    });
    console.log("Popup UI Elements Check:", popupUiCheck.result.value);

    if (!popupUiCheck.result.value.hasProjectBox || !popupUiCheck.result.value.hasJsonInput || !popupUiCheck.result.value.hasSendBtn) {
      throw new Error("Popup UI missing essential controls!");
    }

    // --- STEP 11: AUDIT CONSOLE ERRORS & EXCEPTIONS ---
    console.log("\n--- STEP 11: Auditing Console Errors & Exceptions ---");
    console.log("Total Console Errors:", consoleErrors.length);
    console.log("Total Uncaught Exceptions:", uncaughtExceptions.length);

    if (consoleErrors.length > 0 || uncaughtExceptions.length > 0) {
      throw new Error("Console errors or uncaught exceptions were detected!");
    }

    console.log("\n=======================================================");
    console.log("🎉 ALL EXTENSION VERIFICATION TESTS PASSED (100%)! 🎉");
    console.log("=======================================================\n");

  } finally {
    if (ws) {
      try { ws.close(); } catch (e) {}
    }
    chromeProcess.kill();
    server.close();
    try {
      fs.rmSync(tempProfile, { recursive: true, force: true });
    } catch (e) {}
  }
}

runExtensionTestSuite().catch(err => {
  console.error("\n❌ TEST SUITE FAILED:", err);
  process.exit(1);
});
