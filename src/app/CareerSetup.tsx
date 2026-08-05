/**
 * Career setup — name the shop, set the bankroll.
 *
 * The starting bankroll is the difficulty dial: $500 means you're searching
 * dollar boxes and praying, $25,000 means you can buy cases and play the
 * grading arbitrage game from day one.
 */

import { useState } from 'react';
import { useCollection } from '../state/collection';
import { sfx, unlockAudio } from './feel';

const BANKROLL_TIERS = [
  { amount: 500, label: 'SHOEBOX', blurb: 'Dollar boxes and prayer. Every purchase matters.' },
  { amount: 2500, label: 'CARD SHOW TABLE', blurb: 'Enough to buy a box or dig a real lot. The intended way to play.' },
  { amount: 10000, label: 'STOREFRONT', blurb: 'Cases, bulk grading, room to make mistakes.' },
  { amount: 50000, label: 'TRUST FUND', blurb: 'Chase the Top 50 from day one. No pressure, no tension.' },
];

const NAME_SUGGESTIONS = [
  'Corner Store Cards', 'Cardboard & Co.', 'The Hobby Shop', 'Mint Condition',
  'Third & Main Collectibles', 'Gem Mint Trading', 'Wax Paper Cards',
  'The Slab Vault', 'Rookie Season Sports', 'Chase & Sons',
];

export function CareerSetup({ onDone }: { onDone: () => void }) {
  const { setShopName, setCash, startCareer } = useCollection();
  const [name, setName] = useState('');
  const [tier, setTier] = useState(1);

  const begin = () => {
    unlockAudio();
    sfx.cash();
    const finalName = name.trim() || NAME_SUGGESTIONS[0];
    setShopName(finalName);
    setCash(BANKROLL_TIERS[tier].amount);
    startCareer();
    onDone();
  };

  const S = styles;
  return (
    <div style={S.root}>
      <div style={S.inner}>
        <div style={S.kicker}>NEW CAREER</div>
        <h1 style={S.title}>Open your shop</h1>
        <p style={S.sub}>
          You're starting a small sports card business. Buy, rip, grade, and
          trade your way toward the cards everybody wants.
        </p>

        <label style={S.label}>SHOP NAME</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={NAME_SUGGESTIONS[0]}
          maxLength={28}
          style={S.input}
        />
        <div style={S.suggestions}>
          {NAME_SUGGESTIONS.slice(1, 5).map(s => (
            <button key={s} style={S.suggestion} onClick={() => setName(s)}>{s}</button>
          ))}
        </div>

        <label style={{ ...S.label, marginTop: 22 }}>STARTING BANKROLL</label>
        <div style={S.tiers}>
          {BANKROLL_TIERS.map((t, i) => (
            <button
              key={t.amount}
              onClick={() => setTier(i)}
              style={{ ...S.tier, ...(tier === i ? S.tierOn : {}) }}
            >
              <div style={S.tierAmount}>${t.amount.toLocaleString()}</div>
              <div style={S.tierLabel}>{t.label}</div>
              <div style={S.tierBlurb}>{t.blurb}</div>
            </button>
          ))}
        </div>

        <button style={S.begin} onClick={begin}>OPEN FOR BUSINESS</button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'fixed', inset: 0, zIndex: 80, overflowY: 'auto',
    background: 'radial-gradient(120% 80% at 50% 0%, #1c1c26 0%, #0a0a0d 65%)',
  },
  inner: { padding: '40px 22px 40px', maxWidth: 460, margin: '0 auto' },
  kicker: { fontSize: 10, letterSpacing: 4, color: '#d4a017', fontWeight: 800 },
  title: { fontSize: 30, fontWeight: 900, letterSpacing: -0.5, marginTop: 6 },
  sub: { fontSize: 13, opacity: 0.6, lineHeight: 1.6, marginTop: 8 },
  label: { display: 'block', fontSize: 10, letterSpacing: 2, opacity: 0.5, marginTop: 26, marginBottom: 8 },
  input: {
    width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 10, padding: '13px 14px', fontSize: 16, color: '#f4f2ec', fontWeight: 700,
    fontFamily: 'inherit',
  },
  suggestions: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 },
  suggestion: {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 14, padding: '5px 10px', fontSize: 10, color: 'rgba(244,242,236,0.6)',
  },
  tiers: { display: 'flex', flexDirection: 'column', gap: 8 },
  tier: {
    textAlign: 'left', background: 'rgba(255,255,255,0.04)', color: '#f4f2ec',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 13,
  },
  tierOn: { borderColor: '#d4a017', background: 'rgba(212,160,23,0.1)' },
  tierAmount: { fontSize: 19, fontWeight: 900, color: '#8ee08e' },
  tierLabel: { fontSize: 10, letterSpacing: 2, opacity: 0.7, marginTop: 2 },
  tierBlurb: { fontSize: 11, opacity: 0.5, marginTop: 4, lineHeight: 1.5 },
  begin: {
    width: '100%', marginTop: 26, background: '#d4a017', color: '#1a1405', border: 'none',
    borderRadius: 12, padding: '15px 0', fontSize: 14, fontWeight: 900, letterSpacing: 2,
  },
};
