import { spawn } from "node:child_process";

const children = new Set();
let shuttingDown = false;
let webStarted = false;

function start(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: options.pipeOutput ? ["inherit", "pipe", "pipe"] : "inherit",
  });

  children.add(child);
  child.on("exit", (code, signal) => {
    children.delete(child);
    if (!shuttingDown && options.required !== false && code !== 0) {
      console.error(`${command} ${args.join(" ")} exited with ${signal ?? code}`);
      shutdown(code ?? 1);
    }
  });

  return child;
}

function startWeb() {
  if (webStarted) return;
  webStarted = true;
  start("npm", ["--workspace", "apps/web", "run", "dev", "--", "--port", "5174", "--strictPort"]);
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 250);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("Starting Convex dev backend...");
const convex = start("npx", ["convex", "dev"], { pipeOutput: true });

const readyPattern = /Convex functions ready|Watching for changes/;
const fallbackTimer = setTimeout(() => {
  console.warn("Convex readiness was not detected yet; starting frontend anyway.");
  startWeb();
}, 10_000);

for (const stream of [convex.stdout, convex.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    const text = String(chunk);
    process.stdout.write(text);
    if (readyPattern.test(text)) {
      clearTimeout(fallbackTimer);
      startWeb();
    }
  });
}
