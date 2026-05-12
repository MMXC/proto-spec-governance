async function load(): Promise<void> {
  const { psDebugVerbose } = await browser.storage.local.get('psDebugVerbose');
  const cb = document.getElementById('opt-debug') as HTMLInputElement | null;
  if (cb) cb.checked = Boolean(psDebugVerbose);
}

document.getElementById('opt-debug')?.addEventListener('change', async (e) => {
  const v = (e.target as HTMLInputElement).checked;
  await browser.storage.local.set({ psDebugVerbose: v });
});

void load();
