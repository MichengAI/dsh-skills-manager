const base = process.env.DSH_WEB_URL;
if (!base || !/^https?:\/\/(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?$/.test(base)) {
  throw new Error("DSH_WEB_URL must be a loopback origin");
}

const response = await fetch(`${base}/api/dsh-ai-workbench/diagnostics`);
let payload;
try {
  payload = await response.json();
} catch {
  throw new Error(`workbench diagnostics returned non-JSON (${response.status})`);
}

if (!response.ok || payload?.ok !== true || payload?.data?.compatible !== true) {
  throw new Error(`workbench diagnostics failed: ${JSON.stringify(payload)}`);
}

console.log(JSON.stringify({ compatible: true, features: payload.data.features }, null, 2));
