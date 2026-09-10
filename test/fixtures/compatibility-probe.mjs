// 仅由隔离兼容测试挂载：通过真实 Agent 和 SkillRegistry 验证作用域与策略刷新。
export const inject = ["webServer", "skills", "agents", "agentPresets"];

export function apply(ctx) {
  let handle;
  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: "/__skills-manager-compat",
    async handler(_req, res) {
      try {
        if (!handle) {
          const create = () => ctx.agents.create({
            sessionId: "skills-manager-compat-agent",
            meta: { cwd: process.cwd(), agentPreset: "standard" },
            agentOptions: { provider: "deepseek", model: "deepseek-chat" },
            setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, "standard"); },
          });
          handle = await (ctx.agents.withoutInitiator ? ctx.agents.withoutInitiator(create) : create());
        }
        const options = { cwd: process.cwd(), scope: handle.agent };
        const registry = handle.agent.ctx.get("skills");
        const list = await registry.list(options);
        const skill = await registry.get("compat-external", options);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ list, skill }));
      } catch (error) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: String(error.stack || error) }));
      }
    },
  }));
}
