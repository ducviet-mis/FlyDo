import { defineConfig } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,
  // FlyDo does not enable React Compiler. Keep its migration diagnostics
  // visible as warnings; rules-of-hooks and exhaustive-deps remain enforced.
  { rules: {
    'react-hooks/set-state-in-effect': 'warn',
    'react-hooks/preserve-manual-memoization': 'warn',
  } },
  { ignores: ['.next/**', 'node_modules/**', 'public/sw.js', 'public/workbox-*.js', 'tmp/**'] },
]);
