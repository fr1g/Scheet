// 从 v5 设计稿（S 花押）生成托盘与应用图标 PNG（带透明通道）。
// 运行：node logo-designs/generate.mjs
// 依赖：@resvg/resvg-js（devDependency）。
// 几何：复刻 v05 —— 两个 2×2 圆角方块簇（rotate 35° + skewX -12°），
// flex 纵向堆叠（A 上 B 下）+ 反向平移（A 右 B 左）。
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "generated");

// Tailwind zinc 调色板 + v5 双色（含原 alpha）
const C = {
  zinc50: "#fafafa",
  zinc100: "#f4f4f5",
  zinc300: "#d4d4d8",
  zinc500: "#71717a",
  zinc600: "#52525b",
  zinc900: "#18181b",
  zinc950: "#09090b",
  salmon: "rgba(254,202,192,0.87)", // #fecac0de
  indigo: "rgba(97,94,168,0.88)", // #615ea8e0
};

const SIDE = 195; // 单个方块边长（512 基准坐标）
const RADIUS = 49; // 方块圆角（≈ 边长 25%）
const GAP = 12; // 簇内间隙（≈ 边长 1/16）
const STACK = SIDE + GAP / 2; // flex 纵向堆叠的半间距（grid 高的一半）
const SHIFT_X = 0.3 * (2 * SIDE + GAP); // translate-x-[30%]
const SHIFT_Y = 0.21 * (2 * SIDE + GAP); // translate-y-[21%]

const RAD = (35 * Math.PI) / 180;
const SKEW = Math.tan((-12 * Math.PI) / 180);

/** 簇内局部坐标 → 视口坐标（与 CSS transform 同序：T·R·S）。 */
function xform(cx, cy, [x, y]) {
  const dx = x - cx;
  const dy = y - cy;
  const sx = dx + SKEW * dy;
  const rx = sx * Math.cos(RAD) - dy * Math.sin(RAD);
  const ry = sx * Math.sin(RAD) + dy * Math.cos(RAD);
  return [rx + cx, ry + cy];
}

/**
 * 一个 2×2 簇，绕簇中心旋转+斜切。
 * cellDefs: [{ px, py, fill }]（相对簇左上角的格位，省略 = 空）。
 */
function cluster(cx, cy, cellDefs) {
  const x0 = cx - SIDE - GAP / 2;
  const y0 = cy - SIDE - GAP / 2;
  const rects = cellDefs
    .map(
      ({ px, py, fill }) =>
        `<rect x="${x0 + px}" y="${y0 + py}" width="${SIDE}" height="${SIDE}" rx="${RADIUS}" fill="${fill}"/>`
    )
    .join("");
  return `<g transform="translate(${cx} ${cy}) rotate(35) skewX(-12)"><g transform="translate(${-cx} ${-cy})">${rects}</g></g>`;
}

// 两簇中心（A = 白/灰500/鲑鱼，在上偏右；B = 靛蓝/灰600/灰300，在下偏左）
const A = [SHIFT_X, -STACK + SHIFT_Y];
const B = [-SHIFT_X, STACK - SHIFT_Y];

function monogram(p) {
  const step = SIDE + GAP;
  return (
    cluster(A[0], A[1], [
      { px: 0, py: 0, fill: p.a1 },
      { px: step, py: 0, fill: p.a2 },
      { px: 0, py: step, fill: p.a3 },
    ]) +
    cluster(B[0], B[1], [
      { px: step, py: 0, fill: p.b1 },
      { px: 0, py: step, fill: p.b2 },
      { px: step, py: step, fill: p.b3 },
    ])
  );
}

