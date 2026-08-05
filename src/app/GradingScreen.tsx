/**
 * Grading: inspect with the loupe, pick a house, wait out the turnaround,
 * then the reveal ceremony. The grade was always in the cardboard — the
 * loupe lets you find it before you pay.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useCollection, type CardInstance } from '../state/collection';
import { world } from '../state/world';
import { snapshotCard } from './cardview';
import { renderSlab } from '../render/slab';
import { COMPANIES, TIERS, type Tier } from '../engine/condition/grading';
import { sfx, unlockAudio } from './feel';

export function GradingScreen() {
  const { cards, day, submissions, returns, listings, submitForGrading, endDay, revealReturn } = useCollection();
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [companyKey, setCompanyKey] = useState('psg');
  const [tier, setTier] = useState<Tier>(1);
  const [inspect, setInspect] = useState<CardInstance | null>(null);
  const [reveal, setReveal] = useState<CardInstance | null>(null);

  const inTransit = useMemo(
    () => new Set(submissions.flatMap(s => s.uids)),
    [submissions],
  );
  const candidates = useMemo(
    () => cards
      .filter(c => !c.grade && !inTransit.has(c.uid) && !returns.includes(c.uid)
        // A card live at auction can settle-and-sell overnight — it can't
        // also be boxed up for the grader.
        && !listings.some(l => l.uid === c.uid))
      .sort((a, b) => world.heat(b) - world.heat(a))
      .slice(0, 60),
    [cards, inTransit, returns, listings],
  );
  const company = COMPANIES.find(c => c.key === companyKey)!;

  const toggle = (uid: number) => {
    const next = new Set(picked);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    setPicked(next);
  };

  const S = styles;
  return (
    <div style={S.root}>
      <header style={S.header}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={S.title}>GRADING</div>
          <div style={S.day}>DAY {day}</div>
          <span style={{ flex: 1 }} />
          <button style={S.endDay} onClick={endDay}>END DAY ▸</button>
        </div>
      </header>

      <div style={S.scroll}>
        {returns.length > 0 && (
          <section style={S.section}>
            <div style={S.sectionTitle}>BACK FROM GRADING — {returns.length} SEALED MAILER{returns.length > 1 ? 'S' : ''}</div>
            <div style={S.returnRow}>
              {returns.map(uid => {
                const card = cards.find(c => c.uid === uid);
                if (!card) return null;
                return (
                  <button key={uid} style={S.returnPkg}
                    onClick={() => { unlockAudio(); const g = revealReturn(uid); if (g) setReveal(g); }}>
                    {/* Cardboard mailer, drawn — not an emoji. */}
                    <div style={{
                      width: 44, height: 34, margin: '0 auto', position: 'relative',
                      background: 'linear-gradient(160deg, #b08948 0%, #8f6c34 100%)',
                      borderRadius: 4, boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
                    }}>
                      <div style={{
                        position: 'absolute', left: '42%', top: 0, bottom: 0, width: '16%',
                        background: 'rgba(240,236,220,0.75)',
                      }} />
                      <div style={{
                        position: 'absolute', left: 3, bottom: 2, fontSize: 6, fontWeight: 800,
                        color: 'rgba(60,40,10,0.8)', letterSpacing: 0.5,
                      }}>
                        FRAGILE
                      </div>
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>{world.displayName(card).player}</div>
                    <div style={{ fontSize: 9, color: '#e8c86a' }}>TAP TO REVEAL</div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {submissions.length > 0 && (
          <section style={S.section}>
            <div style={S.sectionTitle}>⏳ AT THE GRADERS</div>
            {submissions.map((s, i) => {
              const co = COMPANIES.find(c => c.key === s.companyKey)!;
              return (
                <div key={i} style={S.queueRow}>
                  <span style={{ color: co.color === '#0b2545' ? '#78b7e0' : co.color, fontWeight: 800 }}>{co.name}</span>
                  <span style={{ opacity: 0.7 }}>{s.uids.length} card{s.uids.length > 1 ? 's' : ''} · {TIERS[s.tier]}</span>
                  <span style={{ marginLeft: 'auto', color: '#e8c86a' }}>
                    {s.dueDay - day} day{s.dueDay - day !== 1 ? 's' : ''} left
                  </span>
                </div>
              );
            })}
          </section>
        )}

        <section style={S.section}>
          <div style={S.sectionTitle}>
            SELECT CARDS — long-press to inspect with the loupe. An off-center
            card really is more likely to disappoint: look before you pay.
          </div>
          <div style={S.grid}>
            {candidates.map(card => (
              <PickCell key={card.uid} card={card} picked={picked.has(card.uid)}
                onTap={() => toggle(card.uid)} onInspect={() => setInspect(card)} />
            ))}
            {candidates.length === 0 && (
              <div style={{ opacity: 0.5, fontSize: 12, gridColumn: '1 / -1', padding: 20, textAlign: 'center' }}>
                Rip packs to get cards worth grading.
              </div>
            )}
          </div>
        </section>

        <section style={S.section}>
          <div style={S.sectionTitle}>CHOOSE A HOUSE</div>
          <div style={S.coRow}>
            {COMPANIES.map(co => (
              <button key={co.key} onClick={() => setCompanyKey(co.key)}
                style={{ ...S.coCard, outline: co.key === companyKey ? `2px solid ${co.color}` : '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontWeight: 900, fontSize: 14, color: co.color === '#0b2545' ? '#78b7e0' : co.color }}>{co.name}</div>
                <div style={S.coMeta}>{co.turnaroundDays[tier]}d · ${co.fees[tier]}/card</div>
                <div style={S.coBlurb}>{blurb(co.key)}</div>
              </button>
            ))}
          </div>
          <div style={S.tierRow}>
            {TIERS.map((t, i) => (
              <button key={t} onClick={() => setTier(i as Tier)}
                style={{ ...S.chip, ...(tier === i ? S.chipOn : {}) }}>
                {t.toUpperCase()}
              </button>
            ))}
            <span style={{ flex: 1 }} />
            <button
              style={{ ...S.submit, opacity: picked.size ? 1 : 0.35 }}
              onClick={() => {
                if (!picked.size) return;
                sfx.tap();
                submitForGrading([...picked], companyKey, tier);
                setPicked(new Set());
              }}>
              SUBMIT {picked.size || ''} · ${company.fees[tier] * picked.size}
            </button>
          </div>
        </section>
      </div>

      {inspect && <LoupeOverlay card={inspect} onClose={() => setInspect(null)} />}
      {reveal && <RevealOverlay card={reveal} onClose={() => setReveal(null)} />}
    </div>
  );
}

