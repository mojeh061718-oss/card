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

// Six items, thumb-sized. GRADE (bulk + slab reveals) and EDIT (names,
// realism import, save backup) live on the HOME hub — grading a single
// card happens right on the card in the BOOK.
const NAV: { route: Route; label: string }[] = [
  { route: 'home', label: 'HOME' },
  { route: 'hunt', label: 'HUNT' },
  { route: 'wax', label: 'WAX' },
  { route: 'binder', label: 'BOOK' },
  { route: 'market', label: 'SELL' },
  { route: 'news', label: 'WIRE' },
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
      // Clear the FIXED nav: content must never run under it.
      paddingBottom: 'calc(58px + env(safe-area-inset-bottom))',
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
      {/* The nav is the escape hatch from EVERY screen and ceremony. It is
          position:FIXED to the visual viewport bottom — immune to document
          flow, body padding, inset math, or any overlay (z < 90) — so no
          layout state can ever push it off screen. */}
      <nav style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 90,
        background: '#0c0c10',
        display: 'flex',
        padding: '4px 4px calc(4px + env(safe-area-inset-bottom))',
        borderTop: '1px solid rgba(255,255,255,0.08)',
      }}>
        {NAV.map(({ route: r, label }) => (
          <button key={r} onClick={() => setRoute(r)} style={{
            flex: 1, minHeight: 46,
            background: route === r ? 'rgba(212,160,23,0.12)' : 'none',
            border: 'none', borderRadius: 10,
            color: route === r ? '#d4a017' : 'rgba(244,242,236,0.55)',
            fontWeight: 800, letterSpacing: 1, fontSize: 13, padding: '12px 0',
          }}>
            {label}
          </button>
        ))}
      </nav>
      <BreakingOverlay />
    </div>
  );
}
