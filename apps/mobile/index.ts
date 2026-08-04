// Must run before any other import touches `crypto` or `Buffer` — see
// src/lib/vault/crypto.ts (Phase 5.2 vault crypto portability spike).
import { install } from 'react-native-quick-crypto';
install();

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