function blurb(key: string): string {
  switch (key) {
    case 'psg': return 'The market standard. Tough but fair.';
    case 'bvs': return 'Brutal graders. Their 10 is king.';
    case 'qcg': return 'Cheap, fast, generous. Lower resale.';
    default: return 'Hungry upstart. Subgrades included.';
  }
}

function PickCell({ card, picked, onTap, onInspect }: {
  card: CardInstance; picked: boolean; onTap: () => void; onInspect: () => void;
}) {
  const url = useMemo(() => snapshotCard(world.specFor(card), 300), [card]);
  const info = world.displayName(card);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const S = styles;
  return (
    <div
      style={{ ...S.cell, outline: picked ? '2px solid #d4a017' : 'none' }}
      onPointerDown={() => {
        held.current = false;
        timer.current = setTimeout(() => { held.current = true; onInspect(); }, 420);
      }}
      onPointerUp={() => {
        if (timer.current) clearTimeout(timer.current);
        if (!held.current) onTap();
      }}
      onPointerLeave={() => { if (timer.current) clearTimeout(timer.current); }}
    >
      <img src={url} alt="" style={{ width: '100%', borderRadius: 6, display: 'block' }} />
      <div style={S.cellLabel}>{info.tier}</div>
      {picked && <div style={S.check}>✓</div>}
    </div>
  );
}

/** The loupe: a big render you pan around. No numbers — your eyes only. */
function LoupeOverlay({ card, onClose }: { card: CardInstance; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setUrl(snapshotCard(world.specFor(card), 1400, 0.05, 0.02)), 30);
    return () => clearTimeout(id);
  }, [card]);
  const S = styles;
  return (
    <div style={S.overlay}>
      <div style={S.loupeHead}>
        <span style={{ fontSize: 12, opacity: 0.7 }}>🔍 check centering, corners, edges, surface</span>
        <button style={S.close} onClick={onClose}>DONE</button>
      </div>
      <div style={S.loupePane}>
        {url
          ? <img src={url} alt="" style={{ width: '260%', maxWidth: 'none', display: 'block' }} />
          : <div style={{ padding: 60, opacity: 0.5, fontSize: 12 }}>polishing the loupe…</div>}
      </div>
    </div>
  );
}

