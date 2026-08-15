// dsh-skills-manager client half：DSH 设置中的单目录技能管理面板。
window.__ModuleLoader__.load({
  id: "dsh-skills-manager",
  factory: (require) => {
    var module = { exports: {} };
    Object.defineProperty(module.exports, Symbol.toStringTag, { value: "Module" });
    var react = require("react");
    var h = react.createElement;
    var pickDirectory = null;

    var CSS = `
.dssm-section{display:flex;min-width:0;flex-direction:column;gap:20px;color:var(--dsw-alias-label-primary)}
.dssm-toolbar{display:flex;align-items:flex-start;gap:16px;padding-bottom:16px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.dssm-title{margin:0;font-size:20px;line-height:28px;font-weight:650;letter-spacing:-.2px}.dssm-desc{margin:4px 0 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}
.dssm-actions{display:flex;align-items:center;gap:8px;margin-left:auto}.dssm-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:0 13px;border:1px solid transparent;border-radius:8px;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);font:inherit;font-size:13px;font-weight:550;cursor:pointer;transition:opacity 180ms ease,background 180ms ease,border-color 180ms ease}
.dssm-btn:hover:not(:disabled){opacity:.9}.dssm-btn:disabled{opacity:.5;cursor:default}.dssm-btn-secondary{background:transparent;border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}.dssm-btn-danger{background:transparent;border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.dssm-btn:focus-visible,.dssm-dropzone:focus-visible,.dssm-icon-btn:focus-visible{outline:2px solid var(--dsw-alias-state-success-primary);outline-offset:2px}.dssm-summary{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}
.dssm-summary-count{font-size:18px;font-weight:650}.dssm-summary-label{color:var(--dsw-alias-label-secondary);font-size:12px}.dssm-summary-separator{width:1px;height:24px;background:var(--dsw-alias-border-l2)}
.dssm-group{display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-2)}.dssm-group-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}.dssm-group-title{margin:0;font-size:14px;font-weight:600}.dssm-count{color:var(--dsw-alias-label-tertiary);font-size:12px}.dssm-path{margin-left:auto;max-width:48%;overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:12px;text-overflow:ellipsis;white-space:nowrap}
.dssm-row{display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}.dssm-row:last-child{border-bottom:0}.dssm-row-main{display:flex;min-width:0;flex:1;flex-direction:column;gap:3px}.dssm-row-id{display:flex;align-items:center;gap:7px;min-width:0}.dssm-row-name{overflow:hidden;font-size:14px;font-weight:560;line-height:20px;text-overflow:ellipsis;white-space:nowrap}.dssm-tag{flex:none;padding:1px 6px;border:1px solid var(--dsw-alias-border-l3);border-radius:4px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}.dssm-tag-on{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}.dssm-tag-off{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}.dssm-note{overflow:hidden;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;text-overflow:ellipsis;white-space:nowrap}.dssm-empty{padding:28px 16px;color:var(--dsw-alias-label-tertiary);font-size:13px;text-align:center}.dssm-error{color:var(--dsw-alias-state-error-primary);font-size:13px;line-height:20px}
.dssm-mask{position:fixed;z-index:1100;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.58)}.dssm-modal{box-sizing:border-box;display:flex;width:min(480px,100%);flex-direction:column;gap:18px;padding:24px;border:1px solid var(--dsw-alias-border-l2);border-radius:16px;background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-shadow-lv3)}.dssm-modal-head{display:flex;align-items:center;gap:12px}.dssm-modal-title{margin:0;flex:1;font-size:17px;line-height:24px;font-weight:650}.dssm-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:20px;line-height:1;cursor:pointer}.dssm-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dssm-dropzone{display:flex;min-height:144px;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:18px;border:1px dashed var(--dsw-alias-border-l3);border-radius:12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);cursor:pointer;transition:border-color 180ms ease,background 180ms ease}.dssm-dropzone:hover,.dssm-dropzone-active{border-color:var(--dsw-alias-state-success-primary);background:var(--dsw-alias-interactive-bg-hover)}.dssm-dropzone-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:560}.dssm-dropzone-copy{font-size:12px;line-height:18px;text-align:center}.dssm-file{display:flex;align-items:center;gap:8px;padding:9px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;color:var(--dsw-alias-label-primary);font-size:13px}.dssm-file-name{overflow:hidden;flex:1;text-overflow:ellipsis;white-space:nowrap}.dssm-modal-actions{display:flex;justify-content:flex-end;gap:8px}.dssm-hidden-input{display:none}
@media (max-width:560px){.dssm-toolbar{flex-wrap:wrap}.dssm-actions{margin-left:0}.dssm-path{display:none}.dssm-row{align-items:flex-start;flex-wrap:wrap}.dssm-row>.dssm-btn{margin-left:auto}}@media (prefers-reduced-motion:reduce){.dssm-btn,.dssm-dropzone{transition:none}}
`;

    function callApi(path, options) {
      return fetch("/api/dsh-skills-manager" + path, options).then(function (response) {
        return response.json().then(function (payload) {
          if (!payload.ok) throw new Error(payload.error || ("HTTP " + response.status));
          return payload.data;
        });
      });
    }

    function SkillManagerSection() {
      var snapshotState = react.useState({ loading: true, error: null, data: null });
      var snapshot = snapshotState[0];
      var setSnapshot = snapshotState[1];
      var busyState = react.useState(null);
      var busy = busyState[0];
      var setBusy = busyState[1];
      var uploadState = react.useState(false);
      var uploadOpen = uploadState[0];
      var setUploadOpen = uploadState[1];
      var selectedState = react.useState(null);
      var selected = selectedState[0];
      var setSelected = selectedState[1];
      var resultState = react.useState(null);
      var importResult = resultState[0];
      var setImportResult = resultState[1];
      var confirmState = react.useState(null);
      var confirmImport = confirmState[0];
      var setConfirmImport = confirmState[1];
      var deleteState = react.useState(null);
      var confirmDelete = deleteState[0];
      var setConfirmDelete = deleteState[1];
      var inputRef = react.useRef(null);

      function refresh() {
        setSnapshot({ loading: true, error: null, data: snapshot.data });
        callApi("/state").then(function (data) {
          setSnapshot({ loading: false, error: null, data: data });
        }).catch(function (error) {
          setSnapshot({ loading: false, error: String(error && error.message || error), data: snapshot.data });
        });
      }

      react.useEffect(function () { refresh(); }, []);

      react.useEffect(function () {
        if (!uploadOpen && !confirmImport && !confirmDelete) return undefined;
        function closeTopModal(event) {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          if (event.stopImmediatePropagation) event.stopImmediatePropagation();
          if (confirmDelete) setConfirmDelete(null);
          else if (confirmImport) setConfirmImport(null);
          else setUploadOpen(false);
        }
        window.addEventListener("keydown", closeTopModal, true);
        return function () { window.removeEventListener("keydown", closeTopModal, true); };
      }, [uploadOpen, confirmImport, confirmDelete]);

      function action(path, body) {
        if (busy) return;
        setBusy(path);
        callApi(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) }).then(function () {
          setBusy(null);
          refresh();
        }).catch(function (error) {
          setBusy(null);
          setSnapshot({ loading: false, error: String(error && error.message || error), data: snapshot.data });
        });
      }

      function selectFile(file) {
        if (!file) return;
        if (file.name.toLowerCase() !== "skill.md") {
          setImportResult({ error: "请选择插件目录中的 SKILL.md 文件。" });
          return;
        }
        if (!file.path) {
          setSelected(null);
          setImportResult({ error: "已选择 SKILL.md，但当前运行环境无法读取文件路径。请点击“选择插件文件夹”继续上传。" });
          return;
        }
        setSelected({ name: file.name, source: file.path });
        setImportResult(null);
      }

      function selectDirectory() {
        if (!pickDirectory) {
          setImportResult({ error: "当前运行环境无法读取本地文件路径，也未提供原生目录选择服务。" });
          return;
        }
        setImportResult(null);
        setBusy("pick-directory");
        pickDirectory().then(function (path) {
          setBusy(null);
          if (path) {
            setSelected({ name: "已选择插件目录", source: path });
            setImportResult(null);
          }
        }).catch(function (error) {
          setBusy(null);
          setImportResult({ error: "选择插件目录失败：" + String(error && error.message || error) });
        });
      }

      function openNativePicker() {
        if (!busy && inputRef.current) inputRef.current.click();
      }

      function executeImport(source, conflict) {
        setBusy("import");
        setConfirmImport(null);
        callApi("/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: source, conflict: conflict }) }).then(function (data) {
          setBusy(null);
          setImportResult(data);
          setSelected(null);
          setUploadOpen(false);
          refresh();
        }).catch(function (error) {
          setBusy(null);
          setImportResult({ error: String(error && error.message || error) });
        });
      }

      function installSelected() {
        if (!selected || busy) return;
        setBusy("import-check");
        callApi("/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: selected.source, dryRun: true }) }).then(function (data) {
          if (data.conflicts && data.conflicts.length) {
            setBusy(null);
            setConfirmImport({ source: selected.source, conflicts: data.conflicts });
            return;
          }
          executeImport(selected.source, "skip");
        }).catch(function (error) {
          setBusy(null);
          setImportResult({ error: String(error && error.message || error) });
        });
      }

      function skillRow(skill, root) {
        var enabled = skill.modelInvocable && skill.userInvocable;
        return h("div", { key: skill.name, className: "dssm-row" },
          h("div", { className: "dssm-row-main" },
            h("div", { className: "dssm-row-id" },
              h("span", { className: "dssm-row-name" }, skill.name),
              h("span", { className: "dssm-tag" }, skill.kind === "bundle" ? "目录插件" : "单文件"),
              h("span", { className: "dssm-tag " + (enabled ? "dssm-tag-on" : "dssm-tag-off") }, enabled ? "已启用" : "已停用")),
            h("div", { className: "dssm-note", title: skill.description || "" }, skill.description || "未提供简介")),
          root.mutable ? h("button", { className: "dssm-btn dssm-btn-secondary", disabled: !!busy, onClick: function () { action(enabled ? "/disable" : "/enable", { name: skill.name, root: root.key }); } }, enabled ? "停用" : "启用") : null,
          root.mutable ? h("button", { className: "dssm-btn dssm-btn-danger", disabled: !!busy, onClick: function () { setConfirmDelete(skill); } }, "删除") : null);
      }

      var nodes = [h("style", { key: "css" }, CSS)];
      if (snapshot.error) nodes.push(h("div", { key: "error", className: "dssm-error", role: "alert" }, "操作失败：" + snapshot.error));
      if (snapshot.data) {
        var roots = snapshot.data.roots || [];
        var skills = roots.reduce(function (all, root) { return all.concat(root.skills || []); }, []);
        var enabled = skills.filter(function (skill) { return skill.modelInvocable; }).length;
        nodes.push(h("div", { key: "toolbar", className: "dssm-toolbar" },
          h("div", null, h("h2", { className: "dssm-title" }, "技能"), h("p", { className: "dssm-desc" }, "DSH 技能可上传、启停和删除；公共 Agent 技能仅供查看。")),
          h("div", { className: "dssm-actions" },
            h("button", { className: "dssm-btn dssm-btn-secondary", disabled: !!busy, onClick: refresh }, "刷新"),
            h("button", { className: "dssm-btn", disabled: !!busy, onClick: function () { setImportResult(null); setUploadOpen(true); } }, "上传插件"))));
        nodes.push(h("div", { key: "summary", className: "dssm-summary" },
          h("span", { className: "dssm-summary-count" }, skills.length), h("span", { className: "dssm-summary-label" }, "个插件"), h("span", { className: "dssm-summary-separator" }), h("span", { className: "dssm-summary-count" }, enabled), h("span", { className: "dssm-summary-label" }, "个已启用")));
        roots.forEach(function (root) {
          var groupSkills = root.skills || [];
          nodes.push(h("div", { key: root.key, className: "dssm-group" },
            h("div", { className: "dssm-group-head" }, h("h3", { className: "dssm-group-title" }, root.label), h("span", { className: "dssm-count" }, groupSkills.length + " 个"), h("span", { className: "dssm-path", title: root.path }, root.path)),
            root.exists === false ? h("div", { className: "dssm-empty" }, root.mutable ? "目录尚未创建，上传第一个插件后会自动创建。" : "公共目录不存在。") : (groupSkills.length ? groupSkills.map(function (skill) { return skillRow(skill, root); }) : h("div", { className: "dssm-empty" }, "暂未安装插件。"))));
        });
      } else if (snapshot.loading) {
        nodes.push(h("div", { key: "loading", className: "dssm-note" }, "加载中…"));
      }
      if (importResult) {
        var importedNames = (importResult.imported || []).map(function (item) { return item.name; });
        var failedItems = importResult.failed || [];
        var failedText = failedItems.map(function (item) { return item.error; }).join("；");
        var resultText = importResult.error ? "上传失败：" + importResult.error : failedItems.length ? (importedNames.length ? "部分上传成功：" + importedNames.join("、") + "；失败：" + failedText : "上传失败：" + failedText) : "上传完成：" + importedNames.join("、");
        nodes.push(h("div", { key: "import-result", className: importResult.error || failedItems.length ? "dssm-error" : "dssm-note", role: "status" }, resultText));
      }
      if (uploadOpen) {
        nodes.push(h("div", { key: "upload", className: "dssm-mask" }, h("div", { className: "dssm-modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "dssm-upload-title" },
          h("div", { className: "dssm-modal-head" }, h("h3", { id: "dssm-upload-title", className: "dssm-modal-title" }, "上传插件"), h("button", { className: "dssm-icon-btn", "aria-label": "关闭上传弹窗", onClick: function () { setUploadOpen(false); } }, "×")),
          h("input", { ref: inputRef, className: "dssm-hidden-input", type: "file", accept: ".md", onChange: function (event) { selectFile(event.target.files && event.target.files[0]); event.target.value = ""; } }),
          h("div", { className: "dssm-dropzone", tabIndex: 0, onClick: openNativePicker, onKeyDown: function (event) { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openNativePicker(); } }, onDragOver: function (event) { event.preventDefault(); }, onDrop: function (event) { event.preventDefault(); selectFile(event.dataTransfer.files && event.dataTransfer.files[0]); } }, h("span", { className: "dssm-dropzone-title" }, "拖放 SKILL.md 文件到这里"), h("span", { className: "dssm-dropzone-copy" }, "或点击打开系统原生文件选择窗口")),
          selected ? h("div", { className: "dssm-file", title: selected.source }, h("span", { className: "dssm-file-name" }, selected.name), h("span", { className: "dssm-tag dssm-tag-on" }, "已选择")) : h("p", { className: "dssm-desc" }, "请选择插件目录中的 SKILL.md；目录内其他文件会一并上传。"),
          busy === "pick-directory" ? h("div", { className: "dssm-note", role: "status" }, "正在打开系统原生目录选择窗口…") : null,
          importResult && importResult.error ? h("div", { className: "dssm-error", role: "alert" }, "选择失败：" + importResult.error) : null,
          h("div", { className: "dssm-modal-actions" }, h("button", { className: "dssm-btn dssm-btn-secondary", disabled: !!busy, onClick: openNativePicker }, "选择本地文件"), pickDirectory ? h("button", { className: "dssm-btn dssm-btn-secondary", disabled: !!busy, onClick: selectDirectory }, "选择插件文件夹") : null, h("button", { className: "dssm-btn", disabled: !selected || !!busy, onClick: installSelected }, busy === "import" || busy === "import-check" ? "上传中…" : "上传到 DSH")))));
      }
      if (confirmImport) {
        nodes.push(h("div", { key: "import-confirm", className: "dssm-mask" }, h("div", { className: "dssm-modal", role: "dialog", "aria-modal": "true" }, h("div", { className: "dssm-modal-head" }, h("h3", { className: "dssm-modal-title" }, "发现同名插件")), h("p", { className: "dssm-desc" }, "将覆盖现有插件：" + confirmImport.conflicts.map(function (item) { return item.name; }).join("、")), h("div", { className: "dssm-modal-actions" }, h("button", { className: "dssm-btn dssm-btn-secondary", onClick: function () { setConfirmImport(null); } }, "取消"), h("button", { className: "dssm-btn", disabled: !!busy, onClick: function () { executeImport(confirmImport.source, "overwrite"); } }, "覆盖上传")))));
      }
      if (confirmDelete) {
        nodes.push(h("div", { key: "delete-confirm", className: "dssm-mask" }, h("div", { className: "dssm-modal", role: "dialog", "aria-modal": "true" }, h("div", { className: "dssm-modal-head" }, h("h3", { className: "dssm-modal-title" }, "删除插件？")), h("p", { className: "dssm-desc" }, "“" + confirmDelete.name + "”将从 DSH 技能目录中永久删除，无法恢复。"), h("div", { className: "dssm-modal-actions" }, h("button", { className: "dssm-btn dssm-btn-secondary", disabled: !!busy, onClick: function () { setConfirmDelete(null); } }, "取消"), h("button", { className: "dssm-btn dssm-btn-danger", disabled: !!busy, onClick: function () { setConfirmDelete(null); action("/delete", { name: confirmDelete.name }); } }, "确认删除")))));
      }
      return h("section", { className: "dssm-section" }, nodes);
    }

    function apply(ctx) {
      pickDirectory = function () { return ctx.workspaces.pickDirectory(); };
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register({ name: "settings.section", id: "skills-manager", order: 17, label: "技能" }, SkillManagerSection);
      });
    }
    module.exports.apply = apply;
    module.exports.inject = ["slots", "workspaces"];
    return module.exports;
  }
});
