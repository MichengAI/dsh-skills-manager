export function createDiagnostics(hostProbe, features = {}) {
  const startedAt = new Date().toISOString();
  return () => ({ compatible: hostProbe.ok, failures: [...hostProbe.failures], features, startedAt });
}
