import type { CapacitorConfig } from "@capacitor/cli";

// (D-08/D-09) Capacitor shell config. webDir points at the Next.js static
// export (output: 'export' -> web/out) that cap sync copies into the Android
// assets so the app is offline by construction (PLAT-02).
const config: CapacitorConfig = {
  appId: "com.staadonline.viewer",
  appName: "STAAD Online",
  webDir: "out",
};

export default config;