import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist/android-web');
let html = await readFile(path.join(root, 'index.html'), 'utf8');
const start = html.indexOf('<link rel="preconnect"');
const end = html.indexOf('<style>', start);
if (start < 0 || end < 0) throw new Error('Cannot locate the game resource header');

html = html.slice(0, start) + `
<meta http-equiv="Content-Security-Policy" content="default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'">
<link rel="stylesheet" href="vendor/fonts.css">
<script src="vendor/phaser.min.js"></script>
<script>function gtag(){}</script>
` + html.slice(end);
html = html.replace('</head>', '<style>#fsBtn{display:none!important}</style></head>');
html = html.replace('assets/intro_video.mp4', 'assets/intro_video_android.mp4');

await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, 'vendor'), { recursive: true });
await writeFile(path.join(output, 'index.html'), html);
await cp(path.join(root, 'node_modules/phaser/dist/phaser.min.js'), path.join(output, 'vendor/phaser.min.js'));
await cp(path.join(root, 'node_modules/phaser/LICENSE.md'), path.join(output, 'vendor/PHASER-LICENSE.md'));
await cp(path.join(root, 'node_modules/@fontsource/inter/LICENSE'), path.join(output, 'vendor/INTER-LICENSE.txt'));

const assetPaths = new Set(html.match(/assets\/[\w.-]+\.(?:png|mp4)/g));
await mkdir(path.join(output, 'assets'));
for (const asset of assetPaths) await cp(path.join(root, asset), path.join(output, asset));

const fonts = [];
for (const weight of [400, 500, 600, 700, 800, 900]) {
  const filename = `inter-latin-${weight}-normal.woff2`;
  await cp(path.join(root, 'node_modules/@fontsource/inter/files', filename), path.join(output, 'vendor', filename));
  fonts.push(`@font-face{font-family:Inter;font-style:normal;font-weight:${weight};font-display:swap;src:url('${filename}') format('woff2');}`);
}
await writeFile(path.join(output, 'vendor/fonts.css'), fonts.join('\n'));
console.log(`Bundled ${assetPaths.size} game assets and local engine/fonts in ${output}`);
