// Finto server dell'API Gist di GitHub, per provare la sincronizzazione senza rete.
import http from "node:http";
import crypto from "node:crypto";

const gists = new Map();
const port = Number(process.env.PORT || 4799);
const json = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,OPTIONS" });
  res.end(JSON.stringify(body));
};
const view = (g) => ({
  id: g.id,
  description: g.description,
  updated_at: g.updated_at,
  history: g.history,
  files: Object.fromEntries(Object.entries(g.files).map(([n, c]) => [n, { filename: n, size: c.length, truncated: c.length > 1_000_000, content: c.length > 1_000_000 ? "" : c, raw_url: `http://localhost:${port}/raw/${g.id}/${n}` }])),
});
http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const url = new URL(req.url, "http://x");
      const auth = req.headers.authorization || "";
      if (req.method === "OPTIONS") return json(res, 204, {});
      if (url.pathname.startsWith("/raw/")) {
        const [, , id, name] = url.pathname.split("/");
        const g = gists.get(id);
        if (!g || !(name in g.files)) return json(res, 404, {});
        res.writeHead(200, { "content-type": "text/plain", "access-control-allow-origin": "*" });
        return res.end(g.files[name]);
      }
      if (!auth.startsWith("Bearer ghp_")) return json(res, 401, { message: "bad credentials" });
      const login = auth.slice("Bearer ghp_".length);
      if (url.pathname === "/user") return json(res, 200, { login });
      if (url.pathname === "/gists" && req.method === "GET") return json(res, 200, [...gists.values()].filter((g) => g.owner === login).map(view));
      if (url.pathname === "/gists" && req.method === "POST") {
        const b = JSON.parse(body);
        const g = { id: crypto.randomBytes(8).toString("hex"), owner: login, description: b.description, files: Object.fromEntries(Object.entries(b.files).map(([n, f]) => [n, f.content])), updated_at: new Date().toISOString(), history: [{ version: crypto.randomBytes(6).toString("hex") }] };
        gists.set(g.id, g);
        return json(res, 201, view(g));
      }
      const m = url.pathname.match(/^\/gists\/([a-f0-9]+)(\/commits)?$/);
      if (!m) return json(res, 404, {});
      const g = gists.get(m[1]);
      if (!g) return json(res, 404, {});
      if (m[2]) return json(res, 200, g.history.slice(0, 1));
      if (req.method === "GET") return json(res, 200, view(g));
      if (req.method === "PATCH") {
        const b = JSON.parse(body);
        for (const [n, f] of Object.entries(b.files || {})) {
          if (f === null) delete g.files[n];
          else g.files[n] = f.content;
        }
        g.updated_at = new Date().toISOString();
        g.history.unshift({ version: crypto.randomBytes(6).toString("hex") });
        return json(res, 200, view(g));
      }
      json(res, 405, {});
    });
  })
  .listen(port, () => console.log("mock gist on", port));
