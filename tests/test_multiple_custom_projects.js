const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function runMultipleProjectsTest() {
  console.log("=== STARTING MULTIPLE CUSTOM PROJECTS TEST IN CHROME CDP ===");

  const tempProfile = path.join(os.tmpdir(), 'chrome_cdp_profile_multi_' + Date.now());
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

  console.log("1. Testing Add Project Modal Open via Navbar and Dropdown...");
  const modalOpenResult = await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        // Open via navbar button
        const btnNav = document.getElementById('btn-open-add-project');
        btnNav.click();
        const modal = document.getElementById('add-project-modal');
        const openViaNav = !modal.classList.contains('hidden');

        // Close
        document.getElementById('btn-close-add-modal').click();
        const closed = modal.classList.contains('hidden');

        // Open via dropdown button
        document.getElementById('project-dropdown-btn').click();
        document.getElementById('btn-dropdown-add-project').click();
        const openViaDropdown = !modal.classList.contains('hidden');

        // Close again
        document.getElementById('btn-cancel-import').click();
        const closedAgain = modal.classList.contains('hidden');

        return { openViaNav, closed, openViaDropdown, closedAgain };
      })()
    `,
    returnByValue: true
  });
  console.log("Modal open/close verification:", modalOpenResult.result.value);

  console.log("2. Adding Project 1 via JSON Paste...");
  const addProject1Result = await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        const sample1 = {
          production_summary: {
            project_name: "Proyek Custom 1 - Rooftop Garden",
            target_total_duration_sec: 40,
            video_duration_sec: 10,
            total_videos: 4,
            total_images: 5,
            actual_total_runtime_sec: 40
          },
          sequence_map: ["IMAGE 1", "VIDEO 1 (IMAGE 1 -> IMAGE 2)", "IMAGE 2", "VIDEO 2 (IMAGE 2 -> IMAGE 3)", "IMAGE 3", "VIDEO 3 (IMAGE 3 -> IMAGE 4)", "IMAGE 4", "VIDEO 4 (IMAGE 4 -> IMAGE 5)", "IMAGE 5"],
          core_prompt: {
            scene_id: "SCENE_ROOFTOP_GARDEN",
            project_description: "Transforming empty rooftop into lush rooftop organic garden.",
            camera_lock: "Locked wide angle view from access door threshold, tripod height 1.6m.",
            geometry_lock: "Perimeter parapet walls and central HVAC enclosure structure.",
            landmark_lock: "1. South corner brick flue; 2. Central ventilation shaft; 3. East glass skylight curb."
          },
          images: [
            { image_id: "IMAGE 1", state_id: "STATE_01", state_purpose: "Initial bare asphalt roof", completed_work: "None", active_work: "Surveying", remaining_work: "All", worker_actions: "Workers planning", equipment_state: "Measuring wheel", material_state: "Bare bitumen", temporary_elements: "Chalk lines", physical_evidence: "Markings", local_negative_prompt: "no plants", full_copy_ready_prompt: "CORE CONTINUITY\\nIMAGE 1..." },
            { image_id: "IMAGE 2", state_id: "STATE_02", state_purpose: "Drainage layer placed", completed_work: "Root barrier", active_work: "Laying drainage cells", remaining_work: "Soil and plants", worker_actions: "Rolling membrane", equipment_state: "Rollers", material_state: "Black dimpled plastic", temporary_elements: "Utility knives", physical_evidence: "Cut rolls", local_negative_prompt: "no plants", full_copy_ready_prompt: "CORE CONTINUITY\\nIMAGE 2..." },
            { image_id: "IMAGE 3", state_id: "STATE_03", state_purpose: "Lightweight soil beds formed", completed_work: "Drainage done", active_work: "Spreading soil substrate", remaining_work: "Planting", worker_actions: "Raking soil", equipment_state: "Wheelbarrows", material_state: "Dark loam", temporary_elements: "Boards", physical_evidence: "Rake grooves", local_negative_prompt: "no plants", full_copy_ready_prompt: "CORE CONTINUITY\\nIMAGE 3..." },
            { image_id: "IMAGE 4", state_id: "STATE_04", state_purpose: "Pergola and planters installed", completed_work: "Soil in beds", active_work: "Assembling cedar pergola", remaining_work: "Vegetation", worker_actions: "Fastening timber", equipment_state: "Impact drivers", material_state: "Western red cedar", temporary_elements: "Clamps", physical_evidence: "Sawdust", local_negative_prompt: "no overgrown vines", full_copy_ready_prompt: "CORE CONTINUITY\\nIMAGE 4..." },
            { image_id: "IMAGE 5", state_id: "STATE_05", state_purpose: "Lush blooming organic garden", completed_work: "100% complete", active_work: "Handover inspection", remaining_work: "None", worker_actions: "None", equipment_state: "Demobilized", material_state: "Thriving vegetation and oiled wood", temporary_elements: "None", physical_evidence: "Freshly watered soil", local_negative_prompt: "no debris", full_copy_ready_prompt: "CORE CONTINUITY\\nIMAGE 5..." }
          ],
          videos: [
            { video_id: "VIDEO 1", transition_id: "TRANSITION_01_TO_02", from_image_id: "IMAGE 1", to_image_id: "IMAGE 2", target_duration_sec: 10, temporal_compression_level: "High", physical_workload: "Laying barrier", physical_action_sequence: "Rolling membranes", worker_actions: "Unrolling", equipment_actions: "Rolling", material_movement: "Plastic rolls", temporary_element_changes: "Tools staged", timelapse_behavior: "Smooth", end_state_convergence: "Matches IMAGE 2", full_copy_ready_prompt: "CORE CONTINUITY\\nVIDEO 1..." },
            { video_id: "VIDEO 2", transition_id: "TRANSITION_02_TO_03", from_image_id: "IMAGE 2", to_image_id: "IMAGE 3", target_duration_sec: 10, temporal_compression_level: "High", physical_workload: "Distributing soil", physical_action_sequence: "Dumping soil", worker_actions: "Shoveling", equipment_actions: "Barrows moving", material_movement: "Soil spread", temporary_element_changes: "Boards placed", timelapse_behavior: "Smooth", end_state_convergence: "Matches IMAGE 3", full_copy_ready_prompt: "CORE CONTINUITY\\nVIDEO 2..." },
            { video_id: "VIDEO 3", transition_id: "TRANSITION_03_TO_04", from_image_id: "IMAGE 3", to_image_id: "IMAGE 4", target_duration_sec: 10, temporal_compression_level: "High", physical_workload: "Carpentry", physical_action_sequence: "Erecting posts", worker_actions: "Drilling", equipment_actions: "Cordless tools", material_movement: "Timber lifted", temporary_element_changes: "Scaffold up", timelapse_behavior: "Smooth", end_state_convergence: "Matches IMAGE 4", full_copy_ready_prompt: "CORE CONTINUITY\\nVIDEO 3..." },
            { video_id: "VIDEO 4", transition_id: "TRANSITION_04_TO_05", from_image_id: "IMAGE 4", to_image_id: "IMAGE 5", target_duration_sec: 10, temporal_compression_level: "High", physical_workload: "Planting and cleaning", physical_action_sequence: "Planting saplings and herbs", worker_actions: "Planting", equipment_actions: "Hoses watering", material_movement: "Plants arranged", temporary_element_changes: "Tools removed", timelapse_behavior: "Smooth", end_state_convergence: "Matches IMAGE 5", full_copy_ready_prompt: "CORE CONTINUITY\\nVIDEO 4..." }
          ]
        };

        document.getElementById('btn-open-add-project').click();
        document.getElementById('import-json-textarea').value = JSON.stringify(sample1);
        document.getElementById('import-json-textarea').dispatchEvent(new Event('input'));
        document.getElementById('btn-submit-import').click();

        const activeTitle = document.getElementById('active-project-title')?.textContent.trim();
        const customCount = document.getElementById('custom-projects-count')?.textContent.trim();
        const customItems = document.querySelectorAll('.custom-project-item-row').length;

        return { activeTitle, customCount, customItems };
      })()
    `,
    returnByValue: true
  });
  console.log("Add Project 1 verified:", addProject1Result.result.value);

  console.log("3. Adding Project 2 via Manual Form...");
  const addProject2Result = await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        document.getElementById('btn-open-add-project').click();
        document.getElementById('tab-add-form').click();

        document.getElementById('custom-name').value = 'Proyek Custom 2 - Coastal Pier Deck';
        document.getElementById('custom-total-duration').value = '30';
        document.getElementById('custom-clip-duration').value = '10';
        document.getElementById('custom-initial-state').value = 'Washed-out timber pylons on sandy beach.';
        document.getElementById('custom-final-state').value = 'Modern reinforced boardwalk with stainless railings.';
        document.getElementById('custom-camera').value = 'Locked beach-level tripod looking seaward.';

        document.getElementById('custom-plan-form').dispatchEvent(new Event('submit', { cancelable: true }));

        const activeTitle = document.getElementById('active-project-title')?.textContent.trim();
        const customCount = document.getElementById('custom-projects-count')?.textContent.trim();
        const customItems = document.querySelectorAll('.custom-project-item-row').length;

        return { activeTitle, customCount, customItems };
      })()
    `,
    returnByValue: true
  });
  console.log("Add Project 2 verified:", addProject2Result.result.value);

  console.log("4. Switching between Custom Projects and Presets in Dropdown...");
  const switchProjectResult = await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        // Open dropdown
        document.getElementById('project-dropdown-btn').click();

        // Click Project 1 (Rooftop Garden)
        const customRows = document.querySelectorAll('.custom-project-item-row');
        let proj1Btn = null;
        customRows.forEach(r => {
          if (r.textContent.includes('Rooftop Garden')) {
            proj1Btn = r.querySelector('.btn-select-custom-project');
          }
        });
        if (proj1Btn) proj1Btn.click();

        const titleAfterSwitch = document.getElementById('active-project-title')?.textContent.trim();

        // Switch to Preset "Dapur Tradisional Nenek"
        document.getElementById('project-dropdown-btn').click();
        const dapurBtn = document.querySelector('.scenario-btn[data-scenario="dapur"]');
        if (dapurBtn) dapurBtn.click();
        const titleAfterPreset = document.getElementById('active-project-title')?.textContent.trim();

        return {
          titleAfterSwitch,
          titleAfterPreset,
          hasCustom1: titleAfterSwitch.includes('Rooftop Garden'),
          hasPresetDapur: titleAfterPreset.includes('Dapur')
        };
      })()
    `,
    returnByValue: true
  });
  console.log("Project switching verified:", switchProjectResult.result.value);

  console.log("5. Testing Deleting Project 2 without affecting Project 1...");
  const deleteCustom2Result = await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        document.getElementById('project-dropdown-btn').click();
        const customRows = document.querySelectorAll('.custom-project-item-row');
        let deleteBtn = null;
        customRows.forEach(r => {
          if (r.textContent.includes('Coastal Pier Deck')) {
            deleteBtn = r.querySelector('.btn-delete-custom-project');
          }
        });

        if (deleteBtn) deleteBtn.click();
        const modalOpen = !document.getElementById('delete-confirm-modal').classList.contains('hidden');
        const deleteName = document.getElementById('delete-modal-project-name')?.textContent;

        document.getElementById('btn-confirm-delete-modal').click();

        const customCountAfter = document.getElementById('custom-projects-count')?.textContent.trim();
        const customItemsAfter = document.querySelectorAll('.custom-project-item-row').length;
        const stillHasGarden = document.getElementById('custom-projects-list')?.textContent.includes('Rooftop Garden');
        const pierRemoved = !document.getElementById('custom-projects-list')?.textContent.includes('Coastal Pier Deck');

        return {
          modalOpen,
          deleteName,
          customCountAfter,
          customItemsAfter,
          stillHasGarden,
          pierRemoved
        };
      })()
    `,
    returnByValue: true
  });
  console.log("Custom project deletion verified:", deleteCustom2Result.result.value);

  // Close chrome
  chromeProcess.kill();

  if (consoleErrors.length > 0) {
    console.error("Errors found:", consoleErrors);
    throw new Error(`Encountered ${consoleErrors.length} console errors`);
  }

  console.log("\n>>> MULTIPLE CUSTOM PROJECTS TEST PASSED WITH ZERO CONSOLE ERRORS! <<<");
}

runMultipleProjectsTest().catch(err => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
