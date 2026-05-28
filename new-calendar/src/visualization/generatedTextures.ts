import * as THREE from "three";

type TextureKind =
  | "bark"
  | "leaf"
  | "blossom"
  | "fruit"
  | "fallenLeaf"
  | "ground"
  | "snow";

interface TextureOptions {
  width?: number;
  height?: number;
  repeatX?: number;
  repeatY?: number;
}

export function createEarthSurfaceTexture(): THREE.CanvasTexture {
  const canvas = makeCanvas(512, 256);
  const context = canvas.getContext("2d");
  if (!context) return makeTexture(canvas);

  const ocean = context.createLinearGradient(0, 0, 0, canvas.height);
  ocean.addColorStop(0, "#2a8ed9");
  ocean.addColorStop(0.46, "#0e5aa3");
  ocean.addColorStop(1, "#062d63");
  context.fillStyle = ocean;
  context.fillRect(0, 0, canvas.width, canvas.height);

  addOceanNoise(context, canvas.width, canvas.height);
  drawContinent(context, "#55b46f", "#2f7d52", [
    [42, 72], [74, 44], [118, 52], [144, 82], [122, 124], [76, 118],
  ]);
  drawContinent(context, "#4fa865", "#2d7447", [
    [154, 134], [198, 108], [230, 146], [214, 210], [166, 196],
  ]);
  drawContinent(context, "#66bd76", "#3e8b55", [
    [282, 58], [348, 34], [414, 72], [384, 118], [306, 110],
  ]);
  drawContinent(context, "#5aae6e", "#327c50", [
    [374, 142], [444, 126], [486, 160], [452, 210], [392, 196],
  ]);
  drawPolarCaps(context, canvas.width, canvas.height);
  drawCloudBands(context, canvas.width, canvas.height);

  const texture = makeTexture(canvas, { repeatX: 1, repeatY: 1 });
  texture.anisotropy = 8;
  return texture;
}

export function createNatureTexture(kind: TextureKind, options: TextureOptions = {}): THREE.CanvasTexture {
  const width = options.width ?? 256;
  const height = options.height ?? 256;
  const canvas = makeCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) return makeTexture(canvas, options);

  if (kind === "bark") drawBark(context, width, height);
  if (kind === "leaf") drawLeaf(context, width, height);
  if (kind === "blossom") drawBlossom(context, width, height);
  if (kind === "fruit") drawFruit(context, width, height);
  if (kind === "fallenLeaf") drawFallenLeaf(context, width, height);
  if (kind === "ground") drawGround(context, width, height);
  if (kind === "snow") drawSnow(context, width, height);

  return makeTexture(canvas, options);
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function makeTexture(canvas: HTMLCanvasElement, options: TextureOptions = {}): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(options.repeatX ?? 1, options.repeatY ?? 1);
  texture.anisotropy = 4;
  return texture;
}

