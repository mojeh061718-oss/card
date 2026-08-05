import { useState } from 'react';
import { DevLab } from './DevLab';
import { WaxScreen } from './WaxScreen';
import { BinderScreen } from './BinderScreen';
import { GradingScreen } from './GradingScreen';
import { MarketScreen } from './MarketScreen';
import { SourcingScreen } from './SourcingScreen';
import { NewsScreen, BreakingOverlay } from './NewsScreen';
import { CareerSetup } from './CareerSetup';
import { useCollection } from '../state/collection';

type Route = 'hunt' | 'wax' | 'binder' | 'grade' | 'market' | 'news' | 'devlab';

export function App() {
  const careerStarted = useCollection(s => s.careerStarted);
  const [setupDone, setSetupDone] = useState(false);
  const [route, setRoute] = useState<Route>(
    new URLSearchParams(location.search).has('lab') ? 'devlab' : 'wax',
  );
  if (!careerStarted && !setupDone) {
    return <CareerSetup onDone={() => setSetupDone(true)} />;
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        {route === 'devlab' ? <DevLab />
          : route === 'binder' ? <BinderScreen />
          : route === 'grade' ? <GradingScreen />
          : route === 'market' ? <MarketScreen />
          : route === 'hunt' ? <SourcingScreen />
          : route === 'news' ? <NewsScreen />
          : <WaxScreen />}
      </div>
      <nav style={{
        display: 'flex', justifyContent: 'center', gap: 12, padding: '10px 0 4px',
        borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 12, letterSpacing: 2,
      }}>
        {(['hunt', 'wax', 'binder', 'grade', 'market', 'news', 'devlab'] as Route[]).map(r => (
          <button key={r} onClick={() => setRoute(r)} style={{
            background: 'none', border: 'none', color: route === r ? '#d4a017' : 'rgba(244,242,236,0.5)',
            fontWeight: 700, letterSpacing: 1.5, fontSize: 11,
          }}>
            {r === 'hunt' ? 'HUNT' : r === 'wax' ? 'WAX' : r === 'binder' ? 'BOOK'
              : r === 'grade' ? 'GRADE' : r === 'market' ? 'SELL'
              : r === 'news' ? 'WIRE' : 'LAB'}
          </button>
        ))}
      </nav>
      <BreakingOverlay />
    </div>
  );
}
