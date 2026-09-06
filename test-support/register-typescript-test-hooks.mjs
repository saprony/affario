import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import {
  dirname,
  extname,
  isAbsolute,
  resolve as resolvePath,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PROJECT_ROOT = process.cwd();
const TYPESCRIPT_EXTENSIONS = [".ts", ".tsx", ".mts"];

function resolveProjectFile(candidatePath) {
  const candidates = extname(candidatePath)
    ? [candidatePath]
    : [
        candidatePath,
        ...TYPESCRIPT_EXTENSIONS.map((extension) => candidatePath + extension),
        ...TYPESCRIPT_EXTENSIONS.map((extension) =>
          resolvePath(candidatePath, `index${extension}`)
        ),
      ];

  const matchedPath = candidates.find((path) => existsSync(path));
  return matchedPath ? pathToFileURL(matchedPath).href : null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export {};",
      };
    }

    if (isAbsolute(specifier)) {
      const resolved = resolveProjectFile(specifier);

      if (resolved) {
        return { shortCircuit: true, url: resolved };
      }
    }

    if (specifier.startsWith("@/")) {
      const resolved = resolveProjectFile(
        resolvePath(PROJECT_ROOT, specifier.slice(2))
      );

      if (resolved) {
        return { shortCircuit: true, url: resolved };
      }
    }

    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.startsWith("file:")
    ) {
      const resolved = resolveProjectFile(
        resolvePath(dirname(fileURLToPath(context.parentURL)), specifier)
      );

      if (resolved) {
        return { shortCircuit: true, url: resolved };
      }
    }

    return nextResolve(specifier, context);
  },
});
