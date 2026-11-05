// The copied document stays static. This only lets the existing assistant close its host popover.
(() => {
  const panel = document.getElementById('stu-assistant-panel');
  const frame = panel?.querySelector('iframe.stu-assistant-frame');
  if (!panel || !frame) return;
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin || event.source !== frame.contentWindow) return;
    if (event.data?.type !== 'stu-campus-assistant:close') return;
    if (panel.matches(':popover-open')) panel.hidePopover();
  });
})();
