(() => {
  window.__ModuleLoader__.load({
    id: "@michengai/dsh-skills-manager",
    factory: (require2) => {
      var module = { exports: {} };
      Object.defineProperty(module.exports, Symbol.toStringTag, { value: "Module" });
      var react = require2("react");
      var h = react.createElement;
      var primitives = require2("@deepseek-ai/dsh-client-ui-primitives");
      var MUTATION_HEADERS = { "content-type": "application/json", "x-dsh-skills-manager": "1" };
      var NS = "skills-manager";
      var DICT = {
        zh: {
          "title": "\u6280\u80FD",
          "desc": "\u7EDF\u4E00\u52A0\u8F7D\u548C\u7BA1\u7406\u672C\u673A Agent Skills\u3002",
          "link.project": "GitHub",
          "link.feedback": "\u95EE\u9898\u53CD\u9988",
          "btn.create": "\u521B\u5EFA\u6280\u80FD",
          "btn.import": "\u5BFC\u5165",
          "btn.refresh": "\u5237\u65B0",
          "btn.cancel": "\u53D6\u6D88",
          "btn.close": "\u5173\u95ED",
          "btn.detail": "\u67E5\u770B\u8BE6\u60C5",
          "btn.trash": "\u79FB\u5230\u56DE\u6536\u7AD9",
          "btn.restore": "\u6062\u590D",
          "btn.delete.forever": "\u6C38\u4E45\u5220\u9664",
          "btn.file.pick": "\u9009\u62E9\u6587\u4EF6",
          "btn.folder.pick": "\u9009\u62E9\u6587\u4EF6\u5939",
          "btn.import.now": "\u5B89\u88C5",
          "btn.create.now": "\u521B\u5EFA\u6280\u80FD",
          "btn.disable": "\u505C\u7528",
          "btn.enable": "\u542F\u7528",
          "status.enabled": "\u5DF2\u542F\u7528",
          "status.disabled": "\u5DF2\u505C\u7528",
          "status.invalid": "\u8BCA\u65AD\u5F02\u5E38",
          "status.shadowed": "\u88AB\u8986\u76D6",
          "status.readonly": "\u6E90\u6587\u4EF6\u53EA\u8BFB",
          "status.manageable": "\u53EF\u7BA1\u7406",
          "status.project": "\u9879\u76EE\u7EA7",
          "status.rank": "\u4F18\u5148\u7EA7 {rank}",
          "status.source.on": "\u5DF2\u542F\u7528",
          "status.source.off": "\u5DF2\u505C\u7528",
          "status.bundle": "\u76EE\u5F55\u6280\u80FD",
          "status.single": "\u5355\u6587\u4EF6",
          "summary.total.one": "{count} \u4E2A\u6280\u80FD",
          "summary.total.other": "{count} \u4E2A\u6280\u80FD",
          "summary.enabled.one": "{count} \u4E2A\u5DF2\u542F\u7528",
          "summary.enabled.other": "{count} \u4E2A\u5DF2\u542F\u7528",
          "summary.disabled.one": "{count} \u4E2A\u5DF2\u505C\u7528",
          "summary.disabled.other": "{count} \u4E2A\u5DF2\u505C\u7528",
          "summary.issues.one": "{count} \u4E2A\u8BCA\u65AD\u9879",
          "summary.issues.other": "{count} \u4E2A\u8BCA\u65AD\u9879",
          "summary.group.one": "{count} \u4E2A\u6280\u80FD",
          "summary.group.other": "{count} \u4E2A\u6280\u80FD",
          "table.skill": "\u6280\u80FD\u540D\u79F0\u4E0E\u63CF\u8FF0",
          "table.status": "\u8C03\u7528\u72B6\u6001",
          "filter.source": "\u6765\u6E90",
          "filter.all": "\u5168\u90E8\u6765\u6E90",
          "filter.option": "{name}\uFF08{count}\uFF09",
          "search": "\u641C\u7D22",
          "search.placeholder": "\u641C\u7D22\u6280\u80FD\u540D\u79F0\u6216\u63CF\u8FF0",
          "search.clear": "\u6E05\u9664\u641C\u7D22",
          "empty.search": "\u6CA1\u6709\u5339\u914D\u7684\u6280\u80FD\u3002",
          "empty.source": "\u8BE5\u6765\u6E90\u76EE\u5F55\u4E0D\u5B58\u5728\u6216\u6682\u65F6\u6CA1\u6709\u6280\u80FD\u3002",
          "loading": "\u6B63\u5728\u52A0\u8F7D\u6280\u80FD\u2026",
          "note.missing": "\u672A\u63D0\u4F9B\u7B80\u4ECB",
          "source.toggle": "\u542F\u505C\u6765\u6E90",
          "skill.toggle": "\u542F\u505C\u6280\u80FD",
          "source.external.note": "\u901A\u8FC7 Skills Manager \u63A5\u5165\uFF0C\u542F\u505C\u4E0D\u4F1A\u6539\u5199\u6E90\u6587\u4EF6\u3002",
          "source.dsh.note": "DSH \u672C\u5730\u6280\u80FD\u53EF\u521B\u5EFA\u3001\u5BFC\u5165\u548C\u79FB\u5230\u56DE\u6536\u7AD9\uFF1B\u542F\u505C\u53EA\u66F4\u65B0\u7BA1\u7406\u5668\u72B6\u6001\u3002",
          "detail.title": "\u6280\u80FD\u8BE6\u60C5",
          "detail.body": "\u6B63\u6587",
          "detail.frontmatter": "Frontmatter",
          "detail.diagnostics": "\u8BCA\u65AD",
          "detail.path": "\u6E90\u6587\u4EF6",
          "detail.noIssues": "\u672A\u53D1\u73B0\u8BCA\u65AD\u95EE\u9898\u3002",
          "create.title": "\u521B\u5EFA\u6280\u80FD",
          "create.target": "\u521B\u5EFA\u4F4D\u7F6E",
          "create.name": "\u540D\u79F0",
          "create.name.placeholder": "\u4F8B\u5982 code-review-helper",
          "create.description": "\u7B80\u4ECB",
          "create.description.placeholder": "\u4E00\u53E5\u8BDD\u8BF4\u660E\u4EC0\u4E48\u65F6\u5019\u4F7F\u7528",
          "create.body": "\u6B63\u6587\uFF08Markdown\uFF09",
          "create.body.placeholder": "\u5199\u4E0B\u6280\u80FD\u8981\u9075\u5FAA\u7684\u6307\u4EE4\u3001\u6B65\u9AA4\u548C\u8FB9\u754C\u2026",
          "create.chat.note": "\u5BF9\u8BDD\u4E2D\u7684 create_skill \u4ECD\u521B\u5EFA\u7528\u6237\u7EA7 DSH Skill\uFF1B\u9879\u76EE Skill \u53EF\u5728\u8FD9\u91CC\u9009\u62E9\u6D3B\u52A8\u9879\u76EE\u540E\u521B\u5EFA\u3002",
          "import.title": "\u5BFC\u5165\u6280\u80FD",
          "upload.drop.title": "\u62D6\u62FD\u6280\u80FD\u5230\u6B64\u5904",
          "upload.drop.copy": "\u652F\u6301 .zip\u3001\u6280\u80FD\u6587\u4EF6\u5939\u6216\u5355\u4E2A SKILL.md",
          "upload.selected.one": "{count} \u4E2A\u6587\u4EF6 \xB7 {size}",
          "upload.selected.other": "{count} \u4E2A\u6587\u4EF6 \xB7 {size}",
          "upload.remove": "\u79FB\u9664\u6240\u9009\u5185\u5BB9",
          "upload.requirements": "\u6587\u4EF6\u8981\u6C42",
          "upload.requirement.skill": "\u538B\u7F29\u5305\u6216\u6587\u4EF6\u5939\u9700\u5305\u542B SKILL.md",
          "upload.requirement.frontmatter": "SKILL.md \u9700\u5305\u542B YAML \u683C\u5F0F\u7684\u6280\u80FD\u540D\u79F0\u548C\u63CF\u8FF0",
          "upload.requirement.copy": "\u5BFC\u5165\u65F6\u590D\u5236\u5B8C\u6574\u5185\u5BB9\uFF0C\u4E0D\u4FEE\u6539\u539F\u59CB\u6765\u6E90",
          "upload.importing": "\u6B63\u5728\u5B89\u88C5\u2026",
          "status.selected": "\u5DF2\u9009\u62E9",
          "select.file.invalid": "\u8BF7\u9009\u62E9 .zip \u6216\u5355\u4E2A SKILL.md\u3002",
          "select.folder.invalid": "\u6240\u9009\u6587\u4EF6\u5939\u4E2D\u6CA1\u6709\u627E\u5230 SKILL.md\u3002",
          "error.browse.absolute": "\u76EE\u5F55\u8DEF\u5F84\u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84\uFF1A{path}",
          "error.browse.unreadable": "\u65E0\u6CD5\u8BFB\u53D6\u76EE\u5F55\uFF1A{path}",
          "error.browse.notDirectory": "\u4E0D\u662F\u76EE\u5F55\uFF1A{path}",
          "trash.title": "\u56DE\u6536\u7AD9",
          "trash.count.one": "{count} \u4E2A\u5F85\u5904\u7406\u6280\u80FD",
          "trash.count.other": "{count} \u4E2A\u5F85\u5904\u7406\u6280\u80FD",
          "trash.empty": "\u56DE\u6536\u7AD9\u4E3A\u7A7A\u3002",
          "trash.deletedAt": "\u5220\u9664\u4E8E {time}",
          "trash.source": "\u6765\u6E90\uFF1A{source}",
          "confirm.trash.title": "\u79FB\u5230\u56DE\u6536\u7AD9\uFF1F",
          "confirm.trash.desc": "\u201C{name}\u201D\u5C06\u4ECE\u5F53\u524D\u6280\u80FD\u6765\u6E90\u79FB\u5165\u56DE\u6536\u7AD9\uFF0C\u4E4B\u540E\u53EF\u4EE5\u6062\u590D\u5230\u539F\u4F4D\u7F6E\u3002",
          "confirm.delete.title": "\u6C38\u4E45\u5220\u9664\uFF1F",
          "confirm.delete.desc": "\u201C{name}\u201D\u5C06\u4ECE\u56DE\u6536\u7AD9\u6C38\u4E45\u5220\u9664\uFF0C\u65E0\u6CD5\u6062\u590D\u3002",
          "result.created": "\u5DF2\u521B\u5EFA\u6280\u80FD\uFF1A{name}",
          "result.imported": "\u5BFC\u5165\u5B8C\u6210\uFF1A{names}",
          "result.importPartial": "\u5DF2\u5BFC\u5165\uFF1A{imported}\uFF1B\u5DF2\u8DF3\u8FC7\u540C\u540D\u6280\u80FD\uFF1A{skipped}",
          "result.importSkipped": "\u672A\u5BFC\u5165\u4EFB\u4F55\u6280\u80FD\uFF1B\u5DF2\u8DF3\u8FC7\u540C\u540D\u6280\u80FD\uFF1A{names}",
          "result.importEmpty": "\u672A\u5BFC\u5165\u4EFB\u4F55\u6280\u80FD\u3002",
          "result.importWarnings": "{result}\uFF1B\u8B66\u544A\uFF1A{warnings}",
          "result.restored": "\u5DF2\u6062\u590D\u6280\u80FD\uFF1A{name}",
          "result.trashed": "\u5DF2\u79FB\u5230\u56DE\u6536\u7AD9\uFF1A{name}",
          "result.deleted": "\u5DF2\u6C38\u4E45\u5220\u9664\uFF1A{name}",
          "result.updated": "\u72B6\u6001\u5DF2\u66F4\u65B0\u3002",
          "error.action": "\u64CD\u4F5C\u5931\u8D25\uFF1A{error}",
          "warning.state.invalid": "\u6280\u80FD\u7BA1\u7406\u5668\u72B6\u6001\u6587\u4EF6\u4E0D\u53EF\u8BFB\uFF1B\u6240\u6709\u6280\u80FD\u5DF2\u5B89\u5168\u505C\u7528\uFF0C\u4FEE\u590D\u6587\u4EF6\u524D\u4E0D\u4F1A\u8986\u76D6\u72B6\u6001\uFF1A{path}",
          "warning.backupUncleaned": "\u65E7\u7248\u672C\u5907\u4EFD\u672A\u6E05\u7406\uFF1A{path}\uFF08{error}\uFF09",
          "warning.project.unavailable": "\u65E0\u6CD5\u4ECE\u5BBF\u4E3B\u8BFB\u53D6\u6D3B\u52A8\u5DE5\u4F5C\u533A\uFF0C\u9879\u76EE\u6280\u80FD\u672A\u663E\u793A\uFF1A{path}",
          "error.root.readonly": "\u8BE5\u6765\u6E90\u4E0D\u5141\u8BB8{action}",
          "error.root.unknown": "\u672A\u77E5\u6280\u80FD\u6765\u6E90\uFF1A{root}",
          "error.root.unsafe": "\u9879\u76EE\u6280\u80FD\u76EE\u5F55\u4E0D\u5B89\u5168\uFF0C\u62D2\u7EDD\u5199\u5165\uFF1A{path}",
          "error.skill.notFound": "\u6280\u80FD\u4E0D\u5B58\u5728: {name}",
          "error.skill.noFrontmatter": "\u6280\u80FD\u7F3A\u5C11\u5B8C\u6574 frontmatter\uFF0C\u65E0\u6CD5{action}: {name}",
          "error.skill.notLoadable": "\u6280\u80FD\u7ED3\u6784\u4E0D\u5B8C\u6574\uFF0C\u65E0\u6CD5{action}: {name}",
          "error.source.notFound": "\u8DEF\u5F84\u4E0D\u5B58\u5728: {path}",
          "error.source.symlink": "\u4E0D\u652F\u6301\u5305\u542B\u7B26\u53F7\u94FE\u63A5\u7684 skill \u6765\u6E90: {path}",
          "error.source.unrecognized": "\u65E0\u6CD5\u8BC6\u522B\u7684 skill \u6765\u6E90: {path}",
          "error.source.tooDeep": "skill \u6765\u6E90\u76EE\u5F55\u5C42\u7EA7\u8D85\u8FC7 {depth} \u5C42: {path}",
          "error.import.overlap": "\u5BFC\u5165\u6765\u6E90\u4E0D\u80FD\u4E0E DSH \u6280\u80FD\u76EE\u5F55\u76F8\u540C\u3001\u5305\u542B\u6216\u4F4D\u4E8E\u5176\u4E2D",
          "error.import.emptySource": "\u76EE\u5F55\u4E0B\u672A\u627E\u5230\u4EFB\u4F55 skill \u6761\u76EE: {path}",
          "error.import.invalidName": "\u65E0\u6CD5\u751F\u6210\u5408\u6CD5 kebab-case \u540D\u79F0\uFF08\u539F\u59CB\u540D: {name}\uFF09",
          "error.import.duplicateName": "\u6279\u91CF\u6765\u6E90\u4E2D\u5B58\u5728\u591A\u4E2A\u540C\u540D\u6280\u80FD: {name}",
          "error.import.failed": "\u5BFC\u5165\u5931\u8D25",
          "error.import.rollbackFailed": "\u8986\u76D6\u5BFC\u5165\u56DE\u6EDA\u5931\u8D25\uFF0C\u5907\u4EFD\u4FDD\u7559\u5728: {path}\uFF08{error}\uFF09",
          "error.upload.path": "\u4E0A\u4F20\u5185\u5BB9\u5305\u542B\u975E\u6CD5\u8DEF\u5F84\uFF1A{path}",
          "error.upload.encoding": "\u4E0A\u4F20\u5185\u5BB9\u7F16\u7801\u65E0\u6548",
          "error.upload.empty": "\u4E0A\u4F20\u5185\u5BB9\u4E3A\u7A7A",
          "error.upload.tooMany": "\u4E0A\u4F20\u6587\u4EF6\u8FC7\u591A\uFF0C\u6700\u591A {limit} \u4E2A",
          "error.upload.tooLarge": "\u4E0A\u4F20\u5185\u5BB9\u8FC7\u5927\uFF0C\u9650\u5236\u4E3A {limit} \u5B57\u8282",
          "error.upload.archiveTooLarge": "ZIP \u538B\u7F29\u5305\u8FC7\u5927\uFF0C\u9650\u5236\u4E3A {limit} \u5B57\u8282",
          "error.upload.duplicate": "\u4E0A\u4F20\u5185\u5BB9\u5305\u542B\u91CD\u590D\u8DEF\u5F84\uFF1A{path}",
          "error.upload.zipInvalid": "ZIP \u538B\u7F29\u5305\u65E0\u6CD5\u89E3\u538B",
          "error.trash.notFound": "\u56DE\u6536\u7AD9\u6761\u76EE\u4E0D\u5B58\u5728: {id}",
          "error.trash.conflict": "\u65E0\u6CD5\u6062\u590D\uFF0C\u540C\u540D\u6280\u80FD\u5DF2\u5B58\u5728: {name}",
          "error.trash.invalid": "\u56DE\u6536\u7AD9\u6761\u76EE\u8DEF\u5F84\u975E\u6CD5: {id}",
          "error.trash.projectUnavailable": "\u539F\u9879\u76EE\u5F53\u524D\u4E0D\u5728\u6D3B\u52A8\u5DE5\u4F5C\u533A\u4E2D\uFF0C\u65E0\u6CD5\u6062\u590D\uFF1A{path}",
          "error.trash.rollbackFailed": "\u79FB\u5165\u56DE\u6536\u7AD9\u56DE\u6EDA\u5931\u8D25\uFF0C\u672A\u6062\u590D\u5185\u5BB9\u4FDD\u7559\u5728: {path}\uFF08{error}\uFF09",
          "error.state.invalid": "\u6280\u80FD\u7BA1\u7406\u5668\u72B6\u6001\u6587\u4EF6\u4E0D\u53EF\u8BFB\uFF0C\u5DF2\u62D2\u7EDD\u8986\u76D6\uFF1A{path}",
          "error.create.descriptionRequired": "\u6280\u80FD\u7B80\u4ECB\u4E0D\u80FD\u4E3A\u7A7A",
          "error.create.bodyRequired": "\u6280\u80FD\u6B63\u6587\u4E0D\u80FD\u4E3A\u7A7A",
          "error.create.tooLarge": "\u6280\u80FD\u5185\u5BB9\u8FC7\u957F",
          "error.create.conflict": "\u540C\u540D\u6280\u80FD\u5DF2\u5B58\u5728: {name}",
          "error.proto.forbidden": "\u7981\u6B62\u7684\u4FEE\u6539\u8BF7\u6C42\uFF08\u7F3A\u5C11\u5BA2\u6237\u7AEF\u6807\u8BB0\uFF09",
          "error.proto.forbiddenHost": "\u7981\u6B62\u7684\u8BF7\u6C42\u6765\u6E90\uFF08\u975E\u6CD5 Host\uFF09",
          "error.proto.contentType": "\u8BF7\u6C42\u4F53\u5FC5\u987B\u662F application/json",
          "error.proto.method": "\u4E0D\u652F\u6301\u7684\u8BF7\u6C42\u65B9\u6CD5",
          "error.proto.unknownAction": "\u672A\u77E5\u64CD\u4F5C",
          "error.proto.bodyTooLarge": "\u8BF7\u6C42\u4F53\u8FC7\u5927",
          "error.proto.invalidJson": "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5 JSON",
          "error.proto.nonJson": "\u670D\u52A1\u7AEF\u8FD4\u56DE\u975E JSON \u54CD\u5E94\uFF08HTTP {status}\uFF09",
          "diagnostic.frontmatter.missing": "\u7F3A\u5C11\u5B8C\u6574 YAML frontmatter",
          "diagnostic.name.missing": "frontmatter \u7F3A\u5C11 name",
          "diagnostic.name.invalid": "\u6280\u80FD\u540D\u79F0\u4E0D\u662F\u5408\u6CD5 kebab-case\uFF1A{name}",
          "diagnostic.description.missing": "frontmatter \u7F3A\u5C11 description",
          "diagnostic.invocation.invalid": "\u8C03\u7528\u7B56\u7565\u5B57\u6BB5\u503C\u65E0\u6548",
          "diagnostic.shadowed": "\u88AB\u66F4\u9AD8\u4F18\u5148\u7EA7\u6765\u6E90 {root} \u8986\u76D6",
          "action.enable": "\u542F\u7528",
          "action.disable": "\u505C\u7528",
          "action.create": "\u521B\u5EFA",
          "action.delete": "\u5220\u9664",
          "action.restore": "\u6062\u590D",
          "action.toggle": "\u542F\u7528\u6216\u505C\u7528",
          "root.dsh": "DSH \u6280\u80FD",
          "root.agents": "\u516C\u5171 Agent",
          "root.ccswitch": "CC Switch",
          "root.projectDsh": "\u9879\u76EE DSH",
          "root.projectAgents": "\u9879\u76EE Agent",
          "root.codex": "Codex",
          "root.claude": "Claude",
          "root.gemini": "Gemini",
          "root.opencode": "OpenCode"
        },
        en: {
          "title": "Skills",
          "desc": "Load and manage Agent Skills on this computer in one place.",
          "link.project": "GitHub",
          "link.feedback": "Issues",
          "btn.create": "Create skill",
          "btn.import": "Import",
          "btn.refresh": "Refresh",
          "btn.cancel": "Cancel",
          "btn.close": "Close",
          "btn.detail": "View details",
          "btn.trash": "Move to trash",
          "btn.restore": "Restore",
          "btn.delete.forever": "Delete forever",
          "btn.file.pick": "Choose file",
          "btn.folder.pick": "Choose folder",
          "btn.import.now": "Install",
          "btn.create.now": "Create skill",
          "btn.disable": "Disable",
          "btn.enable": "Enable",
          "status.enabled": "Enabled",
          "status.disabled": "Disabled",
          "status.invalid": "Needs attention",
          "status.shadowed": "Shadowed",
          "status.readonly": "Source read-only",
          "status.manageable": "Manageable",
          "status.project": "Project scoped",
          "status.rank": "Rank {rank}",
          "status.source.on": "Enabled",
          "status.source.off": "Disabled",
          "status.bundle": "Bundle",
          "status.single": "Single file",
          "summary.total.one": "{count} skill",
          "summary.total.other": "{count} skills",
          "summary.enabled.one": "{count} enabled",
          "summary.enabled.other": "{count} enabled",
          "summary.disabled.one": "{count} disabled",
          "summary.disabled.other": "{count} disabled",
          "summary.issues.one": "{count} diagnostic",
          "summary.issues.other": "{count} diagnostics",
          "summary.group.one": "{count} skill",
          "summary.group.other": "{count} skills",
          "table.skill": "Skill name and description",
          "table.status": "Invocation status",
          "filter.source": "Source",
          "filter.all": "All sources",
          "filter.option": "{name} ({count})",
          "search": "Search",
          "search.placeholder": "Search skill names or descriptions",
          "search.clear": "Clear search",
          "empty.search": "No matching skills.",
          "empty.source": "This source does not exist or has no skills yet.",
          "loading": "Loading skills\u2026",
          "note.missing": "No description provided",
          "source.toggle": "Toggle source",
          "skill.toggle": "Toggle skill",
          "source.external.note": "Managed through Skills Manager; toggles never rewrite source files.",
          "source.dsh.note": "Local DSH skills can be created, imported, and moved to trash; toggles update manager state only.",
          "detail.title": "Skill details",
          "detail.body": "Body",
          "detail.frontmatter": "Frontmatter",
          "detail.diagnostics": "Diagnostics",
          "detail.path": "Source file",
          "detail.noIssues": "No diagnostic issues found.",
          "create.title": "Create skill",
          "create.target": "Create in",
          "create.name": "Name",
          "create.name.placeholder": "e.g. code-review-helper",
          "create.description": "Description",
          "create.description.placeholder": "One sentence describing when to use it",
          "create.body": "Body (Markdown)",
          "create.body.placeholder": "Write the instructions, steps, and boundaries\u2026",
          "create.chat.note": "The conversational create_skill tool still creates a user-level DSH Skill; choose an active project here for a project Skill.",
          "import.title": "Import skill",
          "upload.drop.title": "Drop a skill here",
          "upload.drop.copy": "Supports .zip, a skill folder, or one SKILL.md",
          "upload.selected.one": "{count} file \xB7 {size}",
          "upload.selected.other": "{count} files \xB7 {size}",
          "upload.remove": "Remove selection",
          "upload.requirements": "File requirements",
          "upload.requirement.skill": "Archives and folders must contain SKILL.md",
          "upload.requirement.frontmatter": "SKILL.md must include a YAML name and description",
          "upload.requirement.copy": "Import copies all content and never modifies the source",
          "upload.importing": "Installing\u2026",
          "status.selected": "Selected",
          "select.file.invalid": "Choose a .zip archive or one SKILL.md.",
          "select.folder.invalid": "No SKILL.md was found in the selected folder.",
          "error.browse.absolute": "Folder path must be absolute: {path}",
          "error.browse.unreadable": "Could not read folder: {path}",
          "error.browse.notDirectory": "Not a folder: {path}",
          "trash.title": "Trash",
          "trash.count.one": "{count} skill pending",
          "trash.count.other": "{count} skills pending",
          "trash.empty": "Trash is empty.",
          "trash.deletedAt": "Deleted {time}",
          "trash.source": "Source: {source}",
          "confirm.trash.title": "Move to trash?",
          "confirm.trash.desc": "\u201C{name}\u201D will move out of its current skill source and can be restored to the same location later.",
          "confirm.delete.title": "Delete forever?",
          "confirm.delete.desc": "\u201C{name}\u201D will be permanently deleted from trash and cannot be recovered.",
          "result.created": "Created skill: {name}",
          "result.imported": "Import complete: {names}",
          "result.importPartial": "Imported: {imported}; skipped existing skills: {skipped}",
          "result.importSkipped": "No skills were imported; existing skills were skipped: {names}",
          "result.importEmpty": "No skills were imported.",
          "result.importWarnings": "{result}; warnings: {warnings}",
          "result.restored": "Restored skill: {name}",
          "result.trashed": "Moved to trash: {name}",
          "result.deleted": "Permanently deleted: {name}",
          "result.updated": "Status updated.",
          "error.action": "Action failed: {error}",
          "warning.state.invalid": "The manager state file could not be read; all skills are disabled and state writes are blocked until it is repaired: {path}",
          "warning.backupUncleaned": "Old version backup was not cleaned up: {path} ({error})",
          "warning.project.unavailable": "The active workspace could not be read from the host, so its project skills are hidden: {path}",
          "error.root.readonly": "This source does not allow {action}",
          "error.root.unknown": "Unknown skill source: {root}",
          "error.root.unsafe": "The project skill directory is unsafe, so the write was refused: {path}",
          "error.skill.notFound": "Skill not found: {name}",
          "error.skill.noFrontmatter": "Skill lacks complete frontmatter, cannot {action}: {name}",
          "error.skill.notLoadable": "Skill structure is incomplete, cannot {action}: {name}",
          "error.source.notFound": "Path does not exist: {path}",
          "error.source.symlink": "Skill sources containing symbolic links are not supported: {path}",
          "error.source.unrecognized": "Unrecognized skill source: {path}",
          "error.source.tooDeep": "Skill source directory depth exceeds {depth} levels: {path}",
          "error.import.overlap": "Import source cannot be the same as, contain, or be inside the DSH skills directory",
          "error.import.emptySource": "No skill entries found in the directory: {path}",
          "error.import.invalidName": "Cannot generate a valid kebab-case name (original: {name})",
          "error.import.duplicateName": "Batch source contains duplicate skill names: {name}",
          "error.import.failed": "Import failed",
          "error.import.rollbackFailed": "Overwrite import rollback failed; backups kept at: {path} ({error})",
          "error.upload.path": "Upload contains an invalid path: {path}",
          "error.upload.encoding": "Upload encoding is invalid",
          "error.upload.empty": "Upload is empty",
          "error.upload.tooMany": "Too many uploaded files; maximum {limit}",
          "error.upload.tooLarge": "Upload is too large; limit {limit} bytes",
          "error.upload.archiveTooLarge": "ZIP archive is too large; limit {limit} bytes",
          "error.upload.duplicate": "Upload contains a duplicate path: {path}",
          "error.upload.zipInvalid": "ZIP archive could not be extracted",
          "error.trash.notFound": "Trash item not found: {id}",
          "error.trash.conflict": "Cannot restore because a skill with the same name exists: {name}",
          "error.trash.invalid": "Invalid trash item path: {id}",
          "error.trash.projectUnavailable": "The original project is not an active workspace, so this skill cannot be restored: {path}",
          "error.trash.rollbackFailed": "Move-to-trash rollback failed; unrecovered content was kept at: {path} ({error})",
          "error.state.invalid": "The manager state file could not be read, so overwriting it was refused: {path}",
          "error.create.descriptionRequired": "Skill description is required",
          "error.create.bodyRequired": "Skill body is required",
          "error.create.tooLarge": "Skill content is too large",
          "error.create.conflict": "A skill with the same name already exists: {name}",
          "error.proto.forbidden": "Forbidden mutation request (missing client marker)",
          "error.proto.forbiddenHost": "Forbidden request origin (invalid host)",
          "error.proto.contentType": "Content type must be application/json",
          "error.proto.method": "Method not allowed",
          "error.proto.unknownAction": "Unknown action",
          "error.proto.bodyTooLarge": "Request body too large",
          "error.proto.invalidJson": "Invalid JSON request body",
          "error.proto.nonJson": "Server returned a non-JSON response (HTTP {status})",
          "diagnostic.frontmatter.missing": "Missing complete YAML frontmatter",
          "diagnostic.name.missing": "Frontmatter is missing name",
          "diagnostic.name.invalid": "Skill name is not valid kebab-case: {name}",
          "diagnostic.description.missing": "Frontmatter is missing description",
          "diagnostic.invocation.invalid": "Invocation policy value is invalid",
          "diagnostic.shadowed": "Shadowed by higher-priority source {root}",
          "action.enable": "enable",
          "action.disable": "disable",
          "action.create": "create",
          "action.delete": "delete",
          "action.restore": "restore",
          "action.toggle": "enabling or disabling",
          "root.dsh": "DSH skills",
          "root.agents": "Shared Agent",
          "root.ccswitch": "CC Switch",
          "root.projectDsh": "Project DSH",
          "root.projectAgents": "Project Agent",
          "root.codex": "Codex",
          "root.claude": "Claude",
          "root.gemini": "Gemini",
          "root.opencode": "OpenCode"
        }
      };
      var CSS = `
.dssm-section{box-sizing:border-box;display:flex;width:100%;max-width:820px;min-width:0;margin:0 auto;padding:2px 0 36px;container-type:inline-size;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary);font-family:inherit}.dssm-head{display:flex;align-items:flex-start;gap:20px}.dssm-title-block{min-width:0}.dssm-title-row{display:flex;align-items:center;gap:8px;min-width:0}.dssm-feedback-links{display:flex;align-items:center;gap:4px}.dssm-title{margin:0;font-size:22px;line-height:30px;font-weight:680;letter-spacing:-.3px}.dssm-feedback-link{display:inline-flex;min-height:28px;align-items:center;gap:5px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;font-weight:500;line-height:18px;text-decoration:none;white-space:nowrap}.dssm-feedback-link:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.dssm-feedback-link:focus-visible{outline:2px solid var(--dsw-alias-state-success-primary);outline-offset:2px}.dssm-feedback-link svg{flex:none}.dssm-desc{margin:3px 0 0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}.dssm-actions{display:flex;gap:8px;margin-left:auto;flex:none}
.dssm-btn{box-sizing:border-box;display:inline-flex;min-height:34px;align-items:center;justify-content:center;padding:0 13px;border:1px solid transparent;border-radius:8px;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);font:inherit;font-size:13px;font-weight:580;white-space:nowrap;cursor:pointer}.dssm-btn:hover:not(:disabled){filter:brightness(1.08)}.dssm-btn:disabled{opacity:.48;cursor:default}.dssm-btn-secondary,.dssm-btn-quiet{border-color:var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary)}.dssm-btn-quiet{min-height:28px;padding:0 9px;color:var(--dsw-alias-label-secondary);font-size:12px}.dssm-btn-danger{border-color:var(--dsw-alias-state-error-primary);background:transparent;color:var(--dsw-alias-state-error-primary)}.dssm-btn:focus-visible,.dssm-control:focus-visible,.dssm-select-trigger:focus-visible,.dssm-source-head:focus-visible,.dssm-switch:focus-visible,.dssm-upload-link:focus-visible,.dssm-file-remove:focus-visible{outline:2px solid var(--dsw-alias-state-success-primary);outline-offset:2px}
.dssm-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}.dssm-stat{padding:12px 14px;border-right:1px solid var(--dsw-alias-border-l1);font-size:13px;color:var(--dsw-alias-label-secondary)}.dssm-stat:last-child{border-right:0}.dssm-stat strong{margin-right:5px;color:var(--dsw-alias-label-primary);font-size:17px;font-weight:680}.dssm-filters{display:flex;gap:9px}.dssm-search{flex:1}.dssm-source-filter{width:210px;flex:none}
.dssm-control,.dssm-select-trigger{box-sizing:border-box;width:100%;min-height:34px;padding:0 11px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}.dssm-control::placeholder{color:var(--dsw-alias-label-tertiary)}textarea.dssm-control{min-height:160px;padding-top:9px;resize:vertical;line-height:20px}.dssm-select{position:relative}.dssm-select-trigger{display:flex;align-items:center;justify-content:space-between;text-align:left;cursor:pointer}.dssm-select-menu{position:absolute;z-index:40;top:calc(100% + 5px);right:0;left:0;display:flex;max-height:260px;padding:5px;overflow:auto;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-3);box-shadow:var(--dsw-shadow-lv2)}.dssm-option{padding:8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;text-align:left;cursor:pointer}.dssm-option:hover,.dssm-option[aria-selected=true]{background:var(--dsw-alias-interactive-bg-hover)}
.dssm-sources{display:flex;flex-direction:column;gap:9px}.dssm-source{overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}.dssm-source-head{box-sizing:border-box;display:flex;width:100%;min-height:48px;align-items:center;padding:0 13px}.dssm-source-head-main{display:flex;min-width:0;min-height:48px;flex:1;align-items:center;gap:10px;padding:0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}.dssm-source-head:hover,.dssm-row:hover,.dssm-trash-row:hover{background:var(--dsw-alias-interactive-bg-hover)}.dssm-source-title{font-size:14px;font-weight:650}.dssm-count{color:var(--dsw-alias-label-tertiary);font-size:12px}.dssm-path{min-width:0;margin-left:auto;overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.dssm-source-actions{display:flex;align-items:center;gap:9px;margin-left:8px}.dssm-source-body{border-top:1px solid var(--dsw-alias-border-l1)}.dssm-source-note{padding:9px 13px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}
.dssm-table-head,.dssm-row{display:grid;grid-template-columns:minmax(180px,1fr) 120px 90px max-content;align-items:center;column-gap:12px;padding:0 13px}.dssm-table-head{min-height:32px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:11px}.dssm-row{min-height:58px;border-bottom:1px solid var(--dsw-alias-border-l1)}.dssm-row:last-child{border-bottom:0}.dssm-main{min-width:0}.dssm-name{overflow:hidden;font-size:13px;font-weight:570;text-overflow:ellipsis;white-space:nowrap}.dssm-note{overflow:hidden;margin-top:2px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:17px;text-overflow:ellipsis;white-space:nowrap}.dssm-tags{display:flex;align-items:center;gap:5px;flex-wrap:wrap}.dssm-tag{display:inline-flex;min-height:19px;align-items:center;padding:0 6px;border:1px solid var(--dsw-alias-border-l3);border-radius:4px;color:var(--dsw-alias-label-secondary);font-size:10px;white-space:nowrap}.dssm-tag-on{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}.dssm-tag-off{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}.dssm-enabled{color:var(--dsw-alias-state-success-primary);font-size:12px;white-space:nowrap}.dssm-disabled{color:#d49245;font-size:12px;white-space:nowrap}.dssm-shadowed{color:var(--dsw-alias-label-tertiary);font-size:12px;white-space:nowrap}.dssm-row-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px}
.dssm-switch{position:relative;width:34px;height:20px;flex:none;padding:0;border:0;border-radius:999px;background:var(--dsw-alias-border-l3);cursor:pointer}.dssm-switch:after{position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:#fff;content:"";transition:transform 160ms ease}.dssm-switch-on{background:var(--dsw-alias-state-success-primary)}.dssm-switch-on:after{transform:translateX(14px)}.dssm-switch:disabled{opacity:.45;cursor:default}.dssm-trash-row{display:flex;min-height:48px;align-items:center;padding:0 13px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2);color:inherit;font:inherit;font-size:13px;cursor:pointer}.dssm-trash-count{margin-left:auto;padding:2px 7px;border-radius:99px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);font-size:11px}.dssm-empty{padding:25px 14px;color:var(--dsw-alias-label-tertiary);font-size:12px;text-align:center}.dssm-feedback{padding:9px 11px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;color:var(--dsw-alias-label-secondary);font-size:12px}.dssm-warning{border-color:#d49245;color:#d49245}.dssm-error{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.dssm-mask{position:fixed;z-index:1100;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.62)}.dssm-modal{box-sizing:border-box;display:flex;width:min(560px,100%)!important;max-height:min(760px,calc(100vh - 48px));min-width:0;flex-direction:column;gap:16px;padding:22px;overflow:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-shadow-lv3)}.dssm-modal-wide{width:min(720px,100%)!important}.dssm-modal-import{width:min(480px,100%)!important;padding:24px}.dssm-modal-head{display:flex;align-items:flex-start;gap:12px}.dssm-modal-title{margin:0;flex:1;font-size:17px;line-height:24px;font-weight:670}.dssm-form,.dssm-field,.dssm-detail-section{display:flex;flex-direction:column}.dssm-form{gap:12px}.dssm-field{gap:6px}.dssm-label,.dssm-detail-title{font-size:12px}.dssm-label{color:var(--dsw-alias-label-secondary)}.dssm-detail-title{font-weight:650}.dssm-help{margin:0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px}.dssm-modal-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px}.dssm-hidden-input{display:none}.dssm-dropzone{box-sizing:border-box;display:flex;width:100%;min-height:170px;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:22px;border:1px dashed var(--dsw-alias-border-l3);border-radius:12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);transition:border-color 180ms ease,background 180ms ease}.dssm-dropzone:hover,.dssm-dropzone-active{border-color:var(--dsw-alias-state-success-primary);background:var(--dsw-alias-interactive-bg-hover)}.dssm-dropzone-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:620}.dssm-dropzone-copy{font-size:12px;line-height:18px;text-align:center}.dssm-upload-choices{display:flex;align-items:center;gap:7px}.dssm-upload-link,.dssm-file-remove{padding:0;border:0;background:transparent;font:inherit;font-size:12px;cursor:pointer}.dssm-upload-link{color:var(--dsw-alias-label-secondary)}.dssm-upload-link:hover{color:var(--dsw-alias-label-primary);text-decoration:underline}.dssm-upload-link:disabled{opacity:.45;cursor:default}.dssm-upload-divider{color:var(--dsw-alias-label-tertiary);font-size:11px}.dssm-file{display:flex;align-items:center;gap:9px;padding:10px 11px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px}.dssm-file-kind{display:inline-flex;min-width:30px;height:24px;align-items:center;justify-content:center;border-radius:5px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);font-size:9px;font-weight:700}.dssm-file-name{min-width:0;overflow:hidden;flex:1;text-overflow:ellipsis;white-space:nowrap}.dssm-file-meta{color:var(--dsw-alias-label-tertiary);font-size:11px;white-space:nowrap}.dssm-file-remove{width:24px;height:24px;color:var(--dsw-alias-label-secondary);font-size:18px}.dssm-upload-requirements{padding:1px 1px 0}.dssm-upload-requirements ul{display:flex;margin:7px 0 0;padding-left:18px;flex-direction:column;gap:5px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}.dssm-detail-section{gap:7px}.dssm-detail-path,.dssm-code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px}.dssm-detail-path{padding:8px 10px;border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);word-break:break-all}.dssm-code{max-height:280px;margin:0;padding:12px;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);line-height:18px;white-space:pre-wrap}.dssm-diag{padding:8px 10px;border-left:2px solid #d49245;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12px}.dssm-trash-item{display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}.dssm-trash-item:last-child{border-bottom:0}.dssm-trash-main{min-width:0;flex:1}
@container(max-width:780px){.dssm-table-head{display:none}.dssm-row{grid-template-columns:minmax(0,1fr) max-content;gap:8px;padding:11px 13px}.dssm-row>.dssm-tags,.dssm-row>.dssm-status{grid-column:1}.dssm-row-actions{grid-column:2;grid-row:1 / span 3}.dssm-path{display:none}}@media(max-width:760px){.dssm-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:720px){.dssm-title-row{flex-wrap:wrap}}@media(max-width:520px){.dssm-head{flex-direction:column}.dssm-actions{width:100%;margin-left:0}.dssm-actions .dssm-btn{flex:1}.dssm-filters{flex-direction:column}.dssm-source-filter{width:100%}.dssm-summary{grid-template-columns:1fr}}
`;
      function translateOrFallback(t, key, fallback, params) {
        var value = t(key, params);
        return typeof value === "string" && value !== key ? value : fallback;
      }
      function translateError(t, payload) {
        if (payload instanceof Error && !payload.code) return payload.message;
        if (payload && typeof payload === "object") {
          if (payload.code) {
            var params = Object.assign({}, payload.params || {});
            if (params.action) params.action = translateOrFallback(t, "action." + params.action, params.action);
            var translated = t(payload.code, params);
            if (typeof translated === "string" && translated !== payload.code) return translated;
          }
          if (payload.error !== void 0) return translateError(t, payload.error);
          if (payload.message !== void 0) return String(payload.message);
        }
        return String(payload == null ? "" : payload);
      }
      function parseApiResponse(response) {
        return response.json().catch(function() {
          var error = new Error("non-json response");
          error.code = "error.proto.nonJson";
          error.params = { status: response.status };
          throw error;
        }).then(function(payload) {
          if (!response.ok || payload.ok === false) throw payload;
          return payload.data;
        });
      }
      function callApi(path, options) {
        return fetch("/api/dsh-skills-manager" + path, options).then(parseApiResponse);
      }
      function isSkillEnabled(skill) {
        if (skill.enabled !== void 0) return skill.enabled === true;
        return skill.invocationPolicyValid && skill.modelInvocable && skill.userInvocable && skill.managerEnabled !== false;
      }
      function countKey(key, count) {
        return key + (Number(count) === 1 ? ".one" : ".other");
      }
      function rootDisplayName(t, root) {
        var base = translateOrFallback(t, "root." + (root.localeKey || root.kind || root.key), root.label);
        return root.projectName ? base + " \xB7 " + root.projectName : base;
      }
      function summarizeImportResult(t, data) {
        var importedItems = data && data.imported || [];
        var imported = importedItems.map(function(item) {
          return item.name;
        });
        var skipped = (data && data.skipped || []).map(function(item) {
          return item.name;
        });
        var warnings = [];
        importedItems.forEach(function(item) {
          (item.warnings || []).forEach(function(warning) {
            warnings.push(translateError(t, warning));
          });
        });
        var summary;
        if (imported.length && skipped.length) summary = { ok: true, warning: true, imported: true, text: t("result.importPartial", { imported: imported.join(", "), skipped: skipped.join(", ") }) };
        else if (imported.length) summary = { ok: true, warning: false, imported: true, text: t("result.imported", { names: imported.join(", ") }) };
        else if (skipped.length) summary = { ok: false, warning: true, imported: false, text: t("result.importSkipped", { names: skipped.join(", ") }) };
        else summary = { ok: false, warning: false, imported: false, text: t("result.importEmpty") };
        if (warnings.length) {
          summary.warning = true;
          summary.text = t("result.importWarnings", { result: summary.text, warnings: warnings.join("\uFF1B") });
        }
        return summary;
      }
      function normalizeSkillQuery(query) {
        return String(query == null ? "" : query).trim().toLowerCase();
      }
      function matchSkillQuery(skill, query) {
        var q = normalizeSkillQuery(query);
        if (!q) return true;
        return [skill.name, skill.declaredName, skill.description, skill.kind, skill.kindLabel, skill.statusLabel, skill.rootKey, skill.rootLabel].some(function(value) {
          return String(value == null ? "" : value).toLowerCase().includes(q);
        });
      }
      function filterSkills(list, options) {
        var rootKey = options && options.rootKey != null ? options.rootKey : "";
        return list.filter(function(skill) {
          return (!rootKey || skill.rootKey === rootKey) && matchSkillQuery(skill, options && options.query);
        });
      }
      function visibleSkillRoots(roots) {
        return (roots || []).filter(function(root) {
          return root.scope !== "project" || (root.skills || []).length > 0;
        });
      }
      var MAX_UPLOAD_ARCHIVE_BYTES = 32 << 20, MAX_UPLOAD_ENTRY_BYTES = 32 << 20, MAX_UPLOAD_TOTAL_BYTES = 64 << 20, MAX_UPLOAD_ENTRIES = 1e3;
      function uploadFilePath(file) {
        return String(file && (file._dssmPath || file.webkitRelativePath || file.name) || "").replace(/\\/g, "/");
      }
      function inspectUploadSelection(files) {
        var list = Array.prototype.slice.call(files || []);
        if (!list.length) return null;
        if (list.length > MAX_UPLOAD_ENTRIES) return { error: { code: "error.upload.tooMany", params: { limit: MAX_UPLOAD_ENTRIES } } };
        var relative = list.some(function(file) {
          return uploadFilePath(file).includes("/");
        });
        if (relative) {
          if (!list.some(function(file) {
            return /(^|\/)skill\.md$/i.test(uploadFilePath(file));
          })) return { error: { code: "select.folder.invalid" } };
          var oversized = list.find(function(file) {
            return Number(file.size || 0) > MAX_UPLOAD_ENTRY_BYTES;
          });
          if (oversized) return { error: { code: "error.upload.tooLarge", params: { limit: MAX_UPLOAD_ENTRY_BYTES } } };
          var total = list.reduce(function(sum, file) {
            return sum + Number(file.size || 0);
          }, 0);
          if (total > MAX_UPLOAD_TOTAL_BYTES) return { error: { code: "error.upload.tooLarge", params: { limit: MAX_UPLOAD_TOTAL_BYTES } } };
          return { kind: "folder", name: uploadFilePath(list[0]).split("/")[0], files: list, count: list.length, size: total };
        }
        if (list.length !== 1) return { error: { code: "select.file.invalid" } };
        var name = String(list[0].name || ""), lower = name.toLowerCase();
        var size = Number(list[0].size || 0);
        if (lower === "skill.md") return size > MAX_UPLOAD_ENTRY_BYTES ? { error: { code: "error.upload.tooLarge", params: { limit: MAX_UPLOAD_ENTRY_BYTES } } } : { kind: "skill", name, files: list, count: 1, size };
        if (lower.endsWith(".zip")) return size > MAX_UPLOAD_ARCHIVE_BYTES ? { error: { code: "error.upload.archiveTooLarge", params: { limit: MAX_UPLOAD_ARCHIVE_BYTES } } } : { kind: "zip", name, files: list, count: 1, size };
        return { error: { code: "select.file.invalid" } };
      }
      function bytesToBase64(buffer) {
        var bytes = new Uint8Array(buffer), binary = "", chunk = 32768;
        for (var i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
        return btoa(binary);
      }
      function buildUploadPayload(selection) {
        return Promise.all(selection.files.map(function(file) {
          return file.arrayBuffer().then(function(buffer) {
            return { path: uploadFilePath(file), data: bytesToBase64(buffer) };
          });
        })).then(function(entries) {
          return selection.kind === "zip" ? { name: selection.name, zip: entries[0].data } : { name: selection.name, entries };
        });
      }
      function readDroppedEntry(entry, prefix, output) {
        if (entry.isFile) return new Promise(function(resolve, reject) {
          entry.file(function(file) {
            file._dssmPath = prefix + file.name;
            output.push(file);
            resolve();
          }, reject);
        });
        if (!entry.isDirectory) return Promise.resolve();
        return new Promise(function(resolve, reject) {
          var reader = entry.createReader(), children = [];
          function next() {
            reader.readEntries(function(batch) {
              if (!batch.length) {
                Promise.all(children.map(function(child) {
                  return readDroppedEntry(child, prefix + entry.name + "/", output);
                })).then(resolve, reject);
                return;
              }
              children = children.concat(batch);
              next();
            }, reject);
          }
          next();
        });
      }
      function droppedFiles(dataTransfer) {
        var items = Array.prototype.slice.call(dataTransfer && dataTransfer.items || []), entries = items.map(function(item) {
          return item.webkitGetAsEntry && item.webkitGetAsEntry();
        }).filter(Boolean);
        if (!entries.length) return Promise.resolve(Array.prototype.slice.call(dataTransfer && dataTransfer.files || []));
        var files = [];
        return Promise.all(entries.map(function(entry) {
          return readDroppedEntry(entry, "", files);
        })).then(function() {
          return files;
        });
      }
      function modalFocusable(modal) {
        return Array.prototype.slice.call(modal.querySelectorAll('button:not(:disabled), [href], input:not([type=hidden]):not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') || []);
      }
      function trapModalFocus(modal, event) {
        if (event.key !== "Tab") return;
        var focusable = modalFocusable(modal);
        if (!focusable.length) return;
        var active = document.activeElement;
        if (!modal.contains(active) || (event.shiftKey ? active === focusable[0] : active === focusable[focusable.length - 1])) {
          event.preventDefault();
          (event.shiftKey ? focusable[focusable.length - 1] : focusable[0]).focus();
        }
      }
      function handleModalEscape(event, onClose) {
        if (event.key !== "Escape") return false;
        event.preventDefault();
        event.stopPropagation();
        if (event.nativeEvent && typeof event.nativeEvent.stopImmediatePropagation === "function") event.nativeEvent.stopImmediatePropagation();
        onClose();
        return true;
      }
      function SourceSelect(props) {
        var state = react.useState(false), open = state[0], setOpen = state[1], selected = props.options.find(function(o) {
          return o.value === props.value;
        }) || props.options[0], ref = react.useRef(null);
        react.useEffect(function() {
          if (!open) return void 0;
          function close(event) {
            if (!ref.current || !ref.current.contains(event.target)) setOpen(false);
          }
          document.addEventListener("pointerdown", close);
          return function() {
            document.removeEventListener("pointerdown", close);
          };
        }, [open]);
        return h("div", { className: "dssm-select", ref }, h("button", { type: "button", className: "dssm-select-trigger", "aria-haspopup": "listbox", "aria-expanded": open, onClick: function() {
          setOpen(!open);
        } }, h("span", null, selected.label)), open ? h("div", { className: "dssm-select-menu", role: "listbox" }, props.options.map(function(o) {
          return h("button", { key: o.value || "all", type: "button", role: "option", className: "dssm-option", "aria-selected": o.value === props.value, onClick: function() {
            props.onChange(o.value);
            setOpen(false);
          } }, o.label);
        })) : null);
      }
      function Switch(props) {
        return h("button", { type: "button", className: "dssm-switch" + (props.on ? " dssm-switch-on" : ""), role: "switch", "aria-checked": props.on, "aria-label": props.label, disabled: props.disabled, onClick: props.onClick });
      }
      function GithubMark16() {
        return h("svg", { viewBox: "0 0 16 16", width: 16, height: 16, "aria-hidden": true, focusable: "false" }, h("path", { fill: "currentColor", d: "M8 0a8 8 0 0 0-2.53 15.59c.4.074.547-.173.547-.385 0-.19-.007-.693-.01-1.36-2.226.484-2.695-1.073-2.695-1.073-.364-.924-.89-1.17-.89-1.17-.726-.496.055-.486.055-.486.803.056 1.225.824 1.225.824.714 1.223 1.872.87 2.328.665.072-.517.28-.87.508-1.07-1.777-.202-3.645-.888-3.645-3.956 0-.874.31-1.588.823-2.148-.083-.202-.357-1.017.078-2.12 0 0 .672-.215 2.2.82A7.65 7.65 0 0 1 8 4.8c.68.003 1.365.092 2.004.27 1.527-1.035 2.197-.82 2.197-.82.437 1.103.162 1.918.08 2.12.513.56.822 1.274.822 2.148 0 3.076-1.872 3.752-3.654 3.95.288.248.544.735.544 1.482 0 1.07-.01 1.932-.01 2.195 0 .214.144.463.55.384A8.001 8.001 0 0 0 8 0Z" }));
      }
      function Modal(props) {
        var ref = react.useRef(null);
        react.useEffect(function() {
          if (ref.current) ref.current.focus();
        }, []);
        return h("div", { className: "dssm-mask", onMouseDown: function(e) {
          if (e.target === e.currentTarget) props.onClose();
        } }, h("div", { ref, tabIndex: -1, className: "dssm-modal" + (props.wide ? " dssm-modal-wide" : "") + (props.className ? " " + props.className : ""), role: "dialog", "aria-modal": "true", onKeyDown: function(e) {
          if (!handleModalEscape(e, props.onClose)) trapModalFocus(e.currentTarget, e);
        } }, h("div", { className: "dssm-modal-head" }, h("h3", { className: "dssm-modal-title" }, props.title), h("button", { type: "button", className: "dssm-btn dssm-btn-secondary", onClick: props.onClose }, props.closeLabel)), props.children));
      }
      function SkillManagerSection(props) {
        var t = props.t;
        var ss = react.useState({ loading: true, error: null, data: null }), snapshot = ss[0], setSnapshot = ss[1];
        var bs = react.useState(false), busy = bs[0], setBusy = bs[1];
        var qs = react.useState(""), query = qs[0], setQuery = qs[1];
        var fs = react.useState(""), source = fs[0], setSource = fs[1];
        var es = react.useState({ codex: true }), expanded = es[0], setExpanded = es[1];
        var ms = react.useState(null), modal = ms[0], setModal = ms[1];
        var rs = react.useState(null), result = rs[0], setResult = rs[1];
        var fms = react.useState({ root: "dsh", name: "", description: "", body: "" }), form = fms[0], setForm = fms[1];
        var us = react.useState(null), upload = us[0], setUpload = us[1];
        var ds = react.useState(null), detail = ds[0], setDetail = ds[1];
        var inflightRef = react.useRef(false);
        var importInputRef = react.useRef(null);
        var folderInputRef = react.useRef(null);
        var pickerOpenRef = react.useRef(false);
        function refresh(silent) {
          if (!silent) setSnapshot({ loading: true, error: null, data: snapshot.data });
          return callApi("/state").then(function(data2) {
            setSnapshot({ loading: false, error: null, data: data2 });
            return data2;
          }).catch(function(error) {
            setSnapshot({ loading: false, error: translateError(t, error), data: snapshot.data });
          });
        }
        react.useEffect(function() {
          refresh(false);
        }, []);
        function post(path, body, successKey, successParams) {
          if (inflightRef.current) return Promise.reject({ error: "operation already in progress" });
          inflightRef.current = true;
          setBusy(true);
          setResult(null);
          return callApi(path, { method: "POST", headers: MUTATION_HEADERS, body: JSON.stringify(body || {}) }).then(function(data2) {
            setResult({ ok: true, text: successKey ? t(successKey, successParams || data2 || {}) : t("result.updated") });
            return refresh(true).then(function() {
              return data2;
            });
          }).catch(function(error) {
            setResult({ ok: false, text: t("error.action", { error: translateError(t, error) }) });
            throw error;
          }).finally(function() {
            inflightRef.current = false;
            setBusy(false);
          });
        }
        function openDetail(root, skill) {
          setBusy(true);
          setDetail(null);
          setModal("detail");
          callApi("/detail", { method: "POST", headers: MUTATION_HEADERS, body: JSON.stringify({ root: root.key, name: skill.name }) }).then(setDetail).catch(function(error) {
            setResult({ ok: false, text: t("error.action", { error: translateError(t, error) }) });
            setModal(null);
          }).finally(function() {
            setBusy(false);
          });
        }
        function updateForm(key, value) {
          setForm(Object.assign({}, form, { [key]: value }));
        }
        function submitCreate() {
          post("/create", form, null).then(function(data2) {
            setModal(null);
            setForm({ root: "dsh", name: "", description: "", body: "" });
            setResult({ ok: true, text: t("result.created", { name: data2.name }) });
          }).catch(function() {
          });
        }
        function selectUploadFiles(files) {
          pickerOpenRef.current = false;
          var selected = inspectUploadSelection(files);
          if (!selected) return;
          if (selected.error) {
            setUpload(null);
            setResult({ ok: false, text: translateError(t, selected.error) });
            return;
          }
          setUpload(selected);
          setResult(null);
        }
        function openNativePicker(ref) {
          if (busy || pickerOpenRef.current || !ref.current) return;
          pickerOpenRef.current = true;
          ref.current.value = "";
          function release() {
            setTimeout(function() {
              pickerOpenRef.current = false;
            }, 0);
          }
          window.addEventListener("focus", release, { once: true });
          ref.current.click();
          setTimeout(function() {
            pickerOpenRef.current = false;
          }, 3e4);
        }
        function submitImport() {
          if (!upload) return;
          buildUploadPayload(upload).then(function(payload) {
            return post("/upload", payload, null);
          }).then(function(data2) {
            var summary2 = summarizeImportResult(t, data2);
            setResult({ ok: summary2.ok, warning: summary2.warning, text: summary2.text });
            if (summary2.imported) {
              setModal(null);
              setUpload(null);
            }
          }).catch(function() {
          });
        }
        var data = snapshot.data || { roots: [], trash: [], summary: { total: 0, enabled: 0, disabled: 0, issues: 0 } }, allRoots = data.roots || [], roots = visibleSkillRoots(allRoots), activeSource = roots.some(function(root) {
          return root.key === source;
        }) ? source : "";
        var createRoots = allRoots.filter(function(root) {
          return root.mutable === true;
        }), createOptions = createRoots.map(function(root) {
          return { value: root.key, label: rootDisplayName(t, root) };
        });
        if (!createOptions.length) createOptions.push({ value: "dsh", label: t("root.dsh") });
        function openCreate() {
          var selectedRoot = createRoots.some(function(root) {
            return root.key === activeSource;
          }) ? activeSource : "dsh";
          setForm(Object.assign({}, form, { root: selectedRoot }));
          setModal("create");
        }
        function trashRootLabel(item) {
          return item.root && item.root.scope === "project" ? t("root.projectDsh") + " \xB7 " + (item.root.projectName || item.root.projectRoot) : t("root.dsh");
        }
        var options = [{ value: "", label: t("filter.all") }].concat(roots.map(function(root) {
          return { value: root.key, label: t("filter.option", { name: rootDisplayName(t, root), count: root.count == null ? root.skills.length : root.count }) };
        }));
        function renderSkill(root, skill) {
          var enabled = isSkillEnabled(skill), key = skill.shadowedBy ? "status.shadowed" : skill.loadable === false ? "status.invalid" : enabled ? "status.enabled" : "status.disabled", cls = skill.shadowedBy ? "dssm-shadowed" : enabled ? "dssm-enabled" : "dssm-disabled";
          return h("div", { key: skill.name, className: "dssm-row" }, h("div", { className: "dssm-main" }, h("div", { className: "dssm-name" }, skill.declaredName || skill.name), h("div", { className: "dssm-note" }, skill.description || t("note.missing"))), h("div", { className: "dssm-tags" }, h("span", { className: "dssm-tag" }, rootDisplayName(t, root)), !root.mutable ? h("span", { className: "dssm-tag" }, t("status.readonly")) : null), h("div", { className: "dssm-status " + cls }, t(key)), h("div", { className: "dssm-row-actions" }, root.toggleable !== false ? h(Switch, { on: enabled, disabled: busy || root.enabled === false || !!skill.shadowedBy || skill.loadable === false, label: t("skill.toggle") + " " + skill.name, onClick: function() {
            post(enabled ? "/disable" : "/enable", { root: root.key, name: skill.name });
          } }) : null, h("button", { type: "button", className: "dssm-btn dssm-btn-quiet", onClick: function() {
            openDetail(root, skill);
          } }, t("btn.detail")), root.mutable ? h("button", { type: "button", className: "dssm-btn dssm-btn-quiet", onClick: function() {
            setModal({ type: "trash-confirm", root: root.key, name: skill.name });
          } }, t("btn.trash")) : null));
        }
        function renderRoot(root) {
          if (activeSource && activeSource !== root.key) return null;
          var displayName = rootDisplayName(t, root), filtered = root.skills.filter(function(skill) {
            return matchSkillQuery(Object.assign({}, skill, { rootKey: root.key, rootLabel: displayName }), query);
          });
          if (query && !filtered.length) return null;
          var open = !!expanded[root.key] || !!query;
          var rootCount = root.count == null ? root.skills.length : root.count;
          return h("section", { key: root.key, className: "dssm-source" }, h("div", { className: "dssm-source-head" }, h("button", { type: "button", className: "dssm-source-head-main", "aria-expanded": open, onClick: function() {
            setExpanded(Object.assign({}, expanded, { [root.key]: !open }));
          } }, h("span", { className: "dssm-source-title" }, displayName), h("span", { className: "dssm-count" }, t(countKey("summary.group", rootCount), { count: rootCount })), h("span", { className: "dssm-tag " + (root.scope === "project" ? "dssm-tag-on" : root.key === "dsh" ? "" : root.enabled ? "dssm-tag-on" : "dssm-tag-off") }, root.scope === "project" ? t("status.project") : root.key === "dsh" ? t("status.manageable") : t(root.enabled ? "status.source.on" : "status.source.off")), root.scope === "project" ? h("span", { className: "dssm-tag" }, t("status.rank", { rank: root.rank })) : null, h("span", { className: "dssm-path", title: root.path }, root.path)), root.scope !== "project" && root.key !== "dsh" && root.toggleable !== false ? h("span", { className: "dssm-source-actions" }, h(Switch, { on: root.enabled, disabled: busy, label: t("source.toggle") + " " + displayName, onClick: function() {
            post(root.enabled ? "/source-disable" : "/source-enable", { root: root.key });
          } })) : null), open ? h("div", { className: "dssm-source-body" }, filtered.length ? h(react.Fragment, null, h("div", { className: "dssm-table-head" }, h("span", null, t("table.skill")), h("span", null, t("filter.source")), h("span", null, t("table.status")), h("span", null, "")), filtered.map(function(skill) {
            return renderSkill(root, skill);
          })) : h("div", { className: "dssm-empty" }, query ? t("empty.search") : t("empty.source"))) : null);
        }
        var summary = data.summary || { total: 0, enabled: 0, disabled: 0, issues: 0 };
        var content = [h("style", { key: "css" }, CSS), h("div", { key: "head", className: "dssm-head" }, h("div", { className: "dssm-title-block" }, h("div", { className: "dssm-title-row" }, h("h2", { className: "dssm-title" }, t("title")), h("div", { className: "dssm-feedback-links" }, h("a", { className: "dssm-feedback-link", href: "https://github.com/MichengAI/dsh-skills-manager", target: "_blank", rel: "noreferrer", "aria-label": t("link.project") }, h(GithubMark16, null), t("link.project")), h("a", { className: "dssm-feedback-link", href: "https://github.com/MichengAI/dsh-skills-manager/issues", target: "_blank", rel: "noreferrer", "aria-label": t("link.feedback") }, h(primitives.IconListPenOutline16, null), t("link.feedback")))), h("p", { className: "dssm-desc" }, t("desc"))), h("div", { className: "dssm-actions" }, h("button", { type: "button", className: "dssm-btn dssm-btn-secondary", disabled: busy || snapshot.loading, onClick: function() {
          refresh(false);
        } }, t("btn.refresh")), h("button", { type: "button", className: "dssm-btn", onClick: openCreate }, t("btn.create")), h("button", { type: "button", className: "dssm-btn dssm-btn-secondary", onClick: function() {
          setResult(null);
          setUpload(null);
          setModal("import");
        } }, t("btn.import")))), h("div", { key: "summary", className: "dssm-summary" }, [[summary.total, "summary.total"], [summary.enabled, "summary.enabled"], [summary.disabled, "summary.disabled"]].map(function(item) {
          return h("div", { key: item[1], className: "dssm-stat" }, h("strong", null, item[0]), t(countKey(item[1], item[0]), { count: item[0] }).replace(String(item[0]), ""));
        })), h("div", { key: "filters", className: "dssm-filters" }, h("input", { className: "dssm-control dssm-search", value: query, "aria-label": t("search"), placeholder: t("search.placeholder"), onChange: function(e) {
          setQuery(e.target.value);
        } }), h("div", { className: "dssm-source-filter" }, h(SourceSelect, { value: activeSource, options, onChange: setSource }))), result && modal !== "import" ? h("div", { key: "result", className: "dssm-feedback" + (result.warning ? " dssm-warning" : result.ok ? "" : " dssm-error") }, result.text) : null].concat((data.warnings || []).map(function(warning, index) {
          return h("div", { key: "warning-" + index, className: "dssm-feedback dssm-warning", role: "alert" }, translateError(t, warning));
        }), [snapshot.error ? h("div", { key: "error", className: "dssm-feedback dssm-error" }, snapshot.error) : null, snapshot.loading && !snapshot.data ? h("div", { key: "loading", className: "dssm-empty" }, t("loading")) : h("div", { key: "sources", className: "dssm-sources" }, roots.map(renderRoot)), h("button", { key: "trash", type: "button", className: "dssm-trash-row", onClick: function() {
          setModal("trash");
        } }, h("span", null, t("trash.title")), h("span", { className: "dssm-trash-count" }, (data.trash || []).length))]);
        if (modal === "create") content.push(h(Modal, { key: "create", title: t("create.title"), closeLabel: t("btn.close"), onClose: function() {
          setModal(null);
        } }, h("div", { className: "dssm-form" }, h("label", { className: "dssm-field" }, h("span", { className: "dssm-label" }, t("create.target")), h(SourceSelect, { value: form.root, options: createOptions, onChange: function(value) {
          updateForm("root", value);
        } })), [["name", "create.name", "create.name.placeholder"], ["description", "create.description", "create.description.placeholder"]].map(function(field) {
          return h("label", { key: field[0], className: "dssm-field" }, h("span", { className: "dssm-label" }, t(field[1])), h("input", { className: "dssm-control", value: form[field[0]], placeholder: t(field[2]), onChange: function(e) {
            updateForm(field[0], e.target.value);
          } }));
        }), h("label", { className: "dssm-field" }, h("span", { className: "dssm-label" }, t("create.body")), h("textarea", { className: "dssm-control", value: form.body, placeholder: t("create.body.placeholder"), onChange: function(e) {
          updateForm("body", e.target.value);
        } })), h("p", { className: "dssm-help" }, t("create.chat.note"))), h("div", { className: "dssm-modal-actions" }, h("button", { className: "dssm-btn dssm-btn-secondary", onClick: function() {
          setModal(null);
        } }, t("btn.cancel")), h("button", { className: "dssm-btn", disabled: busy || !form.name.trim() || !form.description.trim() || !form.body.trim(), onClick: submitCreate }, t("btn.create.now")))));
        if (modal === "import") content.push(h(
          Modal,
          { key: "import", className: "dssm-modal-import", title: t("import.title"), closeLabel: t("btn.close"), onClose: function() {
            pickerOpenRef.current = false;
            setUpload(null);
            setResult(null);
            setModal(null);
          } },
          h("input", { ref: importInputRef, className: "dssm-hidden-input", type: "file", accept: ".zip,.md", onChange: function(event) {
            selectUploadFiles(event.target.files);
            event.target.value = "";
          } }),
          h("input", { ref: folderInputRef, className: "dssm-hidden-input", type: "file", multiple: true, webkitdirectory: "", directory: "", onChange: function(event) {
            selectUploadFiles(event.target.files);
            event.target.value = "";
          } }),
          h(
            "div",
            { className: "dssm-dropzone", onDragOver: function(event) {
              event.preventDefault();
              event.currentTarget.classList.add("dssm-dropzone-active");
            }, onDragLeave: function(event) {
              event.currentTarget.classList.remove("dssm-dropzone-active");
            }, onDrop: function(event) {
              event.preventDefault();
              event.currentTarget.classList.remove("dssm-dropzone-active");
              droppedFiles(event.dataTransfer).then(selectUploadFiles).catch(function(error) {
                setResult({ ok: false, text: translateError(t, error) });
              });
            } },
            h("span", { className: "dssm-dropzone-title" }, t("upload.drop.title")),
            h("span", { className: "dssm-dropzone-copy" }, t("upload.drop.copy")),
            h("div", { className: "dssm-upload-choices" }, h("button", { type: "button", className: "dssm-upload-link", disabled: busy, onClick: function(event) {
              event.stopPropagation();
              openNativePicker(folderInputRef);
            } }, t("btn.folder.pick")), h("span", { className: "dssm-upload-divider" }, "/"), h("button", { type: "button", className: "dssm-upload-link", disabled: busy, onClick: function(event) {
              event.stopPropagation();
              openNativePicker(importInputRef);
            } }, t("btn.file.pick")))
          ),
          upload ? h("div", { className: "dssm-file", title: upload.name }, h("span", { className: "dssm-file-kind", "aria-hidden": "true" }, upload.kind === "zip" ? "ZIP" : upload.kind === "folder" ? "DIR" : "MD"), h("span", { className: "dssm-file-name" }, upload.name), h("span", { className: "dssm-file-meta" }, t(countKey("upload.selected", upload.count), { count: upload.count, size: upload.size < 1024 ? upload.size + " B" : Math.ceil(upload.size / 1024) + " KB" })), h("button", { type: "button", className: "dssm-file-remove", "aria-label": t("upload.remove"), onClick: function() {
            setUpload(null);
          } }, "\xD7")) : null,
          result ? h("div", { className: "dssm-feedback" + (result.warning ? " dssm-warning" : result.ok ? "" : " dssm-error"), role: "alert" }, result.text) : null,
          h("div", { className: "dssm-upload-requirements" }, h("div", { className: "dssm-label" }, t("upload.requirements")), h("ul", null, h("li", null, t("upload.requirement.skill")), h("li", null, t("upload.requirement.frontmatter")), h("li", null, t("upload.requirement.copy")))),
          h("div", { className: "dssm-modal-actions" }, h("button", { type: "button", className: "dssm-btn dssm-btn-secondary", onClick: function() {
            pickerOpenRef.current = false;
            setUpload(null);
            setResult(null);
            setModal(null);
          } }, t("btn.cancel")), h("button", { type: "button", className: "dssm-btn", disabled: busy || !upload, onClick: submitImport }, busy ? t("upload.importing") : t("btn.import.now")))
        ));
        if (modal === "detail") content.push(h(Modal, { key: "detail", wide: true, title: t("detail.title"), closeLabel: t("btn.close"), onClose: function() {
          setModal(null);
        } }, detail ? h(react.Fragment, null, h("div", { className: "dssm-detail-path" }, detail.path), h("div", { className: "dssm-detail-section" }, h("div", { className: "dssm-detail-title" }, t("detail.diagnostics")), detail.diagnostics.length ? detail.diagnostics.map(function(item, index) {
          return h("div", { key: index, className: "dssm-diag" }, t(item.code, item.params || {}));
        }) : h("div", { className: "dssm-note" }, t("detail.noIssues"))), h("div", { className: "dssm-detail-section" }, h("div", { className: "dssm-detail-title" }, t("detail.body")), h("pre", { className: "dssm-code" }, detail.body || "")), h("div", { className: "dssm-detail-section" }, h("div", { className: "dssm-detail-title" }, t("detail.frontmatter")), h("pre", { className: "dssm-code" }, JSON.stringify(detail.frontmatter, null, 2)))) : h("div", { className: "dssm-empty" }, t("loading"))));
        if (modal === "trash") content.push(h(Modal, { key: "trash-modal", title: t("trash.title"), closeLabel: t("btn.close"), onClose: function() {
          setModal(null);
        } }, h("div", { className: "dssm-count" }, t(countKey("trash.count", data.trash.length), { count: data.trash.length })), data.trash.length ? data.trash.map(function(item) {
          return h("div", { key: item.id, className: "dssm-trash-item" }, h("div", { className: "dssm-trash-main" }, h("div", { className: "dssm-name" }, item.name), h("div", { className: "dssm-note" }, t("trash.deletedAt", { time: new Date(item.deletedAt).toLocaleString() }) + " \xB7 " + t("trash.source", { source: trashRootLabel(item) }))), h("button", { className: "dssm-btn dssm-btn-quiet", disabled: busy, onClick: function() {
            post("/trash-restore", { id: item.id }, "result.restored", { name: item.name });
          } }, t("btn.restore")), h("button", { className: "dssm-btn dssm-btn-quiet dssm-btn-danger", disabled: busy, onClick: function() {
            setModal({ type: "delete-confirm", id: item.id, name: item.name });
          } }, t("btn.delete.forever")));
        }) : h("div", { className: "dssm-empty" }, t("trash.empty"))));
        if (modal && modal.type === "trash-confirm") content.push(h(Modal, { key: "trash-confirm", title: t("confirm.trash.title"), closeLabel: t("btn.close"), onClose: function() {
          setModal(null);
        } }, h("p", { className: "dssm-desc" }, t("confirm.trash.desc", { name: modal.name })), h("div", { className: "dssm-modal-actions" }, h("button", { className: "dssm-btn dssm-btn-secondary", onClick: function() {
          setModal(null);
        } }, t("btn.cancel")), h("button", { className: "dssm-btn", disabled: busy, onClick: function() {
          post("/delete", { root: modal.root, name: modal.name }, "result.trashed", { name: modal.name }).then(function() {
            setModal(null);
          }).catch(function() {
          });
        } }, t("btn.trash")))));
        if (modal && modal.type === "delete-confirm") content.push(h(Modal, { key: "delete-confirm", title: t("confirm.delete.title"), closeLabel: t("btn.close"), onClose: function() {
          setModal("trash");
        } }, h("p", { className: "dssm-desc" }, t("confirm.delete.desc", { name: modal.name })), h("div", { className: "dssm-modal-actions" }, h("button", { className: "dssm-btn dssm-btn-secondary", onClick: function() {
          setModal("trash");
        } }, t("btn.cancel")), h("button", { className: "dssm-btn dssm-btn-danger", disabled: busy, onClick: function() {
          post("/trash-delete", { id: modal.id }, "result.deleted", { name: modal.name }).then(function() {
            setModal("trash");
          }).catch(function() {
          });
        } }, t("btn.delete.forever")))));
        return h("section", { className: "dssm-section" }, content);
      }
      var inject = ["slots", "locale"];
      function apply(ctx) {
        ctx.effect(function() {
          return ctx.locale.register(NS, DICT);
        });
        ctx.slots.inject("settings.section", function() {
          return ctx.slots.register({ name: "settings.section", id: "skills-manager", order: 17, label: function() {
            return ctx.locale.bind(NS)("title");
          }, icon: "skill", locale: NS }, SkillManagerSection);
        });
      }
      module.exports.DICT = DICT;
      module.exports.translateError = translateError;
      module.exports.parseApiResponse = parseApiResponse;
      module.exports.isSkillEnabled = isSkillEnabled;
      module.exports.countKey = countKey;
      module.exports.rootDisplayName = rootDisplayName;
      module.exports.summarizeImportResult = summarizeImportResult;
      module.exports.normalizeSkillQuery = normalizeSkillQuery;
      module.exports.matchSkillQuery = matchSkillQuery;
      module.exports.filterSkills = filterSkills;
      module.exports.visibleSkillRoots = visibleSkillRoots;
      module.exports.trapModalFocus = trapModalFocus;
      module.exports.handleModalEscape = handleModalEscape;
      module.exports.inspectUploadSelection = inspectUploadSelection;
      module.exports.apply = apply;
      module.exports.inject = inject;
      return module.exports;
    }
  });
})();
//# sourceMappingURL=client.js.map
