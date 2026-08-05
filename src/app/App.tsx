import { useState } from 'react';
import { DevLab } from './DevLab';
import { WaxScreen } from './WaxScreen';
import { BinderScreen } from './BinderScreen';
import { GradingScreen } from './GradingScreen';
import { MarketScreen } from './MarketScreen';
import { SourcingScreen } from './SourcingScreen';
import { NewsScreen, BreakingOverlay } from './NewsScreen';
import { CareerSetup } from './CareerSetup';
import { EditorScreen } from './EditorScreen';
import { useCollection } from '../state/collection';

type Route = 'hunt' | 'wax' | 'binder' | 'grade' | 'market' | 'news' | 'edit' | 'devlab';

export function App() {
  const careerStarted = useCollection(s => s.careerStarted);
  // The render lab is a dev tool — it skips career setup entirely.
  const labMode = new URLSearchParams(location.search).has('lab');
  const [setupDone, setSetupDone] = useState(false);
  const [route, setRoute] = useState<Route>(labMode ? 'devlab' : 'wax');
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
          : <WaxScreen />}
      </div>
      <nav style={{
        display: 'flex', justifyContent: 'center', gap: 9,
        padding: '10px 0 calc(6px + env(safe-area-inset-bottom))',
        borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 12, letterSpacing: 2,
      }}>
        {(['hunt', 'wax', 'binder', 'grade', 'market', 'news', 'edit', 'devlab'] as Route[]).map(r => (
          <button key={r} onClick={() => setRoute(r)} style={{
            background: 'none', border: 'none', color: route === r ? '#d4a017' : 'rgba(244,242,236,0.5)',
            fontWeight: 700, letterSpacing: 1.5, fontSize: 11,
          }}>
            {r === 'hunt' ? 'HUNT' : r === 'wax' ? 'WAX' : r === 'binder' ? 'BOOK'
              : r === 'grade' ? 'GRADE' : r === 'market' ? 'SELL'
              : r === 'news' ? 'WIRE' : r === 'edit' ? 'EDIT' : 'LAB'}
          </button>
        ))}
      </nav>
      <BreakingOverlay />
    </div>
  );
}
