export function createDiagnostics(hostProbe) {
  const startedAt = new Date().toISOString();
  return () => ({ compatible: hostProbe.ok, failures: [...hostProbe.failures], startedAt });
}
