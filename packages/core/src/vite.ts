/**
 * src/routes のディレクトリから src/routes.gen.ts を書き出す。
 * ディレクトリの決まりは hono-kit に揃えている（ディレクトリが URL、1 ディレクトリに index.tsx が 1 つ）。
 * ページのファイルは、画面のコンポーネントを default export し、validateSearch / loader / Pending / ErrorComponent / action を名前付きで export する。
 * レイアウト（_layout.tsx）も、コンポーネントを default export し、validateSearch / loader / Pending / ErrorComponent を名前付きで export できる。
 * hono-kit にない決まりとして、_layout.tsx（レイアウト）、_middleware.ts（ガードなど）、_404.tsx（どれにも当たらないとき）を読む。
 *
 * アプリの vite.config.ts で plugins: [routes()] として読み込む。dev と build のたびに書き出す
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

// ページやレイアウトのファイルごとの型（React Router の +types と同じ考え方）。
// .routes-types/src/routes/<dir>/+types/<file>.ts に書き、tsconfig の rootDirs で
// src/routes/<dir>/+types/<file> として import できるようにする
// 書き出すコードが import するルーター本体
const CORE = "@hcr/core";

function typesFileOf(src: string, file: string, routePath: string, kind: "page" | "layout") {
  const rel = path.relative(src, file).split(path.sep).join("/"); // routes/users/[id]/index.tsx
  const dir = path.posix.dirname(rel);
  const base = path.posix.basename(rel).replace(/\.tsx?$/, "");
  const virtualDir = `${dir}/+types`; // src から見た、型のファイルの置き場所
  const out = path.join(path.dirname(src), ".routes-types", path.basename(src), virtualDir, `${base}.ts`);
  const code = [
    "// @hcr/core/vite が書き出す。手で直さない",
    `import type { LoaderArgs as Args, LoaderDataOfModule, RouteChild, SchemaOfModule } from "${CORE}";`,
    `import type * as Module from "../${base}";`,
    "",
    "export namespace Route {",
    `  export type LoaderArgs = Args<${JSON.stringify(routePath)}, SchemaOfModule<typeof Module>>;`,
    kind === "layout"
      ? "  export type ComponentProps = { data: LoaderDataOfModule<typeof Module>; search: LoaderArgs[\"search\"]; children?: RouteChild };"
      : "  export type ComponentProps = { data: LoaderDataOfModule<typeof Module>; search: LoaderArgs[\"search\"] };",
    "  export type ErrorProps = { error: unknown };",
    "}",
    "",
  ].join("\n");
  return { out, code };
}

export function generate(src: string) {
  const routesDir = path.join(src, "routes");
  const files = filesIn(routesDir).sort();
  const dirOf = (file: string) => path.relative(routesDir, path.dirname(file)).split(path.sep).join("/");
  const importPath = (file: string) => `./${path.relative(src, file).split(path.sep).join("/").replace(/\.tsx?$/, "")}`;

  const imports: string[] = [];
  const segments: string[] = [];
  // ディレクトリ → そのディレクトリの middleware / レイアウトの段の名前
  const middlewares = new Map<string, string>();
  const layouts = new Map<string, string>();
  const layoutModules = new Map<string, string>();
  const pages: { path: string; module: string; dir: string }[] = [];
  const types: { out: string; code: string }[] = [];
  let notFound: string | undefined;

  // その段の params の名前。/users/[id] の段なら ["id"]。レイアウトのデータを使い回せるかの判断に使う
  const paramNamesOf = (dir: string) =>
    JSON.stringify(dir.split("/").flatMap((s) => /^\[(?:\.\.\.)?(\w+)\]$/.exec(s)?.[1] ?? []));

  files.forEach((file, i) => {
    const name = path.basename(file);
    const dir = dirOf(file);
    if (PAGE_NAMES.includes(name)) {
      imports.push(`import * as page${i} from "${importPath(file)}";`);
      pages.push({ path: routePathOf(dir), module: `page${i}`, dir });
      types.push(typesFileOf(src, file, routePathOf(dir), "page"));
    } else if (MIDDLEWARE_NAMES.includes(name)) {
      imports.push(`import middleware${i} from "${importPath(file)}";`);
      middlewares.set(dir, `middleware${i}`);
    } else if (LAYOUT_NAMES.includes(name)) {
      imports.push(`import * as layoutModule${i} from "${importPath(file)}";`);
      segments.push(`const layout${i} = toSegment(${paramNamesOf(dir)}, layoutModule${i});`);
      layouts.set(dir, `layout${i}`);
      layoutModules.set(dir, `layoutModule${i}`);
      types.push(typesFileOf(src, file, routePathOf(dir), "layout"));
    } else if (NOT_FOUND_NAMES.includes(name) && dir === "") {
      imports.push(`import NotFound from "${importPath(file)}";`);
      notFound = "NotFound";
    }
  });

  // そのディレクトリまでに通る middleware / レイアウト。外側から順に
  const pick = (map: Map<string, string>, dir: string) =>
    ancestorsOf(dir).flatMap((d) => (map.has(d) ? [map.get(d)!] : []));

  pages.sort((a, b) => byPath(a.path, b.path));

  const lines = [
    "// src/routes から @hcr/core/vite が書き出す。手で直さない",
    'import { Hono, type MiddlewareHandler } from "hono";',
    `import { putMatch, toRoute, toSegment, type Route, type SearchOfModule } from "${CORE}";`,
    ...imports,
    "",
    "// レイアウトの段。同じレイアウトは、どのルートからも同じものを指す（データの使い回しに使う）",
    ...segments,
    "",
    "// Hono には middleware（ガード）と action だけを任せる。GET では、当たったルートを置いて返すだけ",
    "function page(app: Hono, path: string, route: Route, middlewares: MiddlewareHandler[]) {",
    "  if (route.segments.at(-1)?.Component) {",
    "    app.on(\"GET\", [path], ...middlewares, (c) => {",
    "      putMatch(c.req.raw, route, c.req.param() as Record<string, string>);",
    "      return c.body(null);",
    "    });",
    "  }",
    "  const action = route.action;",
    "  if (action) {",
    "    app.on(\"POST\", [path], ...middlewares, (c) =>",
    "      action({ params: c.req.param() as Record<string, string>, request: c.req.raw }),",
    "    );",
    "  }",
    "}",
    "",
    "export const app = new Hono();",
    "",
    ...pages.map(
      (p) =>
        `page(app, "${p.path}", toRoute([${pick(layouts, p.dir).join(", ")}], ${paramNamesOf(p.dir)}, ${p.module}), [${pick(middlewares, p.dir).join(", ")}]);`,
    ),
    ...(notFound
      ? [
          `page(app, "*", toRoute([${pick(layouts, "").join(", ")}], [], { default: ${notFound} }), [${pick(middlewares, "").join(", ")}]);`,
        ]
      : []),
    "",
    "// ルートのパスと、そのルートの段が受け付ける search params を @hcr/core に教える。href() の型に使う",
    `declare module "${CORE}" {`,
    "  interface Register {",
    "    routes: {",
    ...[...new Map(pages.map((p) => [p.path, p])).values()].map((p) => {
      const modules = [...pick(layoutModules, p.dir), p.module];
      return `      ${JSON.stringify(p.path)}: ${modules.map((m) => `SearchOfModule<typeof ${m}>`).join(" & ")};`;
    }),
    "    };",
    "  }",
    "}",
    "",
  ];
  return { code: lines.join("\n"), types };
}

// 中身が変わったときだけ書く
function writeIfChanged(out: string, code: string) {
  if (fs.existsSync(out) && fs.readFileSync(out, "utf8") === code) return;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, code);
  console.log(`✓ ${path.relative(process.cwd(), out)} を書き出した`);
}

export function writeRoutes(src: string) {
  const { code, types } = generate(src);
  writeIfChanged(path.join(src, "routes.gen.ts"), code);

  // 型のファイルを書く。消えたページやレイアウトの型のファイルは消す
  const typesRoot = path.join(path.dirname(src), ".routes-types");
  const keep = new Set(types.map((t) => t.out));
  if (fs.existsSync(typesRoot)) {
    for (const file of fs.readdirSync(typesRoot, { recursive: true, encoding: "utf8" })) {
      const full = path.join(typesRoot, file);
      if (full.endsWith(".ts") && !keep.has(full)) fs.rmSync(full);
    }
  }
  for (const t of types) writeIfChanged(t.out, t.code);
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
