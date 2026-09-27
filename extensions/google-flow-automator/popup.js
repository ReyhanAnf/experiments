// POPUP CONTROLLER
document.addEventListener('DOMContentLoaded', () => {
  const popProjectName = document.getElementById('pop-project-name');
  const popProjectStats = document.getElementById('pop-project-stats');
  const popJsonInput = document.getElementById('pop-json-input');
  const popBtnSend = document.getElementById('pop-btn-send');
  const popBtnOpenFlow = document.getElementById('pop-btn-open-flow');
  const popStatus = document.getElementById('pop-status');

  // Load current saved state
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['tc_flow_state'], res => {
      if (res && res.tc_flow_state && res.tc_flow_state.activePlan) {
        const plan = res.tc_flow_state.activePlan;
        popProjectName.textContent = plan.project_meta?.project_name || plan.production_summary?.project_name || 'Continuity Project';
        const imgCount = plan.project_meta?.total_images || (plan.images || []).length;
        const vidCount = plan.project_meta?.total_videos || (plan.videos || []).length;
        const aspect = plan.project_meta?.target_aspect_ratio || '16:9';
        popProjectStats.textContent = `${imgCount} Images · ${vidCount} Videos (${aspect})`;
      } else {
        popProjectName.textContent = 'Belum ada proyek yang dimuat';
        popProjectStats.textContent = 'Tempel JSON di bawah untuk memulai';
      }
    });
  }

  // Send JSON to current active tab
  if (popBtnSend) {
    popBtnSend.addEventListener('click', () => {
      const raw = (popJsonInput.value || '').trim();
      if (!raw) {
        alert('Harap masukkan JSON proyek terlebih dahulu.');
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!parsed.images || !Array.isArray(parsed.images)) {
          alert('JSON wajib memiliki properti array "images".');
          return;
        }

        // Save to chrome storage
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get(['tc_flow_state'], res => {
            const cur = res.tc_flow_state || {};
            cur.activePlan = parsed;
            cur.currentImageIdx = 0;
            cur.currentVideoIdx = 0;
            cur.activeStage = 'images';
            chrome.storage.local.set({ tc_flow_state: cur }, () => {
              // Send message to active tab
              chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs && tabs[0]) {
                  chrome.tabs.sendMessage(tabs[0].id, { type: 'TC_SET_PROJECT', plan: parsed });
                }
              });
              popProjectName.textContent = parsed.project_meta?.project_name || parsed.production_summary?.project_name || 'Custom Plan';
              const imgCount = parsed.project_meta?.total_images || parsed.images.length;
              const vidCount = parsed.project_meta?.total_videos || (parsed.videos || []).length;
              popProjectStats.textContent = `${imgCount} Images · ${vidCount} Videos`;
              popJsonInput.value = '';
              popStatus.style.display = 'block';
              setTimeout(() => { popStatus.style.display = 'none'; }, 2500);
            });
          });
        }
      } catch (err) {
        alert('Format JSON tidak valid: ' + err.message);
      }
    });
  }

  if (popBtnOpenFlow) {
    popBtnOpenFlow.addEventListener('click', () => {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.create({ url: 'https://labs.google/fx/' });
      } else {
        window.open('https://labs.google/fx/', '_blank');
      }
    });
  }
});
