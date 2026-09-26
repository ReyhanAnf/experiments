const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log("=== RUNNING CONTINUITY ENGINE VALIDATION SUITE ===");

const htmlPath = path.join(__dirname, '..', 'timelapse-continuity.html');
if (!fs.existsSync(htmlPath)) {
  console.error("FAIL: timelapse-continuity.html does not exist!");
  process.exit(1);
}

const htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Extract the last script content (the main logic before </body>)
const scriptBlocks = [...htmlContent.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (scriptBlocks.length === 0) {
  console.error("FAIL: Script block not found in timelapse-continuity.html!");
  process.exit(1);
}
const scriptCode = scriptBlocks[scriptBlocks.length - 1][1];

const sandbox = {
  document: {
    addEventListener: () => {},
    getElementById: () => ({
      textContent: '',
      innerHTML: '',
      classList: { add: () => {}, remove: () => {} },
      appendChild: () => {},
      addEventListener: () => {}
    }),
    querySelectorAll: () => []
  },
  window: {},
  navigator: {},
  console: console
};

vm.createContext(sandbox);

// Run the script in VM to evaluate data and functions
try {
  vm.runInContext(scriptCode, sandbox);
  console.log("PASS: Script evaluated without syntax errors.");
} catch (err) {
  console.error("FAIL: Error evaluating script in sandbox:", err);
  process.exit(1);
}

const { SCENARIOS, synthesizeCustomPlan, formatCoreContinuityBlock, compileImageCopyReadyPrompt, compileVideoCopyReadyPrompt } = sandbox.window;

if (!SCENARIOS) {
  console.error("FAIL: SCENARIOS object not exported/found!");
  process.exit(1);
}

const scenarioKeys = Object.keys(SCENARIOS);
console.log(`Found ${scenarioKeys.length} preset scenarios:`, scenarioKeys);

// Validate each scenario
scenarioKeys.forEach(key => {
  console.log(`\n--- Validating Scenario: ${key} ---`);
  const scen = SCENARIOS[key];

  // 1. RFC 8259 JSON validation
  let jsonString = '';
  try {
    jsonString = JSON.stringify(scen);
    const parsed = JSON.parse(jsonString);
    if (!parsed || typeof parsed !== 'object') throw new Error("Parsed is not an object");
    console.log(`  [✓] RFC 8259 JSON valid (size: ${jsonString.length} bytes)`);
  } catch (e) {
    console.error(`  [✗] RFC 8259 serialization failed for ${key}:`, e);
    process.exit(1);
  }

  // 2. Mandatory Schema keys
  const expectedKeys = ['production_summary', 'sequence_map', 'core_prompt', 'images', 'videos'];
  expectedKeys.forEach(k => {
    if (!scen[k]) {
      console.error(`  [✗] Missing mandatory schema key: ${k}`);
      process.exit(1);
    }
  });
  console.log(`  [✓] Mandatory root keys present`);

  // 3. Mathematical relation: images.length == videos.length + 1
  if (scen.images.length !== scen.videos.length + 1) {
    console.error(`  [✗] Math mismatch: images (${scen.images.length}) !== videos (${scen.videos.length}) + 1`);
    process.exit(1);
  }
  console.log(`  [✓] Math rule satisfied: ${scen.images.length} images == ${scen.videos.length} videos + 1`);

  // 4. Video count matching target duration
  const expectedVideos = Math.round(scen.production_summary.target_total_duration_sec / scen.production_summary.video_duration_sec);
  if (scen.videos.length !== expectedVideos) {
    console.error(`  [✗] Video count mismatch: ${scen.videos.length} !== ${expectedVideos}`);
    process.exit(1);
  }
  console.log(`  [✓] Duration equation satisfied: ${scen.production_summary.target_total_duration_sec}s / ${scen.production_summary.video_duration_sec}s = ${scen.videos.length} videos`);

  // 5. Sequence continuity: transition k connects Image k to Image k+1
  for (let k = 0; k < scen.videos.length; k++) {
    const vid = scen.videos[k];
    const fromExpected = `IMAGE ${k + 1}`;
    const toExpected = `IMAGE ${k + 2}`;
    if (vid.from_image_id !== fromExpected || vid.to_image_id !== toExpected) {
      console.error(`  [✗] Continuity break in video ${vid.video_id}: ${vid.from_image_id} -> ${vid.to_image_id} (expected ${fromExpected} -> ${toExpected})`);
      process.exit(1);
    }
  }
  console.log(`  [✓] Sequential continuity strictly verified across all transitions`);

  // 6. full_copy_ready_prompt verification
  scen.images.forEach(img => {
    const hasCore = img.full_copy_ready_prompt && (img.full_copy_ready_prompt.includes("CORE CONTINUITY INSTRUCTION") || img.full_copy_ready_prompt.includes("KONTINUITAS"));
    if (!img.full_copy_ready_prompt || !hasCore || !img.full_copy_ready_prompt.includes(img.image_id)) {
      console.error(`  [✗] Image ${img.image_id} missing pre-combined full_copy_ready_prompt!`);
      process.exit(1);
    }
  });
  scen.videos.forEach(vid => {
    const hasCore = vid.full_copy_ready_prompt && (vid.full_copy_ready_prompt.includes("CORE CONTINUITY INSTRUCTION") || vid.full_copy_ready_prompt.includes("KONTINUITAS"));
    if (!vid.full_copy_ready_prompt || !hasCore || !vid.full_copy_ready_prompt.includes(vid.video_id)) {
      console.error(`  [✗] Video ${vid.video_id} missing pre-combined full_copy_ready_prompt!`);
      process.exit(1);
    }
  });
  console.log(`  [✓] All images and videos contain pre-combined, self-contained full_copy_ready_prompt`);

  // 7. Persistent registries
  if (!scen.core_prompt.worker_identity_registry || scen.core_prompt.worker_identity_registry.length === 0) {
    console.error(`  [✗] Missing worker_identity_registry`);
    process.exit(1);
  }
  if (!scen.core_prompt.equipment_registry || scen.core_prompt.equipment_registry.length === 0) {
    console.error(`  [✗] Missing equipment_registry`);
    process.exit(1);
  }
  console.log(`  [✓] Worker & equipment registries populated`);
});

// Test custom synthesizer
console.log("\n--- Testing Custom Synthesis Engine ---");
const testDurations = [
  { total: 20, clip: 10, expVideos: 2, expImages: 3 },
  { total: 50, clip: 10, expVideos: 5, expImages: 6 },
  { total: 60, clip: 10, expVideos: 6, expImages: 7 },
  { total: 45, clip: 15, expVideos: 3, expImages: 4 }
];

testDurations.forEach(td => {
  const plan = synthesizeCustomPlan("Dynamic Test", td.total, td.clip, "State A", "State B", "Tripod 1.5m");
  if (plan.videos.length !== td.expVideos || plan.images.length !== td.expImages) {
    console.error(`FAIL: Custom plan mismatch for duration ${td.total}/${td.clip}. Expected ${td.expVideos}v/${td.expImages}i, got ${plan.videos.length}v/${plan.images.length}i`);
    process.exit(1);
  }
  // Verify RFC 8259 valid
  JSON.parse(JSON.stringify(plan));
  // Verify full_copy_ready_prompt
  plan.images.forEach(img => {
    if (!img.full_copy_ready_prompt.includes("CORE CONTINUITY INSTRUCTION")) throw new Error("Missing core in custom img prompt");
  });
  plan.videos.forEach(vid => {
    if (!vid.full_copy_ready_prompt.includes("CORE CONTINUITY INSTRUCTION")) throw new Error("Missing core in custom vid prompt");
  });
  console.log(`  [✓] Custom synthesis ${td.total}s @ ${td.clip}s -> ${td.expVideos} videos, ${td.expImages} images valid.`);
});

console.log("\nALL CONTINUITY ENGINE SPECIFICATIONS & TESTS PASSED (100% OK)!\n");
