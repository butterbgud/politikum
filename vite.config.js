import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";

const GIT_SHA = (() => {
  try { return execSync("git rev-parse --short HEAD").toString().trim(); }
  catch { return "nogit"; }
})();

const GIT_BRANCH = (() => {
  try { return execSync("git rev-parse --abbrev-ref HEAD").toString().trim(); }
  catch { return "nogit"; }
})();

export default defineConfig({
  plugins: [react()],
  define: {
    __GIT_SHA__: JSON.stringify(GIT_SHA),
    __GIT_BRANCH__: JSON.stringify(GIT_BRANCH),
  },
});
