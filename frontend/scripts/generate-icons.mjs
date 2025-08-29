// Generate PWA icons from favicon.svg using Sharp.
// Usage: node scripts/generate-icons.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const pubDir = path.join(root, 'public');
const srcSvg = path.join(pubDir, 'favicon.svg');

// Fallback SVG (blue rounded square with "OF") if favicon.svg ever goes missing
const fallbackSVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect x="0" y="0" width="512" height="512" rx="96" fill="#2b6cff"/>
  <text x="50%" y="50%" dy="0.35em" text-anchor="middle"
        font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
        font-size="220" fill="white" font-weight="700">OF</text>
</svg>`.trim();

async function readSVG() {
  try {
    return await fs.readFile(srcSvg);
  } catch {
    return Buffer.from(fallbackSVG, 'utf8');
  }
}

async function makeIcon(svgBuf, size, outfile) {
  await sharp(svgBuf, { density: 384 })  // high density to keep edges crisp
    .resize(size, size, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(pubDir, outfile));
  console.log(`✓ wrote ${outfile}`);
}

const svg = await readSVG();
await makeIcon(svg, 192, 'pwa-192.png');
await makeIcon(svg, 512, 'pwa-512.png');

// (Optional) iOS home-screen icon (older Safari likes this name)
await makeIcon(svg, 180, 'apple-touch-icon.png');

console.log('All icons generated in /public');

