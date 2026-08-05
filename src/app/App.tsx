import { useState } from 'react';
import { DevLab } from './DevLab';
import { PokeLab } from './PokeLab';
import { WaxScreen } from './WaxScreen';
import { BinderScreen } from './BinderScreen';
import { GradingScreen } from './GradingScreen';
import { MarketScreen } from './MarketScreen';
import { SourcingScreen } from './SourcingScreen';
import { NewsScreen, BreakingOverlay } from './NewsScreen';
import { CareerSetup } from './CareerSetup';
import { EditorScreen } from './EditorScreen';
import { HomeScreen } from './HomeScreen';
import { useCollection } from '../state/collection';

type Route = 'home' | 'hunt' | 'wax' | 'binder' | 'grade' | 'market' | 'news' | 'edit' | 'devlab';

const NAV: { route: Route; label: string }[] = [
  { route: 'home', label: 'HOME' },
  { route: 'hunt', label: 'HUNT' },
  { route: 'wax', label: 'WAX' },
  { route: 'binder', label: 'BOOK' },
  { route: 'grade', label: 'GRADE' },
  { route: 'market', label: 'SELL' },
  { route: 'news', label: 'WIRE' },
  { route: 'edit', label: 'EDIT' },
];

export function App() {
  const careerStarted = useCollection(s => s.careerStarted);
  // The render lab is a dev tool — URL-only (?lab), never in the player nav.
  const labMode = new URLSearchParams(location.search).has('lab');
  // Hidden concept lab — reachable only by URL, never from the nav.
  const pokeMode = new URLSearchParams(location.search).has('pokelab');
  const [setupDone, setSetupDone] = useState(false);
  const [route, setRoute] = useState<Route>(labMode ? 'devlab' : 'home');
  if (pokeMode) {
    return <div style={{ height: '100dvh' }}><PokeLab /></div>;
  }
  if (!careerStarted && !setupDone && !labMode) {
    return <CareerSetup onDone={() => setSetupDone(true)} />;
  }

  return (
    // Installed PWAs draw under the status bar and home indicator
    // (viewport-fit=cover) — the shell must consume the safe-area insets or
    // the header collides with the clock and the nav dies under the
    // home-indicator gesture zone.
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      paddingTop: 'env(safe-area-inset-top)',
    }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        {route === 'devlab' ? <DevLab />
          : route === 'binder' ? <BinderScreen />
          : route === 'grade' ? <GradingScreen />
          : route === 'market' ? <MarketScreen />
          : route === 'hunt' ? <SourcingScreen />
          : route === 'news' ? <NewsScreen />
          : route === 'edit' ? <EditorScreen />
          : route === 'wax' ? <WaxScreen />
          : <HomeScreen go={r => setRoute(r as Route)} />}
      </div>
      {/* The nav is the escape hatch from EVERY screen and ceremony: it
          paints above all overlays (their z-indexes stay below 90) on a
          solid bar, so no state can ever strand the player. */}
      <nav style={{
        position: 'relative', zIndex: 90, background: '#0c0c10',
        display: 'flex', justifyContent: 'center', gap: 4,
        padding: '10px 0 calc(6px + env(safe-area-inset-bottom))',
        borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 12, letterSpacing: 2,
      }}>
        {NAV.map(({ route: r, label }) => (
          <button key={r} onClick={() => setRoute(r)} style={{
            background: 'none', border: 'none', color: route === r ? '#d4a017' : 'rgba(244,242,236,0.5)',
            fontWeight: 700, letterSpacing: 1.2, fontSize: 11, padding: '4px 5px',
          }}>
            {label}
          </button>
        ))}
      </nav>
      <BreakingOverlay />
    </div>
  );
}
