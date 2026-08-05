import { useState } from 'react';
import { DevLab } from './DevLab';
import { RipScreen } from './RipScreen';
import { BinderScreen } from './BinderScreen';
import { GradingScreen } from './GradingScreen';

type Route = 'rip' | 'binder' | 'grade' | 'devlab';

export function App() {
  const [route, setRoute] = useState<Route>(
    new URLSearchParams(location.search).has('lab') ? 'devlab' : 'rip',
  );
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        {route === 'devlab' ? <DevLab /> : route === 'binder' ? <BinderScreen /> : route === 'grade' ? <GradingScreen /> : <RipScreen />}
      </div>
      <nav style={{
        display: 'flex', justifyContent: 'center', gap: 28, padding: '10px 0 4px',
        borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 12, letterSpacing: 2,
      }}>
        {(['rip', 'binder', 'grade', 'devlab'] as Route[]).map(r => (
          <button key={r} onClick={() => setRoute(r)} style={{
            background: 'none', border: 'none', color: route === r ? '#d4a017' : 'rgba(244,242,236,0.5)',
            fontWeight: 700, letterSpacing: 2, fontSize: 12,
          }}>
            {r === 'rip' ? 'RIP' : r === 'binder' ? 'BINDER' : r === 'grade' ? 'GRADE' : 'LAB'}
          </button>
        ))}
      </nav>
    </div>
  );
}
