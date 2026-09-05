import { BRAND_LOGO_SOURCE } from "./assets.js";

export const BRAND_NAME = "正方 AI 工作台";

export function createBrand(React) {
  const h = React.createElement;
  return function Brand() {
    return h("div", { className: "daw-brand", "aria-label": BRAND_NAME },
      h("span", { className: "daw-brand-mark", "aria-hidden": "true" },
        h("img", { src: BRAND_LOGO_SOURCE, alt: "", width: 152, height: 44, draggable: false })),
      h("span", { className: "daw-brand-name" }, BRAND_NAME),
    );
  };
}
