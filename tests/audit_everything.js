const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlPath = path.join(__dirname, '..', 'timelapse-continuity.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

const scriptBlocks = [...htmlContent.matchAll(/<script>([\s\S]*?)<\/script>/g)];
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
vm.runInContext(scriptCode, sandbox);

const { SCENARIOS, synthesizeCustomPlan, formatCoreContinuityBlock, compileImageCopyReadyPrompt, compileVideoCopyReadyPrompt, AUTHORITATIVE_SYSTEM_PROMPT } = sandbox.window;

const mandatoryProductionSummaryKeys = [
  'project_name',
  'target_total_duration_sec',
  'video_duration_sec',
  'total_videos',
  'total_images',
  'actual_total_runtime_sec',
  'temporal_summary'
];

const mandatoryCorePromptKeys = [
  'scene_id',
  'project_description',
  'camera_lock',
  'geometry_lock',
  'landmark_lock',
  'material_lock',
  'lighting_lock',
  'environment_lock',
  'worker_identity_registry',
  'equipment_registry',
  'global_physics_rules',
  'global_timelapse_rules',
  'global_negative_rules',
  'raw_core_text'
];

const mandatoryImageKeys = [
  'image_id',
  'state_id',
  'state_purpose',
  'completed_work',
  'active_work',
  'remaining_work',
  'worker_actions',
  'equipment_state',
  'material_state',
  'temporary_elements',
  'physical_evidence',
  'local_negative_prompt',
  'full_copy_ready_prompt'
];

const mandatoryVideoKeys = [
  'video_id',
  'transition_id',
  'from_image_id',
  'to_image_id',
  'target_duration_sec',
  'temporal_compression_level',
  'physical_workload',
  'physical_action_sequence',
  'worker_actions',
  'equipment_actions',
  'material_movement',
  'temporary_element_changes',
  'timelapse_behavior',
  'end_state_convergence',
  'full_copy_ready_prompt'
];

let issues = [];

function auditPlan(plan, label) {
  // 1. JSON parseability
  let jsonStr;
  try {
    jsonStr = JSON.stringify(plan);
    JSON.parse(jsonStr);
  } catch (e) {
    issues.push(`[${label}] Failed RFC 8259 JSON serialization: ${e.message}`);
    return;
  }

  // 2. Root keys
  ['production_summary', 'sequence_map', 'core_prompt', 'images', 'videos'].forEach(k => {
    if (!plan[k]) issues.push(`[${label}] Missing root key: ${k}`);
  });

  // 3. production_summary keys
  if (plan.production_summary) {
    mandatoryProductionSummaryKeys.forEach(k => {
      if (plan.production_summary[k] === undefined || plan.production_summary[k] === null || plan.production_summary[k] === '') {
        issues.push(`[${label}] production_summary.${k} is missing or empty`);
      }
    });

    if (plan.production_summary.total_images !== plan.production_summary.total_videos + 1) {
      issues.push(`[${label}] production_summary math mismatch: total_images (${plan.production_summary.total_images}) != total_videos (${plan.production_summary.total_videos}) + 1`);
    }
  }

  // 4. core_prompt keys
  if (plan.core_prompt) {
    mandatoryCorePromptKeys.forEach(k => {
      if (plan.core_prompt[k] === undefined || plan.core_prompt[k] === null || plan.core_prompt[k] === '') {
        issues.push(`[${label}] core_prompt.${k} is missing or empty`);
      }
    });

    if (!Array.isArray(plan.core_prompt.worker_identity_registry) || plan.core_prompt.worker_identity_registry.length === 0) {
      issues.push(`[${label}] worker_identity_registry is not a non-empty array`);
    } else {
      plan.core_prompt.worker_identity_registry.forEach((w, idx) => {
        if (!w.worker_id || !w.role || !w.visual_profile) {
          issues.push(`[${label}] worker_identity_registry[${idx}] missing required fields`);
        }
      });
    }

    if (!Array.isArray(plan.core_prompt.equipment_registry) || plan.core_prompt.equipment_registry.length === 0) {
      issues.push(`[${label}] equipment_registry is not a non-empty array`);
    } else {
      plan.core_prompt.equipment_registry.forEach((e, idx) => {
        if (!e.equipment_id || !e.type || !e.visual_profile) {
          issues.push(`[${label}] equipment_registry[${idx}] missing required fields`);
        }
      });
    }
  }

  // 5. images
  if (Array.isArray(plan.images)) {
    plan.images.forEach((img, idx) => {
      mandatoryImageKeys.forEach(k => {
        if (img[k] === undefined || img[k] === null || img[k] === '') {
          issues.push(`[${label}] images[${idx}].${k} is missing or empty`);
        }
      });

      // Check full_copy_ready_prompt
      if (img.full_copy_ready_prompt) {
        if (!img.full_copy_ready_prompt.startsWith('CORE CONTINUITY INSTRUCTION:')) {
          issues.push(`[${label}] images[${idx}].full_copy_ready_prompt does not start with 'CORE CONTINUITY INSTRUCTION:'`);
        }
        if (!img.full_copy_ready_prompt.includes('ASSET TYPE: STATIC IMAGE')) {
          issues.push(`[${label}] images[${idx}].full_copy_ready_prompt missing 'ASSET TYPE: STATIC IMAGE'`);
        }
        if (!img.full_copy_ready_prompt.includes(`IMAGE ID: ${img.image_id}`)) {
          issues.push(`[${label}] images[${idx}].full_copy_ready_prompt missing image_id`);
        }
      }
    });
  }

  // 6. videos
  if (Array.isArray(plan.videos)) {
    plan.videos.forEach((vid, idx) => {
      mandatoryVideoKeys.forEach(k => {
        if (vid[k] === undefined || vid[k] === null || vid[k] === '') {
          issues.push(`[${label}] videos[${idx}].${k} is missing or empty`);
        }
      });

      // Check full_copy_ready_prompt
      if (vid.full_copy_ready_prompt) {
        if (!vid.full_copy_ready_prompt.startsWith('CORE CONTINUITY INSTRUCTION:')) {
          issues.push(`[${label}] videos[${idx}].full_copy_ready_prompt does not start with 'CORE CONTINUITY INSTRUCTION:'`);
        }
        if (!vid.full_copy_ready_prompt.includes('ASSET TYPE: TRANSITION VIDEO TIMELAPSE')) {
          issues.push(`[${label}] videos[${idx}].full_copy_ready_prompt missing 'ASSET TYPE: TRANSITION VIDEO TIMELAPSE'`);
        }
        if (!vid.full_copy_ready_prompt.includes(`VIDEO ID: ${vid.video_id}`)) {
          issues.push(`[${label}] videos[${idx}].full_copy_ready_prompt missing video_id`);
        }
      }

      // Check sequential continuity
      const expectedFrom = `IMAGE ${idx + 1}`;
      const expectedTo = `IMAGE ${idx + 2}`;
      if (vid.from_image_id !== expectedFrom || vid.to_image_id !== expectedTo) {
        issues.push(`[${label}] videos[${idx}] continuity mismatch: ${vid.from_image_id}->${vid.to_image_id} (expected ${expectedFrom}->${expectedTo})`);
      }
    });
  }

  // 7. Sequence map
  if (Array.isArray(plan.sequence_map)) {
    const expectedLength = plan.images.length + plan.videos.length;
    if (plan.sequence_map.length !== expectedLength) {
      issues.push(`[${label}] sequence_map length (${plan.sequence_map.length}) != images+videos (${expectedLength})`);
    }
  }
}

// Audit all presets
for (const key of Object.keys(SCENARIOS)) {
  auditPlan(SCENARIOS[key], `Preset:${key}`);
}

console.log("=== Preset Scenarios Audit Results ===");
console.log(`Issues found: ${issues.length}`);
if (issues.length > 0) {
  issues.forEach(i => console.log(" - " + i));
  process.exit(1);
}

// Audit synthesis edge cases
console.log("\n=== Testing Synthesizer Edge Cases ===");

// Edge Case 1: non-divisible durations
const p1 = synthesizeCustomPlan("Non-divisible 47s", 47, 10, "State A", "State B", "Tripod");
auditPlan(p1, "Synth:47s/10s");

// Edge Case 2: small duration (total < clip)
const p2 = synthesizeCustomPlan("Small 5s/10s", 5, 10, "State A", "State B", "Tripod");
auditPlan(p2, "Synth:5s/10s");

// Edge Case 3: single transition (total = clip)
const p3 = synthesizeCustomPlan("Single 10s/10s", 10, 10, "State A", "State B", "Tripod");
auditPlan(p3, "Synth:10s/10s");

// Edge Case 4: zero or negative clip duration (guarded against Infinity/NaN)
const p4 = synthesizeCustomPlan("Zero clip", 40, 0, "State A", "State B", "Tripod");
auditPlan(p4, "Synth:ZeroClip");

// Edge Case 5: negative duration
const p5 = synthesizeCustomPlan("Negative", -20, -5, "State A", "State B", "Tripod");
auditPlan(p5, "Synth:NegativeDuration");

// Edge Case 6: undefined arguments
const p6 = synthesizeCustomPlan();
auditPlan(p6, "Synth:UndefinedArgs");

// Edge Case 7: extremely large duration clamped safely
const p7 = synthesizeCustomPlan("Large", 100000, 10, "State A", "State B", "Tripod");
auditPlan(p7, "Synth:LargeDuration");
if (p7.videos.length > 100) {
  issues.push("Large duration should be clamped to safe boundary <= 100");
}

// Edge Case 8: quotes in strings
const p8 = synthesizeCustomPlan('Test "Quotes" & \\Backslash\\', 30, 10, 'Initial "State" with <tags>', 'Final "State" with \'single quotes\'', 'Camera "Lock"');
auditPlan(p8, "Synth:Quotes");

// Verify AUTHORITATIVE_SYSTEM_PROMPT completeness
console.log("\n=== Verifying Authoritative System Prompt Completeness ===");
const requiredSections = [
  'TIMELAPSE & PHYSICAL TRANSFORMATION CONTINUITY ENGINE',
  '1. CORE OPERATIONAL DIRECTIVES',
  'A. PROCESS MACRO & PHYSICAL CAUSALITY',
  'B. ADAPTIVE STAGE & DURATION PLANNING',
  'C. MASTER SCENE BIBLE & CONTINUITY LOCKS',
  '2. OUTPUT REQUIREMENT: STRICT JSON ONLY',
  'MANDATORY JSON SCHEMA STRUCTURE',
  '3. STRICT RULE FOR full_copy_ready_prompt (CRITICAL)',
  'Structure of full_copy_ready_prompt for IMAGES:',
  'Structure of full_copy_ready_prompt for VIDEOS:',
  '4. PRE-COMPLETION VALIDATION'
];

requiredSections.forEach(sec => {
  if (!AUTHORITATIVE_SYSTEM_PROMPT.includes(sec)) {
    issues.push(`AUTHORITATIVE_SYSTEM_PROMPT missing required section: "${sec}"`);
  }
});

console.log(`\n=== FINAL AUDIT SUMMARY ===`);
console.log(`Total issues identified: ${issues.length}`);
if (issues.length > 0) {
  issues.forEach(i => console.error(" ✗ " + i));
  process.exit(1);
} else {
  console.log("✓ ALL CONTINUITY ENGINE EDGE CASES & AUDITS PASSED WITH ZERO ISSUES!");
}
