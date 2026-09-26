const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function runDeleteAllProjectsTest() {
  console.log("=== STARTING DELETE ALL PROJECTS & PERSISTENT EMPTY STATE TEST IN CHROME CDP ===");

  const tempProfile = path.join(os.tmpdir(), 'chrome_cdp_profile_delall_' + Date.now());
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
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  let msgId = 1;
  const pendingRequests = new Map();
  const consoleErrors = [];

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
      if (data.error) reject(new Error(`Command ${method} failed: ${JSON.stringify(data.error)}`));
      else resolve(data.result);
    } else if (data.method === 'Runtime.consoleAPICalled') {
      const type = data.params.type;
      const text = data.params.args.map(a => a.value || a.description || '').join(' ');
      if (type === 'error') consoleErrors.push(text);
    }
  };

  await sendCommand('Runtime.enable');
  await sendCommand('Page.enable');

  const fileUrl = `file:///d:/07_PROJECTS/Personal/experiments/timelapse-continuity.html`;
  await sendCommand('Page.navigate', { url: fileUrl });
  await new Promise(r => setTimeout(r, 1200));

  console.log("1. Adding 1 Custom Project first...");
  const addCustomResult = await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        const sample = {
          production_summary: {
            project_name: "Custom Project Alpha",
            target_total_duration_sec: 20,
            video_duration_sec: 10,
            total_videos: 2,
            total_images: 3,
            actual_total_runtime_sec: 20
          },
          sequence_map: ["IMAGE 1", "VIDEO 1 (IMAGE 1 -> IMAGE 2)", "IMAGE 2", "VIDEO 2 (IMAGE 2 -> IMAGE 3)", "IMAGE 3"],
          core_prompt: {
            scene_id: "SCENE_ALPHA",
            project_description: "Alpha test project",
            camera_lock: "Tripod lock",
            geometry_lock: "Walls lock",
            landmark_lock: "Center pillar"
          },
          images: [
            { image_id: "IMAGE 1", state_id: "STATE_01", full_copy_ready_prompt: "CORE PROMPT\\nIMAGE 1" },
            { image_id: "IMAGE 2", state_id: "STATE_02", full_copy_ready_prompt: "CORE PROMPT\\nIMAGE 2" },
            { image_id: "IMAGE 3", state_id: "STATE_03", full_copy_ready_prompt: "CORE PROMPT\\nIMAGE 3" }
          ],
          videos: [
            { video_id: "VIDEO 1", from_image_id: "IMAGE 1", to_image_id: "IMAGE 2", target_duration_sec: 10, full_copy_ready_prompt: "CORE PROMPT\\nVIDEO 1" },
            { video_id: "VIDEO 2", from_image_id: "IMAGE 2", to_image_id: "IMAGE 3", target_duration_sec: 10, full_copy_ready_prompt: "CORE PROMPT\\nVIDEO 2" }
          ]
        };

        document.getElementById('btn-open-add-project').click();
        document.getElementById('import-json-textarea').value = JSON.stringify(sample);
        document.getElementById('import-json-textarea').dispatchEvent(new Event('input'));
        document.getElementById('btn-submit-import').click();

        return {
          activeTitle: document.getElementById('active-project-title')?.textContent.trim(),
          customCount: document.getElementById('custom-projects-count')?.textContent.trim()
        };
      })()
    `,
    returnByValue: true
  });
  console.log("Custom project added:", addCustomResult.result.value);

  console.log("2. Deleting the Custom Project...");
  const deleteCustomResult = await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        document.getElementById('project-dropdown-btn').click();
        const deleteBtn = document.querySelector('.btn-delete-custom-project');
        deleteBtn.click();
        document.getElementById('btn-confirm-delete-modal').click();
        return {
          customCount: document.getElementById('custom-projects-count')?.textContent.trim(),
          activeTitle: document.getElementById('active-project-title')?.textContent.trim()
        };
      })()
    `,
    returnByValue: true
  });
  console.log("Custom project deleted:", deleteCustomResult.result.value);

  console.log("3. Deleting ALL 5 preset scenarios one by one...");
  const deletePresetsResult = await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        const presetKeys = ['warehouse', 'dapur', 'pool', 'tea-house', 'kitchen'];
        const deletedNames = [];

        presetKeys.forEach(k => {
          document.getElementById('project-dropdown-btn').click();
          const btn = document.querySelector(\`.btn-delete-preset[data-delete-key="\${k}"]\`);
          if (btn) {
            btn.click();
            document.getElementById('btn-confirm-delete-modal').click();
            deletedNames.push(k);
          }
        });

        const deletedList = window.getDeletedProjects();
        const currentData = window.getCurrentData();
        const activeTitle = document.getElementById('active-project-title')?.textContent.trim();
        const activeTag = document.getElementById('active-project-tag')?.textContent.trim();
        const emptyCard = document.getElementById('empty-state-assets-card');
        const actionsHidden = document.getElementById('active-project-actions-container')?.classList.contains('hidden');
        const restoreVisible = !document.getElementById('restore-presets-container')?.classList.contains('hidden');

        return {
          deletedNames,
          deletedCount: deletedList.length,
          currentDataId: currentData?.id,
          activeTitle,
          activeTag,
          hasEmptyCard: Boolean(emptyCard),
          actionsHidden,
          restoreVisible
        };
      })()
    `,
    returnByValue: true
  });
  console.log("All projects deleted status:", deletePresetsResult.result.value);

  const res1 = deletePresetsResult.result.value;
  if (res1.deletedCount !== 5) {
    throw new Error(`Expected 5 presets in deleted list, got ${res1.deletedCount}`);
  }
  if (res1.currentDataId !== 'empty') {
    throw new Error(`Expected currentData.id === 'empty', got ${res1.currentDataId}`);
  }
  if (!res1.activeTitle.includes("Belum Ada Proyek")) {
    throw new Error(`Expected activeTitle to be 'Belum Ada Proyek', got '${res1.activeTitle}'`);
  }
  if (!res1.hasEmptyCard) {
    throw new Error("Expected empty state card in assets list!");
  }
  if (!res1.actionsHidden) {
    throw new Error("Expected action buttons to be hidden when project is empty!");
  }

  console.log("4. Reloading the page to test PERSISTENCE (must NOT resurrect presets)...");
  await sendCommand('Page.navigate', { url: fileUrl });
  await new Promise(r => setTimeout(r, 1200));

  const afterReloadResult = await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        const deletedList = window.getDeletedProjects();
        const currentData = window.getCurrentData();
        const activeTitle = document.getElementById('active-project-title')?.textContent.trim();
        const emptyCard = document.getElementById('empty-state-assets-card');
        const restoreContainer = document.getElementById('restore-presets-container');
        const restoreVisible = !restoreContainer?.classList.contains('hidden');
        const visiblePresetRows = document.querySelectorAll('.scenario-item-row:not(.hidden)').length;

        return {
          deletedCount: deletedList.length,
          currentDataId: currentData?.id,
          activeTitle,
          hasEmptyCard: Boolean(emptyCard),
          restoreVisible,
          visiblePresetRows
        };
      })()
    `,
    returnByValue: true
  });
  console.log("After reload verification:", afterReloadResult.result.value);

  const res2 = afterReloadResult.result.value;
  if (res2.deletedCount !== 5) {
    throw new Error(`Presets resurrected! Expected 5 deleted, got ${res2.deletedCount}`);
  }
  if (res2.currentDataId !== 'empty') {
    throw new Error(`Presets resurrected! Expected empty plan, got ${res2.currentDataId}`);
  }
  if (!res2.activeTitle.includes("Belum Ada Proyek")) {
    throw new Error(`Active title was resurrected to: '${res2.activeTitle}'`);
  }
  if (!res2.hasEmptyCard) {
    throw new Error("Empty state card missing after page reload!");
  }
  if (res2.visiblePresetRows !== 0) {
    throw new Error(`Expected 0 visible preset rows in dropdown, got ${res2.visiblePresetRows}`);
  }

  console.log("5. Testing 'Pulihkan Preset Default' explicit restoration...");
  const restoreResult = await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        // Click restore button in empty card
        const btnRestore = document.getElementById('btn-empty-restore-presets');
        btnRestore.click();

        const deletedList = window.getDeletedProjects();
        const currentData = window.getCurrentData();
        const activeTitle = document.getElementById('active-project-title')?.textContent.trim();
        const cardsCount = document.querySelectorAll('.glass-card').length;
        const visiblePresetRows = document.querySelectorAll('.scenario-item-row:not(.hidden)').length;

        return {
          deletedCount: deletedList.length,
          currentDataId: currentData?.id,
          activeTitle,
          cardsCount,
          visiblePresetRows
        };
      })()
    `,
    returnByValue: true
  });
  console.log("After restore verification:", restoreResult.result.value);

  const res3 = restoreResult.result.value;
  if (res3.deletedCount !== 0) {
    throw new Error(`Expected deleted projects to be cleared (0), got ${res3.deletedCount}`);
  }
  if (!res3.activeTitle.includes("Warehouse")) {
    throw new Error(`Expected active project to switch back to Warehouse, got '${res3.activeTitle}'`);
  }
  if (res3.visiblePresetRows < 5) {
    throw new Error(`Expected all 5 preset rows to be restored, got ${res3.visiblePresetRows}`);
  }

  // Close Chrome
  chromeProcess.kill();

  if (consoleErrors.length > 0) {
    console.error("Console errors found:", consoleErrors);
    throw new Error(`Encountered ${consoleErrors.length} console errors`);
  }

  console.log("\n>>> DELETE ALL PROJECTS & PERSISTENCE TEST PASSED WITH ZERO CONSOLE ERRORS! <<<");
}

runDeleteAllProjectsTest().catch(err => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
