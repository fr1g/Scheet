export type WindowControlsPosition = "left" | "right" | "hidden";

export interface WindowControlsSettings {
  position: WindowControlsPosition;
}

export interface AppSettings {
  windowControls: WindowControlsSettings;
}
