import { $ } from "bun";
// @ts-ignore
import { Packer } from "roadroller";

// TODO:
//   - deal with gl-matrix export
//   - minify glsl
//   - run minifier after closure (?)

const outDir = __dirname + "/../dist";
const tmpDir = __dirname + "/../.tmp";

await $`rm -rf ${outDir} ${tmpDir}`;
await $`mkdir -p ${outDir} ${tmpDir}`;

const removeWhiteSpace = (text: string) =>
  text
    .replace(/\s+/g, " ")
    .replace(/(\W)\s+/g, (_, a) => a)
    .replace(/\s+(\W)/g, (_, a) => a)
    .trim();

const minifyHtml = (text: string) => removeWhiteSpace(text.replaceAll(/"(\S+)"/g, (_, a) => a));

//
// bundle
const { outputs, success, logs } = await Bun.build({
  entrypoints: [__dirname + "/../src/main.ts"],
  target: "browser",
  format: "esm",
  // minify: { whitespace: true, syntax: false, identifiers: false },
});

if (!success) {
  console.error(logs.join("\n"));
  process.exit(1);
}

let js = "";
let css = "";
for (const o of outputs) {
  if (o.path.endsWith(".css")) css += await o.text();
  if (o.path.endsWith(".js")) js += await o.text();
}

let i = 0;
for (const o of outputs) {
  if (o.path.endsWith(".bin")) {
    const name = i.toString();
    i++;
    js = js.replaceAll(o.path, name);
    Bun.write(outDir + "/" + name, await o.arrayBuffer());
  }
}

console.log("bun build ✅");

{
  const html = (await Bun.file("index.html").text()).replace(
    /<script[^>]*>(<\/script>)?/,
    `<style>${css}</style><script>${js}</script>`,
  );

  await Bun.write(`${tmpDir}/index-bun-build.html`, html);
}

//
// closure compiler
await Bun.write(tmpDir + "/closure-in.js", js);
// prettier-ignore
await $`bunx google-closure-compiler ${[
  "--js", tmpDir+"/closure-in.js",
  "--js_output_file", ".tmp/closure-out.js",
  "--externs", "scripts/externs.js",
  "--compilation_level", "ADVANCED",
  "--language_in", "ECMASCRIPT_2021",
  "--language_out", "ECMASCRIPT_2021",
  "--warning_level", "QUIET",
]}`
js = await Bun.file(tmpDir + "/closure-out.js").text();

console.log("closure compiler ✅");

{
  const html = minifyHtml(await Bun.file("index.html").text()).replace(
    /<script[^>]*>(<\/script>)?/,
    `<style>${removeWhiteSpace(css)}</style><script>${js}</script>`,
  );
  await Bun.write(`${tmpDir}/index-closure.html`, html);
}

//
// roadroller
const packer = new Packer([{ data: js, type: "js", action: "eval" }], {});
await packer.optimize(2);
const { firstLine, secondLine } = packer.makeDecoder();

console.log("roadroller ✅");

//
// inline into html

{
  const html = removeWhiteSpace(await Bun.file("index.html").text()).replace(
    /<script[^>]*>(<\/script>)?/,
    `<style>${removeWhiteSpace(css)}</style><script>${firstLine + secondLine}</script>`,
  );
  await Bun.write(`${outDir}/index.html`, html);
}

//
// zip
//
await $`cd ${outDir} && zip -9 -X -q bundle.zip *`;
await $`advzip -z -4 -i 1000 -q ${outDir}/bundle.zip`;

console.log("advzip ✅");

console.log(``);
console.log(`index-closure.html  ${Bun.file(`${tmpDir}/index-closure.html`).size} bytes `);
console.log(`index.html  ${Bun.file(`${outDir}/index.html`).size} bytes `);

const size = Bun.file(`${outDir}/bundle.zip`).size;
const budget = 13312;
console.log(`bundle.zip  ${size} / ${budget} bytes  (${((size / budget) * 100).toFixed(1)}%)`);

// await $`cp ${tmpDir}/index-bun-build.html ${outDir}/index.html`;
