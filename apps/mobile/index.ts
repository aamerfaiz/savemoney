// Must run before any other import touches `crypto` or `Buffer` — see
// src/lib/vault/crypto.ts (Phase 5.2 vault crypto portability spike).
import { install } from 'react-native-quick-crypto';
install();

// Phase 5.5a: expo-router owns the root component now (it registers
// itself against the `app/` directory's file-based routes) — App.tsx is
// gone, replaced by app/_layout.tsx. Keeping this file (rather than
// pointing "main" at "expo-router/entry" directly) is what lets the
// crypto polyfill above run first, before expo-router mounts anything.
import 'expo-router/entry';
