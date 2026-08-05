/**
 * Generate the PWA icon set and the iPhone 16 Pro splash screen by
 * screenshotting a rendered canvas — no binary assets in the repo, the
 * icons regenerate from this script like everything else in the game.
 */
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const ICON_HTML = (size, maskable) => `
<html><body style="margin:0"><canvas id="c" width="${size}" height="${size}"></canvas>
<script>
const c = document.getElementById('c'), x = c.getContext('2d'), S = ${size};
const pad = ${maskable ? 'S * 0.14' : '0'};
// Background
const g = x.createLinearGradient(0, 0, S, S);
g.addColorStop(0, '#1b1b26'); g.addColorStop(1, '#0a0a0d');
x.fillStyle = g; x.fillRect(0, 0, S, S);
// Card silhouette, angled, with a gold foil sweep
x.save();
x.translate(S / 2, S / 2);
x.rotate(-0.14);
const cw = (S - pad * 2) * 0.52, ch = cw / (2.5 / 3.5);
x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = S * 0.06; x.shadowOffsetY = S * 0.02;
const cg = x.createLinearGradient(-cw/2, -ch/2, cw/2, ch/2);
cg.addColorStop(0, '#d4a017'); cg.addColorStop(0.35, '#ffe9a8');
cg.addColorStop(0.55, '#d4a017'); cg.addColorStop(0.8, '#8a6d1f'); cg.addColorStop(1, '#ffd75e');
x.fillStyle = cg;
x.beginPath(); x.roundRect(-cw/2, -ch/2, cw, ch, S * 0.035); x.fill();
x.shadowColor = 'transparent';
// Inner frame
x.strokeStyle = 'rgba(26,20,5,0.55)'; x.lineWidth = S * 0.012;
x.beginPath(); x.roundRect(-cw/2 + S*0.035, -ch/2 + S*0.035, cw - S*0.07, ch - S*0.07, S*0.02); x.stroke();
// "1/1"
x.fillStyle = '#1a1405';
x.font = '900 ' + (S * 0.19) + 'px "Arial Narrow", Arial, sans-serif';
x.textAlign = 'center'; x.textBaseline = 'middle';
x.fillText('1/1', 0, 0);
x.restore();
</script></body></html>`;

const SPLASH_HTML = (w, h) => `
<html><body style="margin:0;width:${w}px;height:${h}px;background:#0c0c10;
display:flex;align-items:center;justify-content:center;flex-direction:column;
font-family:-apple-system,Helvetica,sans-serif;color:#f4f2ec">
<div style="font-size:${Math.round(w * 0.105)}px;font-weight:900;letter-spacing:${w * 0.012}px">CARDBOARD</div>
<div style="font-size:${Math.round(w * 0.032)}px;opacity:.45;letter-spacing:${w * 0.006}px;margin-top:${w * 0.02}px">
THE HUNT FOR THE 1/1</div>
</body></html>`;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

for (const [size, maskable, name] of [
  [192, false, 'icon-192.png'],
  [512, false, 'icon-512.png'],
  [512, true, 'icon-maskable-512.png'],
  [180, false, 'apple-touch-icon.png'],
]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(ICON_HTML(size, maskable));
  await page.waitForTimeout(120);
  const buf = await page.locator('#c').screenshot();
  await writeFile(new URL(`../public/${name}`, import.meta.url), buf);
  await page.close();
  console.log(`wrote public/${name}`);
}

// iPhone 16 Pro launch image: 1206 x 2622 physical pixels.
const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 });
await page.setContent(SPLASH_HTML(402, 874));
await page.waitForTimeout(120);
await page.screenshot({ path: new URL('../public/splash-1206x2622.png', import.meta.url).pathname });
console.log('wrote public/splash-1206x2622.png');

await browser.close();
