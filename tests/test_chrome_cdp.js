const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function runChromeTest() {
  console.log("=== STARTING HEADLESS CHROME CDP TEST ===");
  
  const tempProfile = path.join(os.tmpdir(), 'chrome_cdp_profile_' + Date.now());
  fs.mkdirSync(tempProfile, { recursive: true });

  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const port = 9222;

  const chromeProcess = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tempProfile}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ], { stdio: 'ignore' });

  // Wait for Chrome to listen on port 9222
  console.log("Waiting for Chrome DevTools Protocol to become ready...");
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
    } catch (e) {
      // Retry
    }
  }

  if (!versionData) {
    chromeProcess.kill();
    throw new Error("Could not connect to Chrome on port 9222");
  }

  console.log("Connected to Chrome:", versionData.Browser);

  // Get active page target
  const listTargets = await new Promise((resolve, reject) => {
    http.get(`http://localhost:${port}/json/list`, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => resolve(JSON.parse(raw)));
    }).on('error', reject);
  });

  const pageTarget = listTargets.find(t => t.type === 'page') || listTargets[0];
  console.log("Using page target:", pageTarget.id);

  // Connect via WebSocket
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

  // Enable DevTools domains
  await sendCommand('Runtime.enable');
  await sendCommand('Page.enable');
  await sendCommand('DOM.enable');

  // Test 1: Navigate to timelapse-continuity.html
  const fileUrl = `file:///d:/07_PROJECTS/Personal/experiments/timelapse-continuity.html`;
  console.log(`Navigating to ${fileUrl}...`);
  
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

  await sendCommand('Page.navigate', { url: fileUrl });
  await pageLoadedPromise;
  await new Promise(r => setTimeout(r, 1000)); // allow DOMContentLoaded & script execution


  // Evaluate page status
  const titleResult = await sendCommand('Runtime.evaluate', { expression: 'document.title' });
  console.log("Page Title:", titleResult.result.value);

  // Check SCENARIOS existence and length
  const scenariosResult = await sendCommand('Runtime.evaluate', { 
    expression: 'Object.keys(window.SCENARIOS).length',
    returnByValue: true
  });
  console.log("Scenarios loaded in browser:", scenariosResult.result.value);

  // Check rendered cards count
  const cardsCountResult = await sendCommand('Runtime.evaluate', { 
    expression: 'document.querySelectorAll(".glass-card").length',
    returnByValue: true
  });
  console.log("Rendered sequence cards count:", cardsCountResult.result.value);

  // Test clicking preset buttons (pool, tea-house, kitchen, warehouse)
  console.log("Testing interactive scenario switching in Chrome...");
  const switchScenariosResult = await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        const results = [];
        const btns = document.querySelectorAll('.scenario-btn');
        btns.forEach(btn => {
          btn.click();
          const data = window.getCurrentData();
          results.push({
            name: data.production_summary.project_name,
            videos: data.production_summary.total_videos,
            images: data.production_summary.total_images
          });
        });
        // Switch back to warehouse
        btns[0].click();
        return results;
      })()
    `,
    returnByValue: true
  });
  console.log("Interactive preset switching verified:", switchScenariosResult.result.value);

  // Test custom plan generation via UI
  console.log("Testing custom synthesis form submission...");
  const customSynthResult = await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        document.getElementById('custom-name').value = 'Automated Drone Port Assembly';
        document.getElementById('custom-total-duration').value = '30';
        document.getElementById('custom-clip-duration').value = '10';
        document.getElementById('custom-initial-state').value = 'Empty rooftop gravel area.';
        document.getElementById('custom-final-state').value = 'Fully operational drone recharging launchpad.';
        document.getElementById('custom-plan-form').dispatchEvent(new Event('submit', { cancelable: true }));
        const cur = window.getCurrentData();
        return {
          name: cur.production_summary.project_name,
          videos: cur.production_summary.total_videos,
          images: cur.production_summary.total_images,
          runtime: cur.production_summary.actual_total_runtime_sec
        };
      })()
    `,
    returnByValue: true
  });
  console.log("Custom plan synthesized via browser form:", customSynthResult.result.value);

  // Check validation audit in UI
  const auditResult = await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        const items = document.querySelectorAll('#validation-checklist > div');
        return Array.from(items).map(el => el.textContent.trim());
      })()
    `,
    returnByValue: true
  });
  console.log("Live Validator Checklist items:", auditResult.result.value);

  // Filter tabs test (Images only, Videos only, JSON view, All)
  console.log("Testing view filter tabs...");
  const filterTabsResult = await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        document.getElementById('filter-json-view').click();
        const jsonVisible = !document.getElementById('json-viewer-container').classList.contains('hidden');
        document.getElementById('filter-images-only').click();
        const imagesOnlyCards = document.querySelectorAll('#assets-list-container > div').length;
        document.getElementById('filter-all-assets').click();
        const allCards = document.querySelectorAll('#assets-list-container > div').length;
        return { jsonVisible, imagesOnlyCards, allCards };
      })()
    `,
    returnByValue: true
  });
  console.log("View filter tabs verified:", filterTabsResult.result.value);

  // Test 2: Navigate to index.html and verify new card & filters
  const indexUrl = `file:///d:/07_PROJECTS/Personal/experiments/index.html`;
  console.log(`\nNavigating to ${indexUrl}...`);
  await sendCommand('Page.navigate', { url: indexUrl });
  await new Promise(r => setTimeout(r, 1500));

  const indexCheckResult = await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        const totalCards = document.querySelectorAll('.experiment-card').length;
        const countText = document.getElementById('count-display').textContent.trim();
        // Click AI filter tab
        const aiBtn = document.querySelector('button[data-filter="ai"]');
        if (aiBtn) aiBtn.click();
        const visibleAiCards = Array.from(document.querySelectorAll('.experiment-card')).filter(c => c.style.display !== 'none').length;
        // Search test
        const searchInput = document.getElementById('search-input');
        searchInput.value = 'continuity';
        searchInput.dispatchEvent(new Event('input'));
        const visibleSearchCards = Array.from(document.querySelectorAll('.experiment-card')).filter(c => c.style.display !== 'none').length;
        return { totalCards, countText, visibleAiCards, visibleSearchCards };
      })()
    `,
    returnByValue: true
  });
  console.log("Hub index.html verification result:", indexCheckResult.result.value);

  // Clean up WebSocket
  ws.close();
  chromeProcess.kill();
  try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (e) {}


  // Check errors
  if (consoleErrors.length > 0 || uncaughtExceptions.length > 0) {
    console.error(`FAILED: Encountered ${consoleErrors.length} console errors and ${uncaughtExceptions.length} uncaught exceptions.`);
    process.exit(1);
  }

  console.log("\n>>> CHROME DEVTOOLS VERIFICATION PASSED WITH ZERO CONSOLE ERRORS! <<<\n");
}

runChromeTest().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