/** Slab reveal: label covered, then the grade stamps in. */
function RevealOverlay({ card, onClose }: { card: CardInstance; onClose: () => void }) {
  const [slabUrl, setSlabUrl] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const grade = card.grade!;
  const company = COMPANIES.find(c => c.key === grade.companyKey)!;
  useEffect(() => {
    let alive = true;
    (async () => {
      const info = world.displayName(card);
      const still = snapshotCard(world.specFor(card), 640);
      const canvas = await renderSlab(still, company, grade.result, {
        player: info.player,
        seriesLine: info.series,
        tierLine: info.tier,
      });
      if (alive) setSlabUrl(canvas.toDataURL());
    })();
    return () => { alive = false; };
  }, [card, company, grade]);
  const S = styles;
  const g = grade.result.overall;
  const gradeColor = g === 10 ? '#ffd75e' : g >= 9 ? '#8ee08e' : g >= 8 ? '#e8c86a' : '#e08a6a';
  return (
    <div style={S.overlay} onClick={() => {
      if (shown) { onClose(); return; }
      sfx.slab();
      setShown(true);
    }}>
      <div style={{ ...S.center, gap: 16 }}>
        {!shown && (
          <>
            <div style={{ fontSize: 13, letterSpacing: 3, opacity: 0.7 }}>{company.name} · CERT {grade.result.certNo}</div>
            <div style={{ fontSize: 60 }}>📦</div>
            <div style={{ color: '#e8c86a', fontSize: 13 }}>tap to open</div>
          </>
        )}
        {shown && slabUrl && (
          <>
            <div style={{ fontSize: 40, fontWeight: 900, color: gradeColor, textShadow: `0 0 30px ${gradeColor}66` }}>
              {grade.result.gem ? company.gemName : g.toFixed(1).replace('.0', '')}
            </div>
            <img src={slabUrl} alt="graded slab" style={{ width: 300, filter: 'drop-shadow(0 20px 50px rgba(0,0,0,0.7))' }} />
            <div style={{ fontSize: 12, opacity: 0.6 }}>tap anywhere to continue</div>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { height: '100%', display: 'flex', flexDirection: 'column', background: '#0c0c10' },
  header: { padding: '14px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)' },
  title: { fontSize: 16, fontWeight: 800, letterSpacing: 4 },
  day: { fontSize: 11, color: '#e8c86a', letterSpacing: 2 },
  endDay: { background: 'rgba(255,255,255,0.08)', color: '#e8c86a', border: '1px solid rgba(232,200,106,0.4)', borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 800, letterSpacing: 1 },
  scroll: { flex: 1, overflowY: 'auto', padding: '12px 14px 30px' },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 10, letterSpacing: 2, opacity: 0.5, marginBottom: 8 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 },
  cell: { position: 'relative', borderRadius: 6 },
  cellLabel: { fontSize: 8, opacity: 0.6, marginTop: 3, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  check: { position: 'absolute', top: 4, right: 4, background: '#d4a017', color: '#1a1405', width: 18, height: 18, borderRadius: 9, fontSize: 12, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  coRow: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 },
  coCard: { background: 'rgba(255,255,255,0.04)', border: 'none', borderRadius: 10, padding: 10, textAlign: 'left', color: '#f4f2ec' },
  coMeta: { fontSize: 10, opacity: 0.7, margin: '3px 0' },
  coBlurb: { fontSize: 9, opacity: 0.5, lineHeight: 1.4 },
  tierRow: { display: 'flex', gap: 6, marginTop: 10, alignItems: 'center' },
  chip: { background: 'rgba(255,255,255,0.06)', color: 'rgba(244,242,236,0.6)', border: 'none', borderRadius: 20, padding: '5px 10px', fontSize: 10, fontWeight: 700, letterSpacing: 1 },
  chipOn: { background: '#d4a017', color: '#1a1405' },
  submit: { background: '#d4a017', color: '#1a1405', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 11, fontWeight: 900, letterSpacing: 1 },
  queueRow: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, padding: '7px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, marginBottom: 6 },
  returnRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  returnPkg: { background: 'rgba(232,200,106,0.08)', border: '1px solid rgba(232,200,106,0.35)', borderRadius: 10, padding: '10px 12px', color: '#f4f2ec', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(4,4,7,0.97)', zIndex: 60, display: 'flex', flexDirection: 'column' },
  center: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center' },
  loupeHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' },
  close: { background: '#d4a017', color: '#1a1405', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 11, fontWeight: 900 },
  loupePane: { flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch' },
};
