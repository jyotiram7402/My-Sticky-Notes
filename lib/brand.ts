// App icon artwork shared by the PNG icon routes (server) and the inline logo (client).
// Drawn on a 512 x 512 canvas: an orange rounded square with a white sticky note
// whose bottom-right corner is folded.

export const BRAND_ORANGE = "#FF9A3C";
export const BRAND_BACKGROUND = "#F5F5F2";

/** localStorage key that remembers the onboarding slides were seen on this device. */
export const ONBOARDING_STORAGE_KEY = "msn:onboarded:v1";

export const LOGO = {
  viewBox: "0 0 512 512",
  /** Corner radius of the orange square when it is drawn with rounded corners. */
  radius: 116,
  orange: BRAND_ORANGE,
  /** The white note, 256 x 256, centered, so it also fits a maskable icon's safe zone. */
  notePath: "M152 128H360A24 24 0 0 1 384 152V304L304 384H152A24 24 0 0 1 128 360V152A24 24 0 0 1 152 128Z",
  noteColor: "#FFFFFF",
  /** The folded flap in the bottom-right corner. */
  foldPath: "M384 304L304 384V328A24 24 0 0 1 328 304Z",
  foldColor: "#FFD9B5",
  /** Two "written" lines on the note. */
  lines: [
    { x: 168, y: 180, width: 152, height: 24 },
    { x: 168, y: 232, width: 104, height: 24 },
  ],
  lineColor: "#FFC48A",
} as const;
