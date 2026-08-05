import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { hydrateCollection, useCollection } from './state/collection';
import { world } from './state/world';

async function boot() {
  await hydrateCollection();

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
  if (params.has('seed-collection') && useCollection.getState().cards.length === 0) {
    const n = Number(params.get('seed-collection')) || 4;
    for (let i = 0; i < n; i++) {
      useCollection.getState().addPulls(world.ripPack('2027-pinnacle-press-chromium-football'));
    }
  }
  createRoot(document.getElementById('root')!).render(<App />);
}

void boot();
