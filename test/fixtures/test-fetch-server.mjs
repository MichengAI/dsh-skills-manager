export function createTestFetchBridge() {
  const routes = [];
  const connection = {
    fetch: {
      register(route) {
        routes.push(route);
        return () => {
          const index = routes.indexOf(route);
          if (index !== -1) routes.splice(index, 1);
        };
      },
    },
  };

  const handler = async (req, res) => {
    const u = new URL(req.url, "http://localhost");
    const path = u.pathname.replace(/\/+$/, "");
    const route = routes.find((r) => r.path === path);
    if (!route) {
      const payload = JSON.stringify({ ok: false, code: "error.proto.unknownAction", error: `unknown action: ${path}` });
      res.writeHead(404, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "content-length": String(Buffer.byteLength(payload)),
      });
      if (req.method === "HEAD") {
        res.end();
      } else {
        res.end(payload);
      }
      return;
    }
    if (!route.methods.includes(req.method)) {
      const payload = JSON.stringify({ ok: false, code: "error.proto.method", error: `method not allowed: ${req.method}` });
      res.writeHead(405, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "content-length": String(Buffer.byteLength(payload)),
      });
      if (req.method === "HEAD") {
        res.end();
      } else {
        res.end(payload);
      }
      return;
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v !== undefined) {
        if (Array.isArray(v)) for (const item of v) headers.append(k, item);
        else headers.set(k, v);
      }
    }
    try {
      let bodyBuffer = null;
      if (req.method !== "GET" && req.method !== "HEAD") {
        bodyBuffer = await new Promise((resolve, reject) => {
          const chunks = [];
          req.on("data", (c) => chunks.push(c));
          req.on("end", () => resolve(Buffer.concat(chunks)));
          req.on("error", reject);
        });
      }
      const fetchReq = new Request(u.toString(), {
        method: req.method,
        headers,
        body: bodyBuffer && bodyBuffer.length > 0 ? new Uint8Array(bodyBuffer) : undefined,
      });
      const response = await route.fetch(fetchReq);
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      const responseBuf = Buffer.from(await response.arrayBuffer());
      res.end(responseBuf);
    } catch (caught) {
      const e = caught;
      const status = Number.isInteger(e && e.statusCode) ? e.statusCode : 500;
      const payload = JSON.stringify({
        ok: false,
        ...(e && typeof e.code === "string" ? { code: e.code } : {}),
        ...(e && e.params && typeof e.params === "object" && !Array.isArray(e.params) ? { params: e.params } : {}),
        error: String(e && e.message ? e.message : e),
      });
      res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "content-length": String(Buffer.byteLength(payload)),
      });
      if (req.method === "HEAD") {
        res.end();
      } else {
        res.end(payload);
      }
    }
  };

  return { connection, handler, routes };
}
