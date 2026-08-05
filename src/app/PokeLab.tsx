/**
 * Creature TCG concept lab — PRIVATE CONCEPT, reachable only via ?pokelab.
 *
 * Renders the bundled concept checklist (Base Set 102 + the 151 roster)
 * through the concept card press: procedural placeholder creatures in a
 * classic frame, holos animated by the same GL foil compositor the sports
 * cards use. A second mode swaps the gallery to REAL card scans fetched at
 * runtime from the public pokemontcg.io CDN — nothing is bundled; images
 * load straight into <img> tags only while the toggle is on.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { openDB, type IDBPDatabase } from 'idb';
import { renderPokeCard, POKE_ASPECT, type PokeCardSpec } from '../render/pokecard';
import { createCardGL, type CardGL } from '../render/glcard';

/**
 * One-tap official art import: every card image for a set is fetched at
 * runtime from the public CDN and cached as blobs in a local IndexedDB
 * store, so after one tap the real scans work offline on this device.
 * Nothing ships in the repo or the deployed bundle — the cache lives only
 * in the player's own browser storage.
 */
let artDbPromise: Promise<IDBPDatabase> | null = null;
function artDb(): Promise<IDBPDatabase> {
  if (!artDbPromise) {
    artDbPromise = openDB('poke-art-cache', 1, {
      upgrade(d) { d.createObjectStore('img'); },
    });
  }
  return artDbPromise;
}

async function cachedArtCount(setKey: string, nums: number[]): Promise<number> {
  const db = await artDb();
  let n = 0;
  for (const num of nums) {
    if (await db.get('img', `${setKey}:${num}`) !== undefined) n++;
  }
  return n;
}

async function importSetArt(
  setKey: string, urlPattern: string, nums: number[],
  onProgress: (done: number, failed: number) => void,
): Promise<{ done: number; failed: number }> {
  const db = await artDb();
  let done = 0, failed = 0;
  const WORKERS = 6;
  await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
    for (let i = w; i < nums.length; i += WORKERS) {
      const key = `${setKey}:${nums[i]}`;
      try {
        if (await db.get('img', key) === undefined) {
          const res = await fetch(urlPattern.replace('{num}', String(nums[i])));
          if (!res.ok) throw new Error(String(res.status));
          await db.put('img', await res.blob(), key);
        }
        done++;
      } catch {
        failed++;
      }
      onProgress(done, failed);
    }
  }));
  return { done, failed };
}

async function loadArtUrls(setKey: string, nums: number[]): Promise<Record<number, string>> {
  const db = await artDb();
  const out: Record<number, string> = {};
  for (const num of nums) {
    const blob = await db.get('img', `${setKey}:${num}`);
    if (blob) out[num] = URL.createObjectURL(blob as Blob);
  }
  return out;
}

interface ConceptCard {
  num: number; name: string; type: string;
  rarity: PokeCardSpec['rarity']; hp: number | null;
  kind: PokeCardSpec['kind'];
}
interface ConceptSet {
  key: string; name: string; year: number; size: number;
  officialArt: string; cards: ConceptCard[];
}

const GALLERY_W = 300;
const FOCUS_W = 400;
const CHUNK = 12;

