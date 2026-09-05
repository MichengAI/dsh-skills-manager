export function installStyles(css) {
  const id = "dsh-ai-workbench-styles";
  if (document.getElementById(id)) return () => {};
  const node = document.createElement("style");
  node.id = id;
  node.textContent = css;
  document.head.append(node);
  return () => node.remove();
}

export const foundationCss = `.daw-frame{position:relative;height:100%;display:grid;grid-template-rows:100%;overflow:hidden;background:#fff;color:#171a22}.daw-sidebar{min-width:0;overflow:hidden;border-right:1px solid #e5e8ef;background:#fafbfe}.daw-center{min-width:0;display:flex;overflow:hidden}.daw-details{min-width:0;overflow:hidden;border-left:1px solid #e5e8ef}.daw-overlay{position:absolute;inset:0;z-index:20;pointer-events:none}.daw-overlay>*{pointer-events:auto}`;