function drawContinent(
  context: CanvasRenderingContext2D,
  base: string,
  shadow: string,
  points: number[][],
) {
  context.save();
  context.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
  context.fillStyle = base;
  context.fill();
  context.clip();

  for (let i = 0; i < 34; i += 1) {
    const point = points[i % points.length];
    context.beginPath();
    context.fillStyle = i % 2 === 0 ? "rgba(244, 223, 145, 0.26)" : `${shadow}99`;
    context.ellipse(
      point[0] + Math.sin(i * 5.2) * 28,
      point[1] + Math.cos(i * 3.7) * 24,
      18 + (i % 5) * 4,
      5 + (i % 3) * 3,
      i * 0.41,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  context.restore();
}

function addOceanNoise(context: CanvasRenderingContext2D, width: number, height: number) {
  for (let i = 0; i < 600; i += 1) {
    const x = (i * 73) % width;
    const y = (i * 37) % height;
    context.fillStyle = i % 3 === 0 ? "rgba(120, 221, 255, 0.08)" : "rgba(0, 18, 46, 0.08)";
    context.fillRect(x, y, 1 + (i % 5), 1);
  }
}

function drawCloudBands(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = "rgba(255, 255, 255, 0.32)";
  for (let i = 0; i < 18; i += 1) {
    const x = (i * 47) % width;
    const y = 30 + ((i * 29) % (height - 60));
    context.beginPath();
    context.ellipse(x, y, 28 + (i % 4) * 8, 4 + (i % 3), (i % 2 ? -1 : 1) * 0.18, 0, Math.PI * 2);
    context.fill();
  }
}

function drawPolarCaps(context: CanvasRenderingContext2D, width: number, height: number) {
  const north = context.createLinearGradient(0, 0, 0, 34);
  north.addColorStop(0, "rgba(255,255,255,0.86)");
  north.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = north;
  context.fillRect(0, 0, width, 38);

  const south = context.createLinearGradient(0, height - 42, 0, height);
  south.addColorStop(0, "rgba(255,255,255,0)");
  south.addColorStop(1, "rgba(255,255,255,0.82)");
  context.fillStyle = south;
  context.fillRect(0, height - 42, width, 42);
}

function drawBark(context: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = context.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, "#6f341e");
  gradient.addColorStop(0.5, "#c66f39");
  gradient.addColorStop(1, "#5a2817");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  for (let x = -16; x < width + 16; x += 12) {
    context.strokeStyle = x % 24 === 0 ? "rgba(38, 18, 8, 0.48)" : "rgba(255, 188, 112, 0.18)";
    context.lineWidth = x % 24 === 0 ? 4 : 2;
    context.beginPath();
    for (let y = -8; y <= height + 8; y += 16) {
      const wave = Math.sin(y * 0.05 + x * 0.2) * 5;
      if (y === -8) context.moveTo(x + wave, y);
      else context.lineTo(x + wave, y);
    }
    context.stroke();
  }
}

function drawLeaf(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = "#4fcf7a";
  context.fillRect(0, 0, width, height);
  for (let i = 0; i < 90; i += 1) {
    context.fillStyle = i % 2 === 0 ? "rgba(10, 86, 47, 0.28)" : "rgba(184, 255, 175, 0.24)";
    context.beginPath();
    context.ellipse((i * 31) % width, (i * 53) % height, 34, 8, i * 0.31, 0, Math.PI * 2);
    context.fill();
  }
}

function drawBlossom(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = "#f8a4dc";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "rgba(255,255,255,0.36)";
  for (let i = 0; i < 54; i += 1) {
    context.beginPath();
    context.arc((i * 41) % width, (i * 67) % height, 9 + (i % 4), 0, Math.PI * 2);
    context.fill();
  }
}

function drawFruit(context: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = context.createRadialGradient(width * 0.35, height * 0.28, 4, width * 0.5, height * 0.5, width * 0.8);
  gradient.addColorStop(0, "#ffd0a0");
  gradient.addColorStop(0.35, "#f76250");
  gradient.addColorStop(1, "#842a23");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.fillStyle = "rgba(255,255,255,0.22)";
  context.beginPath();
  context.ellipse(width * 0.32, height * 0.28, width * 0.18, height * 0.08, -0.6, 0, Math.PI * 2);
  context.fill();
}

function drawFallenLeaf(context: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#ffc257");
  gradient.addColorStop(0.5, "#ff7048");
  gradient.addColorStop(1, "#8f2c24");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(74, 25, 13, 0.32)";
  for (let y = 16; y < height; y += 18) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y + Math.sin(y) * 6);
    context.stroke();
  }
}

function drawGround(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = "#58c868";
  context.fillRect(0, 0, width, height);
  for (let i = 0; i < 220; i += 1) {
    context.fillStyle = i % 2 === 0 ? "rgba(19, 91, 47, 0.22)" : "rgba(220, 204, 121, 0.16)";
    context.fillRect((i * 47) % width, (i * 83) % height, 2 + (i % 6), 1 + (i % 4));
  }
}

function drawSnow(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = "#f4f2ea";
  context.fillRect(0, 0, width, height);
  for (let i = 0; i < 160; i += 1) {
    context.fillStyle = i % 2 === 0 ? "rgba(170, 194, 210, 0.2)" : "rgba(255, 255, 255, 0.54)";
    context.beginPath();
    context.arc((i * 61) % width, (i * 31) % height, 1 + (i % 3), 0, Math.PI * 2);
    context.fill();
  }
}
