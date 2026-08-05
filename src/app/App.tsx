import { useState } from 'react';
import { DevLab } from './DevLab';

export function App() {
  const [route] = useState<'devlab'>('devlab');
  // Game shell routes arrive with the career build-out; the dev lab is the
  // renderer proving ground and stays reachable at ?lab.
  return route === 'devlab' ? <DevLab /> : null;
}
