import type * as React from "react";
import type { Translate } from "./client-types.js";
import type { WorkspaceRow } from "./core.js";
import type { RepositoryDestination } from "./types.js";

/** 目标选择：用户目录（默认）、指定工作区或自定义预设模式。 */
export type DestinationScope = "user" | "workspace" | "preset";
export interface PresetDestination {
  key: string;
  name: string;
  path: string;
  available?: boolean;
}
export interface DestinationValue {
  scope: DestinationScope;
  location: "dsh" | "agents";
  /** 已登记工作区路径；用户目录下为空串。 */
  workspace: string;
  /** 自定义预设模式 rootKey（例如 preset-code-review） */
  presetKey?: string;
}
export type UserDestination = RepositoryDestination;
export interface DestinationPickerProps {
  t: Translate;
  value: DestinationValue;
  onChange: (next: Partial<DestinationValue>) => void;
  workspaces: readonly WorkspaceRow[];
  userDestinations: readonly UserDestination[];
  presetDestinations?: readonly PresetDestination[];
  /** 创建与导入入口不开放 Shared Agent。 */
  allowAgents: boolean;
  disabled?: boolean;
}
export type DestinationPickerComponent = React.ComponentType<DestinationPickerProps>;
/** 注入给各入口的一套选择器能力，保证三处共用同一实现。 */
export interface DestinationKit {
  DestinationPicker: DestinationPickerComponent;
  defaultDestination: () => DestinationValue;
  destinationPayload: (value: DestinationValue) => { root?: string; workspace?: string };
  destinationReady: (value: DestinationValue, workspaces: readonly WorkspaceRow[], userDestinations?: readonly UserDestination[], presetDestinations?: readonly PresetDestination[]) => boolean;
}
