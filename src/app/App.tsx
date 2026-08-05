import { useState } from 'react';
import { DevLab } from './DevLab';
import { RipScreen } from './RipScreen';
import { BinderScreen } from './BinderScreen';
import { GradingScreen } from './GradingScreen';
import { MarketScreen } from './MarketScreen';
import { SourcingScreen } from './SourcingScreen';
import { NewsScreen, BreakingOverlay } from './NewsScreen';

type Route = 'hunt' | 'rip' | 'binder' | 'grade' | 'market' | 'news' | 'devlab';

export function App() {
  const [route, setRoute] = useState<Route>(
    new URLSearchParams(location.search).has('lab') ? 'devlab' : 'rip',
  );
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        {route === 'devlab' ? <DevLab />
          : route === 'binder' ? <BinderScreen />
          : route === 'grade' ? <GradingScreen />
          : route === 'market' ? <MarketScreen />
          : route === 'hunt' ? <SourcingScreen />
          : route === 'news' ? <NewsScreen />
          : <RipScreen />}
      </div>
      <nav style={{
        display: 'flex', justifyContent: 'center', gap: 12, padding: '10px 0 4px',
        borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 12, letterSpacing: 2,
      }}>
        {(['hunt', 'rip', 'binder', 'grade', 'market', 'news', 'devlab'] as Route[]).map(r => (
          <button key={r} onClick={() => setRoute(r)} style={{
            background: 'none', border: 'none', color: route === r ? '#d4a017' : 'rgba(244,242,236,0.5)',
            fontWeight: 700, letterSpacing: 1.5, fontSize: 11,
          }}>
            {r === 'hunt' ? 'HUNT' : r === 'rip' ? 'RIP' : r === 'binder' ? 'BOOK'
              : r === 'grade' ? 'GRADE' : r === 'market' ? 'SELL'
              : r === 'news' ? 'WIRE' : 'LAB'}
          </button>
        ))}
      </nav>
      <BreakingOverlay />
    </div>
  );
}
