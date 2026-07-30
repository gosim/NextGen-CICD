import { describe, expect, it } from 'vitest';
import { mergeRegistryImages } from './state.js';

// Merge-Logik des Registry-Stapels: frisch gebaute Images (CI grün, noch nicht
// deployt) erscheinen VOR der Ops-DB-Sicht; Dedupe per Version, promoted gewinnt.

describe('mergeRegistryImages', () => {
  it('stellt ein frisch gebautes Image vor die Ops-DB-Sicht', () => {
    const merged = mergeRegistryImages(
      [{ version: '1.0.26', imageTag: 'sha-abc1234', promoted: false }],
      [
        { version: '1.0.25', imageTag: 'sha-def5678', promoted: true },
        { version: '1.0.24', imageTag: 'sha-0000001', promoted: true },
      ],
    );
    expect(merged.map((image) => image.version)).toEqual(['1.0.26', '1.0.25', '1.0.24']);
    expect(merged[0]?.promoted).toBe(false);
  });

  it('dedupliziert per Version — promoted-Flag aus der Ops-DB gewinnt', () => {
    const merged = mergeRegistryImages(
      [{ version: '1.0.25', imageTag: 'sha-def5678', promoted: false }],
      [{ version: '1.0.25', imageTag: 'sha-def5678', promoted: true }],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.promoted).toBe(true);
  });

  it('kappt das Ergebnis auf drei Einträge', () => {
    const merged = mergeRegistryImages(
      [{ version: '1.0.27', imageTag: 'sha-a', promoted: false }],
      [
        { version: '1.0.26', imageTag: 'sha-b', promoted: true },
        { version: '1.0.25', imageTag: 'sha-c', promoted: true },
        { version: '1.0.24', imageTag: 'sha-d', promoted: true },
      ],
    );
    expect(merged.map((image) => image.version)).toEqual(['1.0.27', '1.0.26', '1.0.25']);
  });
});
