/**
 * src/routes のディレクトリから src/routes.gen.ts を書き出す。
 * 決まりは hono-kit に揃えている（ディレクトリが URL、1 ディレクトリに index.tsx が 1 つ、メソッド名で export）。
 * hono-kit にない決まりとして、_layout.tsx（レイアウト）、_middleware.ts（ガードなど）、_404.tsx（どれにも当たらないとき）を読む。
 *
 * Vite からはプラグインとして、それ以外（tsc の前）は `node plugins/routes.ts` で使う
 */
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const PAGE_NAMES = ["index.tsx", "index.ts"];
const LAYOUT_NAMES = ["_layout.tsx"];
const MIDDLEWARE_NAMES = ["_middleware.ts", "_middleware.tsx"];
const NOT_FOUND_NAMES = ["_404.tsx"];

// _ で始まるディレクトリは読まない（hono-kit と同じ）
function filesIn(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && entry.name.startsWith("_")) return [];
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? filesIn(file) : [file];
  });
}

/**
 * ディレクトリから URL を作る。[id] は :id、[...path] は残り全部で :path{.+}、
 * (名前) は見た目のまとまりで URL に出さない
 */
function routePathOf(dir: string) {
  const segments = dir
    .split("/")
    .filter(Boolean)
    .flatMap((segment) => {
      if (/^\(.+\)$/.test(segment)) return [];
      const rest = /^\[\.\.\.(\w+)\]$/.exec(segment);
      if (rest) return [`:${rest[1]}{.+}`];
      const param = /^\[(\w+)\]$/.exec(segment);
      if (param) return [`:${param[1]}`];
      return [segment];
    });
  return `/${segments.join("/")}`;
}

/**
 * 静的な段、:param、catch-all の順に並べる。Hono は登録した順に試すので、
 * /users/new が /users/:id に負けないように
 */
const rank = (p: string) => p.split("/").map((s) => (s.endsWith("{.+}") ? "2" : s.startsWith(":") ? "1" : `0${s}`));
function byPath(a: string, b: string) {
  const [x, y] = [rank(a), rank(b)];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return x.length - y.length;
}

// "users/[id]" → ["", "users", "users/[id]"]。外側のディレクトリから順に
function ancestorsOf(dir: string) {
  const parts = dir.split("/").filter(Boolean);
  return ["", ...parts.map((_, i) => parts.slice(0, i + 1).join("/"))];
}

export function generate(src: string) {
  const routesDir = path.join(src, "routes");
  const files = filesIn(routesDir).sort();
  const dirOf = (file: string) => path.relative(routesDir, path.dirname(file)).split(path.sep).join("/");
  const importPath = (file: string) => `./${path.relative(src, file).split(path.sep).join("/").replace(/\.tsx?$/, "")}`;

  const imports: string[] = [];
  // ディレクトリ → そのディレクトリの middleware / layout を通す式
  const middlewares = new Map<string, string>();
  const layouts = new Map<string, string>();
  const pages: { path: string; module: string; dir: string }[] = [];
  let notFound: string | undefined;

  files.forEach((file, i) => {
    const name = path.basename(file);
    const dir = dirOf(file);
    if (PAGE_NAMES.includes(name)) {
      imports.push(`import * as page${i} from "${importPath(file)}";`);
      pages.push({ path: routePathOf(dir), module: `page${i}`, dir });
    } else if (MIDDLEWARE_NAMES.includes(name)) {
      imports.push(`import middleware${i} from "${importPath(file)}";`);
      middlewares.set(dir, `middleware${i}`);
    } else if (LAYOUT_NAMES.includes(name)) {
      imports.push(`import Layout${i} from "${importPath(file)}";`);
      layouts.set(dir, `layout(Layout${i})`);
    } else if (NOT_FOUND_NAMES.includes(name) && dir === "") {
      imports.push(`import notFound from "${importPath(file)}";`);
      notFound = "notFound";
    }
  });

  // そのディレクトリまでに通る middleware と layout。外側から順に、同じディレクトリでは middleware が先
  const chainOf = (dir: string) =>
    ancestorsOf(dir).flatMap((d) => [middlewares.get(d), layouts.get(d)].filter((x) => x !== undefined));

  pages.sort((a, b) => byPath(a.path, b.path));

  const lines = [
    "// src/routes から plugins/routes.ts が書き出す。手で直さない",
    'import { Hono, type Handler, type MiddlewareHandler } from "hono";',
    'import { jsxRenderer, layout } from "./jsx-adapter";',
    ...imports,
    "",
    'const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;',
    "type PageModule = Partial<Record<(typeof METHODS)[number], Handler>>;",
    "",
    "// ページのファイルが export しているメソッドを、通る middleware と layout のあとに登録する",
    "function page(app: Hono, path: string, module: PageModule, chain: MiddlewareHandler[]) {",
    "  for (const method of METHODS) {",
    "    const handler = module[method];",
    "    if (handler) app.on(method, [path], ...chain, handler);",
    "  }",
    "}",
    "",
    "export const app = new Hono();",
    "",
    'app.use("*", jsxRenderer());',
    ...pages.map((p) => `page(app, "${p.path}", ${p.module}, [${chainOf(p.dir).join(", ")}]);`),
    ...(notFound ? [`app.all("*", ${[...chainOf(""), notFound].join(", ")});`] : []),
    "",
    "// ルートのパスの一覧を router.ts に教える。href() の型に使う",
    'declare module "./router" {',
    "  interface Register {",
    `    routes: ${pages.length > 0 ? [...new Set(pages.map((p) => JSON.stringify(p.path)))].join(" | ") : "never"};`,
    "  }",
    "}",
    "",
  ];
  return lines.join("\n");
}

// 中身が変わったときだけ書く
export function writeRoutes(src: string) {
  const out = path.join(src, "routes.gen.ts");
  const code = generate(src);
  if (fs.existsSync(out) && fs.readFileSync(out, "utf8") === code) return;
  fs.writeFileSync(out, code);
  console.log(`✓ ${path.relative(process.cwd(), out)} を書き出した`);
}

// dev と build の前に書き出し、dev の間は src/routes にファイルが増えたり減ったりしたら書き直す
export function routes(): Plugin {
  let src = "";
  return {
    name: "routes",
    configResolved(config) {
      src = path.join(config.root, "src");
    },
    buildStart() {
      writeRoutes(src);
    },
    configureServer(server) {
      const routesDir = path.join(src, "routes") + path.sep;
      const rewrite = (file: string) => {
        if (file.startsWith(routesDir)) writeRoutes(src);
      };
      server.watcher.on("add", rewrite);
      server.watcher.on("unlink", rewrite);
    },
  };
}

// node plugins/routes.ts で実行されたとき
if (import.meta.main) writeRoutes(path.resolve("src"));
