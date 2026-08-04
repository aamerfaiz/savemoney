import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import {
  PASSPHRASE_KDF_PARAMS,
  deriveKekFromSecret,
  encryptPacked,
  decryptPacked,
  generateDek,
  unwrapDek,
  wrapDek,
} from './src/lib/vault/crypto';

/**
 * Phase 5.2 vault-crypto spike screen (see
 * docs/mobile-build-phase-plan.md §5 step 2). Not a real app screen —
 * Phase 5.1/5.5 build the actual Expo Router shell + navigation. This is
 * the minimal host needed to run src/lib/vault/crypto.ts on a real device
 * and see, on-screen, whether Argon2id took the hash-wasm (WASM) path or
 * fell back to react-native-argon2 (native) — the one thing that
 * couldn't be verified in the sandbox that wrote this code (no Android/
 * iOS toolchain there). Delete this screen once Phase 5.4/5.5 give the
 * app a real vault-unlock flow to exercise the same code for real.
 */

type SpikeResult = { label: string; pass: boolean };

async function runSpike(): Promise<{ results: SpikeResult[]; log: string[] }> {
  const log: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    log.push(args.map(String).join(' '));
    originalWarn(...args);
  };

  const results: SpikeResult[] = [];
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const kek = await deriveKekFromSecret('spike-passphrase', salt, PASSPHRASE_KDF_PARAMS);
    const dek = await generateDek();
    const wrapped = await wrapDek(dek, kek);
    const unwrappedDek = await unwrapDek(wrapped, kek);

    const plaintext = 'vault crypto spike ok';
    const packed = await encryptPacked(plaintext, dek);
    const roundTrip = await decryptPacked(packed, unwrappedDek);

    results.push({
      label: 'Argon2id -> wrap/unwrap DEK -> AES-GCM round trip',
      pass: roundTrip === plaintext,
    });
  } catch (err) {
    results.push({ label: `Threw: ${String(err)}`, pass: false });
  }

  console.warn = originalWarn;
  return { results, log };
}

export default function App() {
  const [state, setState] = useState<'running' | 'done'>('running');
  const [results, setResults] = useState<SpikeResult[]>([]);
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    runSpike().then(({ results, log }) => {
      setResults(results);
      setLog(log);
      setState('done');
    });
  }, []);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Vault crypto spike</Text>
        <Text style={styles.subtitle}>Phase 5.2 — docs/mobile-build-phase-plan.md</Text>
        {state === 'running' && <Text>Running...</Text>}
        {results.map((r) => (
          <Text key={r.label} style={r.pass ? styles.pass : styles.fail}>
            {r.pass ? 'PASS' : 'FAIL'}  {r.label}
          </Text>
        ))}
        {log.length > 0 && (
          <View style={styles.logBox}>
            <Text style={styles.logTitle}>Argon2id fallback warnings (WASM path failed):</Text>
            {log.map((l, i) => (
              <Text key={i} style={styles.logLine}>{l}</Text>
            ))}
          </View>
        )}
        {state === 'done' && log.length === 0 && (
          <Text style={styles.info}>
            No fallback warnings — Argon2id ran via hash-wasm (WASM) on this
            device's Hermes build.
          </Text>
        )}
      </ScrollView>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0b0f' },
  scroll: { padding: 24, paddingTop: 64, gap: 8 },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  subtitle: { color: '#888', marginBottom: 16 },
  pass: { color: '#4ade80', fontVariant: ['tabular-nums'] },
  fail: { color: '#f87171', fontVariant: ['tabular-nums'] },
  info: { color: '#888', marginTop: 12 },
  logBox: { marginTop: 16, padding: 12, backgroundColor: '#1a1a22', borderRadius: 8 },
  logTitle: { color: '#fbbf24', marginBottom: 4 },
  logLine: { color: '#ccc', fontSize: 12 },
});