/** 花押包围盒（数值解，与渲染同一几何）。 */
function bbox(p) {
  const step = SIDE + GAP;
  const half = SIDE + GAP / 2;
  const defs = [
    [A, [
      [0, 0], [step, 0], [0, step],
    ]],
    [B, [
      [step, 0], [0, step], [step, step],
    ]],
  ];
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const [c, cells] of defs) {
    for (const [px, py] of cells) {
      const x0 = c[0] - half + px;
      const y0 = c[1] - half + py;
      for (const [ox, oy] of [[0, 0], [SIDE, 0], [0, SIDE], [SIDE, SIDE]]) {
        const [tx, ty] = xform(c[0], c[1], [x0 + ox, y0 + oy]);
        minX = Math.min(minX, tx); minY = Math.min(minY, ty);
        maxX = Math.max(maxX, tx); maxY = Math.max(maxY, ty);
      }
    }
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

const PALETTE_COLOR = {
  a1: C.zinc100, a2: C.zinc500, a3: C.salmon,
  b1: C.indigo, b2: C.zinc600, b3: C.zinc300,
};
const PALETTE_GRAY = {
  a1: C.zinc100, a2: C.zinc500, a3: C.zinc300,
  b1: C.zinc500, b2: C.zinc600, b3: C.zinc300,
};
const PALETTE_ZINC50 = {
  a1: C.zinc50, a2: C.zinc50, a3: C.zinc50,
  b1: C.zinc50, b2: C.zinc50, b3: C.zinc50,
};
const PALETTE_ZINC950 = {
  a1: C.zinc950, a2: C.zinc950, a3: C.zinc950,
  b1: C.zinc950, b2: C.zinc950, b3: C.zinc950,
};
const PALETTE_BLACK = {
  a1: "#000000", a2: "#000000", a3: "#000000",
  b1: "#000000", b2: "#000000", b3: "#000000",
};

/** 花押居中并缩放到目标内容宽。 */
function fitted(p, canvas, targetW, extra = "") {
  const b = bbox(p);
  const scale = targetW / Math.max(b.w, b.h);
  const tx = canvas / 2 - scale * (b.minX + b.w / 2);
  const ty = canvas / 2 - scale * (b.minY + b.h / 2);
  return `<g transform="translate(${tx} ${ty}) scale(${scale})">${extra}${monogram(p)}</g>`;
}

function render(name, svgText, size) {
  const resvg = new Resvg(svgText, { fitTo: { mode: "width", value: size } });
  const png = resvg.render().asPng();
  writeFileSync(join(OUT, name), png);
  console.log("wrote", name, `${png.length} bytes`);
}

mkdirSync(OUT, { recursive: true });

const TRAY_W = 512 * 0.74;

// 1) 主推：zinc50 填充 + zinc950 外描边（描边垫底 paint-order:stroke）
render(
  "tray-32-bordered.png",
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 512 512">
    <g stroke="${C.zinc950}" stroke-width="30" stroke-linejoin="round" fill="${C.zinc950}" paint-order="stroke">
      ${fitted(PALETTE_ZINC50, 512, TRAY_W)}
    </g>
  </svg>`,
  32
);
// 2) macOS template：纯黑无框
render(
  "tray-32-template-black.png",
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 512 512">${fitted(PALETTE_BLACK, 512, TRAY_W)}</svg>`,
  32
);
// 3) 纯 zinc50 无框（深色任务栏）
render(
  "tray-32-zinc50.png",
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 512 512">${fitted(PALETTE_ZINC50, 512, TRAY_W)}</svg>`,
  32
);
// 4) 纯 zinc950 无框（浅色任务栏）
render(
  "tray-32-zinc950.png",
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 512 512">${fitted(PALETTE_ZINC950, 512, TRAY_W)}</svg>`,
  32
);
// 5) zinc50 + 投影
render(
  "tray-32-zinc50-shadow.png",
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 512 512">
    <defs>
      <filter id="s" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#000000" flood-opacity="0.6"/>
      </filter>
    </defs>
    <g filter="url(#s)">${fitted(PALETTE_ZINC50, 512, TRAY_W)}</g>
  </svg>`,
  32
);

// ---- 应用图标 1024（Apple 网格：1024 画布 / 824 主体 / 185 圆角，背景 zinc900） ----
function appIcon(name, palette) {
  const tile = 824;
  const off = (1024 - tile) / 2;
  const glyph = fitted(palette, 1024, 560);
  render(
    name,
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
      <rect x="${off}" y="${off}" width="${tile}" height="${tile}" rx="185" fill="${C.zinc900}"/>
      ${glyph}
    </svg>`,
    1024
  );
}
appIcon("appicon-1024-color.png", PALETTE_COLOR);
appIcon("appicon-1024-grayscale.png", PALETTE_GRAY);
appIcon("appicon-1024-zinc50.png", PALETTE_ZINC50);

console.log("done");
