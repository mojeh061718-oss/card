import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { hydrateCollection, useCollection } from './state/collection';
import { world } from './state/world';
import { loadCachedPhotos, loadCachedScans } from './app/artcache';

async function boot() {
  await hydrateCollection();

  // REALISM CONCEPT: photos and card scans imported in an earlier session
  // live in local IndexedDB — decode them before first render so cards come
  // up real (and offline), and refresh any art rendered before they landed.
  void Promise.all([loadCachedPhotos(), loadCachedScans()]).then(([p, s]) => {
    if (p + s > 0) world.applyOverrides(world.currentOverrides);
  });

  // Ask the browser to keep the save: installed web apps get far better
  // storage durability, and this game's entire state is that one record.
  if (navigator.storage?.persist) {
    void navigator.storage.persisted().then(p => p || navigator.storage.persist());
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    // Relative: resolves under the deploy path (GitHub Pages serves /<repo>/).
    void navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  // Dev helper: ?seed-collection rips packs into the save for UI work.
  const params = new URLSearchParams(location.search);
  // Dev helper: ?enable-tcg unlocks the TCG sets without running the full
  // realism download (procedural concept frames render in place of scans).
  if (params.has('enable-tcg')) useCollection.getState().enableTcg();
  if (params.has('seed-collection') && useCollection.getState().cards.length === 0) {
    const n = Number(params.get('seed-collection')) || 4;
    for (let i = 0; i < n; i++) {
      useCollection.getState().addPulls(world.ripPack('2027-pinnacle-press-chromium-football'));
    }
  }
  createRoot(document.getElementById('root')!).render(<App />);
}

void boot();
