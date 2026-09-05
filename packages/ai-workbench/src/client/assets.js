// The build replaces these safe fallbacks with the supplied PNG data URLs.
// Keeping this module pure JavaScript allows Node-based component tests to
// import it without requiring a browser image loader.
export const AI_ORB_SOURCE = typeof __DSH_WORKBENCH_AI_ORB_SOURCE__ === "string"
  ? __DSH_WORKBENCH_AI_ORB_SOURCE__
  : "";
export const BRAND_LOGO_SOURCE = typeof __DSH_WORKBENCH_BRAND_LOGO_SOURCE__ === "string"
  ? __DSH_WORKBENCH_BRAND_LOGO_SOURCE__
  : "";