export function PokeLab() {
  const [sets, setSets] = useState<ConceptSet[] | null>(null);
  const [setKey, setSetKey] = useState('base');
  const [official, setOfficial] = useState(false);
  const [stills, setStills] = useState<string[]>([]);
  const [shown, setShown] = useState(24);
  const [focusIdx, setFocusIdx] = useState(0);
  /** num → object URL for locally cached official art. */
  const [artUrls, setArtUrls] = useState<Record<number, string>>({});
  const [importing, setImporting] = useState<{ done: number; failed: number } | null>(null);
  const [importNote, setImportNote] = useState('');
  const focusRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<CardGL | null>(null);
  const tiltRef = useRef({ x: 0, y: 0, dragging: false });

  useEffect(() => {
    void fetch('presets/pokemon-concept.json')
      .then(r => r.json())
      .then(d => setSets(d.sets));
  }, []);

  const active = useMemo(
    () => sets?.find(s => s.key === setKey) ?? null,
    [sets, setKey],
  );

  // Surface any already-imported art for the active set.
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const nums = active.cards.map(c => c.num);
    void loadArtUrls(active.key, nums).then(urls => { if (alive) setArtUrls(urls); });
    void cachedArtCount(active.key, nums).then(n => {
      if (alive && n > 0) setImportNote(`${n}/${nums.length} official images cached on this device.`);
    });
    return () => { alive = false; };
  }, [active]);

  const runImport = async () => {
    if (!active || importing) return;
    setImporting({ done: 0, failed: 0 });
    const nums = active.cards.map(c => c.num);
    const result = await importSetArt(
      active.key, active.officialArt, nums,
      (done, failed) => setImporting({ done, failed }),
    );
    setImporting(null);
    setArtUrls(await loadArtUrls(active.key, nums));
    setImportNote(result.failed === 0
      ? `All ${result.done} official images imported — they now work offline on this device.`
      : `Imported ${result.done}; ${result.failed} failed (network/CORS). Showing hotlinked images for those.`);
    setOfficial(true);
  };

  const specFor = (card: ConceptCard): PokeCardSpec => ({
    name: card.name, type: card.type, rarity: card.rarity, hp: card.hp,
    kind: card.kind, num: card.num,
    setName: active!.name, setSize: active!.size, setYear: active!.year,
  });

  // Gallery stills, rendered in chunks so the page stays responsive.
  useEffect(() => {
    if (!active || official) return;
    setStills([]);
    let cancelled = false;
    const scratch = document.createElement('canvas');
    scratch.width = GALLERY_W;
    scratch.height = Math.round(GALLERY_W / POKE_ASPECT);
    const gl = createCardGL(scratch);
    const out: string[] = [];
    const step = (i: number) => {
      if (cancelled || i >= Math.min(active.cards.length, shown)) {
        gl.destroy();
        return;
      }
      const end = Math.min(i + CHUNK, active.cards.length, shown);
      for (let k = i; k < end; k++) {
        const card = active.cards[k];
        const layers = renderPokeCard(specFor(card), 460);
        gl.setLayers(layers.print, layers.foilMask);
        gl.draw({
          print: layers.print, foilMask: layers.foilMask,
          finish: card.rarity === 'holo' ? (setKey === 'base' ? 'disco' : 'refractor') : 'none',
          tintHex: null, tiltX: 0.2, tiltY: -0.1, timeSec: 0,
          aspect: layers.heightPx / layers.widthPx,
        });
        out.push(scratch.toDataURL('image/png'));
      }
      setStills([...out]);
      setTimeout(() => step(end), 16);
    };
    step(0);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, shown, official]);

  // Live focus card with foil tilt.
  useEffect(() => {
    if (!active || official) return;
    const canvas = focusRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = FOCUS_W * dpr;
    canvas.height = Math.round((FOCUS_W / POKE_ASPECT) * dpr);
    if (!glRef.current) glRef.current = createCardGL(canvas);
    const gl = glRef.current;
    const card = active.cards[Math.min(focusIdx, active.cards.length - 1)];
    const layers = renderPokeCard(specFor(card), 700);
    gl.setLayers(layers.print, layers.foilMask);
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      const t = (now - t0) / 1000;
      const auto = tiltRef.current.dragging ? 0 : 1;
      gl.draw({
        print: layers.print, foilMask: layers.foilMask,
        finish: card.rarity === 'holo' ? (setKey === 'base' ? 'disco' : 'refractor') : 'none',
        tintHex: null,
        tiltX: tiltRef.current.x + auto * Math.sin(t * 0.8) * 0.35,
        tiltY: tiltRef.current.y + auto * Math.cos(t * 0.6) * 0.2,
        timeSec: t,
        aspect: layers.heightPx / layers.widthPx,
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onMove = (e: PointerEvent) => {
      if (!tiltRef.current.dragging) return;
      const r = canvas.getBoundingClientRect();
      tiltRef.current.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      tiltRef.current.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const onDown = (e: PointerEvent) => { tiltRef.current.dragging = true; onMove(e); };
    const onUp = () => { tiltRef.current.dragging = false; };
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, focusIdx, official, setKey]);

  useEffect(() => () => { glRef.current?.destroy(); glRef.current = null; }, []);

  if (!sets || !active) {
    return <div style={{ padding: 30, opacity: 0.6 }}>Loading concept checklist…</div>;
  }

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: '0 auto', overflowY: 'auto', height: '100%' }}>
      <h1 style={{ fontSize: 18, letterSpacing: 2, opacity: 0.85, marginBottom: 2 }}>
        CREATURE TCG — CONCEPT LAB
      </h1>
      <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 10, lineHeight: 1.5 }}>
        Private concept, not wired into the game. Placeholder art is procedural and
        original; OFFICIAL SCANS mode fetches images at runtime from the public
        pokemontcg.io CDN and bundles nothing.
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {sets.map(s => (
          <button key={s.key} onClick={() => { setSetKey(s.key); setFocusIdx(0); setShown(24); }}
            style={{ ...chip, ...(setKey === s.key ? chipOn : {}) }}>
            {s.name.toUpperCase()} · {s.size}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button onClick={runImport} disabled={!!importing}
          style={{ ...chip, borderColor: '#d4a017', color: '#e8c86a' }}>
          {importing
            ? `IMPORTING… ${importing.done + importing.failed}/${active.cards.length}`
            : '⚡ IMPORT OFFICIAL ART — ONE TAP'}
        </button>
        <button onClick={() => setOfficial(o => !o)}
          style={{ ...chip, ...(official ? chipOn : {}) }}>
          {official ? '◉ OFFICIAL SCANS' : '○ OFFICIAL SCANS'}
        </button>
      </div>
      {importNote && (
        <div style={{
          fontSize: 11, color: '#8ee08e', background: 'rgba(142,224,142,0.08)',
          border: '1px solid rgba(142,224,142,0.3)', borderRadius: 8,
          padding: '7px 10px', marginBottom: 12,
        }}>
          {importNote}
        </div>
      )}

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {!official && (
          <div style={{ position: 'sticky', top: 8 }}>
            <canvas
              ref={focusRef}
              data-testid="poke-focus"
              style={{
                width: FOCUS_W, borderRadius: 14, touchAction: 'none',
                boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
              }}
            />
            <div style={{ textAlign: 'center', fontSize: 13, marginTop: 8, opacity: 0.8 }}>
              {active.cards[Math.min(focusIdx, active.cards.length - 1)].name}
              {' · '}{active.cards[Math.min(focusIdx, active.cards.length - 1)].rarity.toUpperCase()}
              {' · '}{active.cards[Math.min(focusIdx, active.cards.length - 1)].num}/{active.size}
            </div>
          </div>
        )}

        <div style={{
          display: 'grid', gap: 12, flex: 1, minWidth: 280,
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        }}>
          {official
            ? active.cards.slice(0, shown).map(card => (
              <figure key={card.num} style={{ margin: 0 }}>
                <img
                  // Imported cache first (offline-capable); hotlink fallback.
                  src={artUrls[card.num] ?? active.officialArt.replace('{num}', String(card.num))}
                  alt={card.name} loading="lazy"
                  style={{ width: '100%', borderRadius: 8, display: 'block', boxShadow: '0 8px 22px rgba(0,0,0,0.5)' }}
                />
                <figcaption style={{ fontSize: 10, opacity: 0.6, marginTop: 3, textAlign: 'center' }}>
                  {card.name} · {card.num}/{active.size}
                  {artUrls[card.num] ? ' · cached' : ''}
                </figcaption>
              </figure>
            ))
            : stills.map((url, i) => (
              <figure key={i} style={{ margin: 0, cursor: 'pointer' }} onClick={() => setFocusIdx(i)}>
                <img src={url} alt={active.cards[i].name} style={{
                  width: '100%', borderRadius: 8, display: 'block',
                  outline: i === focusIdx ? '2px solid #d4af37' : 'none',
                  boxShadow: '0 8px 22px rgba(0,0,0,0.5)',
                }} />
                <figcaption style={{ fontSize: 10, opacity: 0.6, marginTop: 3, textAlign: 'center' }}>
                  {active.cards[i].name} · {active.cards[i].num}/{active.size}
                </figcaption>
              </figure>
            ))}
          {shown < active.cards.length && (
            <button onClick={() => setShown(s => Math.min(active.cards.length, s + 36))}
              style={{ ...chip, gridColumn: '1 / -1', padding: '14px 0' }}>
              SHOW MORE ({active.cards.length - shown} left)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const chip: React.CSSProperties = {
  background: 'rgba(255,255,255,0.07)', color: 'rgba(244,242,236,0.75)',
  border: '1px solid rgba(255,255,255,0.14)', borderRadius: 18,
  padding: '7px 12px', fontSize: 11, fontWeight: 800, letterSpacing: 1,
};
const chipOn: React.CSSProperties = {
  background: '#d4a017', color: '#1a1405', borderColor: '#d4a017',
};
