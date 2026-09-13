<template>
  <canvas ref="canvas" class="ambient-canvas" />
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";

const canvas = ref<HTMLCanvasElement | null>(null);

let ctx: CanvasRenderingContext2D | null = null;
let animationFrame = 0;
let resizeObserver: ResizeObserver | null = null;

let width = 0;
let height = 0;
let dpr = 1;

const blobs = [
  // ============================
  // 蓝色
  // ============================
  {
    x: 0.08,
    y: 0.68,
    radius: 0.65,
    color: [55, 95, 255],
    alpha: 0.26,
    speed: 0.002,
    moveX: 0.16,
    moveY: 0.09,
    pulse: 0.14,
    phase: 0.4,
  },

  // ============================
  // 青蓝
  // ============================
  {
    x: 0.22,
    y: 0.78,
    radius: 0.58,
    color: [35, 205, 255],
    alpha: 0.2,
    speed: 0.0024,
    moveX: 0.14,
    moveY: 0.08,
    pulse: 0.16,
    phase: 2.1,
  },

  // ============================
  // 紫色
  // ============================
  {
    x: 0.07,
    y: 0.83,
    radius: 0.82,
    color: [150, 35, 255],
    alpha: 0.82,
    speed: 0.0022,
    moveX: 0.15,
    moveY: 0.09,
    pulse: 0.14,
    phase: 0,
  },

  // ============================
  // 靛紫
  // ============================
  {
    x: 0.2,
    y: 0.72,
    radius: 0.72,
    color: [90, 40, 255],
    alpha: 0.36,
    speed: 0.0018,
    moveX: 0.16,
    moveY: 0.11,
    pulse: 0.12,
    phase: 3.2,
  },

  // ============================
  // 品红
  // ============================
  {
    x: 0.29,
    y: 0.84,
    radius: 0.76,
    color: [240, 25, 220],
    alpha: 0.64,
    speed: 0.0025,
    moveX: 0.17,
    moveY: 0.075,
    pulse: 0.16,
    phase: 1.8,
  },

  // ============================
  // 粉色
  // ============================
  {
    x: 0.43,
    y: 0.8,
    radius: 0.72,
    color: [255, 65, 175],
    alpha: 0.6,
    speed: 0.0021,
    moveX: 0.18,
    moveY: 0.09,
    pulse: 0.13,
    phase: 4.4,
  },

  // ============================
  // 玫红
  // ============================
  {
    x: 0.57,
    y: 0.76,
    radius: 0.66,
    color: [255, 55, 120],
    alpha: 0.48,
    speed: 0.0019,
    moveX: 0.15,
    moveY: 0.08,
    pulse: 0.14,
    phase: 2.8,
  },

  // ============================
  // 红色
  // ============================
  {
    x: 0.68,
    y: 0.72,
    radius: 0.7,
    color: [235, 55, 80],
    alpha: 0.38,
    speed: 0.0016,
    moveX: 0.14,
    moveY: 0.08,
    pulse: 0.12,
    phase: 1.2,
  },

  // ============================
  // 橙色
  // ============================
  {
    x: 0.72,
    y: 0.87,
    radius: 0.62,
    color: [255, 125, 55],
    alpha: 0.24,
    speed: 0.0018,
    moveX: 0.14,
    moveY: 0.07,
    pulse: 0.14,
    phase: 3.6,
  },

  // ============================
  // 金黄色
  // ============================
  {
    x: 0.6,
    y: 1.02,
    radius: 0.6,
    color: [255, 205, 80],
    alpha: 0.3,
    speed: 0.002,
    moveX: 0.16,
    moveY: 0.05,
    pulse: 0.15,
    phase: 0.8,
  },

  // ============================
  // 黄绿色
  // ============================
  {
    x: 0.48,
    y: 1.04,
    radius: 0.64,
    color: [210, 235, 105],
    alpha: 0.34,
    speed: 0.0023,
    moveX: 0.17,
    moveY: 0.06,
    pulse: 0.15,
    phase: 2.5,
  },

  // ============================
  // 绿色
  // ============================
  {
    x: 0.34,
    y: 1.01,
    radius: 0.52,
    color: [85, 210, 145],
    alpha: 0.16,
    speed: 0.0017,
    moveX: 0.14,
    moveY: 0.06,
    pulse: 0.12,
    phase: 4.8,
  },

  // ============================
  // 右侧暗红
  // ============================
  {
    x: 0.94,
    y: 0.72,
    radius: 0.72,
    color: [120, 45, 48],
    alpha: 0.32,
    speed: 0.0014,
    moveX: 0.1,
    moveY: 0.07,
    pulse: 0.1,
    phase: 3.4,
  },

  // ============================
  // 右侧紫红
  // ============================
  {
    x: 0.82,
    y: 0.55,
    radius: 0.58,
    color: [145, 40, 120],
    alpha: 0.16,
    speed: 0.0016,
    moveX: 0.11,
    moveY: 0.08,
    pulse: 0.12,
    phase: 5.2,
  },
];

function resize() {
  if (!canvas.value) {
    return;
  }

  const rect = canvas.value.getBoundingClientRect();

  width = rect.width;
  height = rect.height;

  dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.value.width = Math.round(width * dpr);

  canvas.value.height = Math.round(height * dpr);

  ctx = canvas.value.getContext("2d", {
    alpha: false,
  });

  if (!ctx) {
    return;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawBlob(time: number, blob: (typeof blobs)[number]) {
  if (!ctx) {
    return;
  }

  const t = time * blob.speed + blob.phase;

  /*
   * 第一层运动
   */
  const x1 = Math.sin(t) * blob.moveX;

  const y1 = Math.cos(t * 0.82) * blob.moveY;

  /*
   * 第二层运动
   * 让轨迹不要那么机械
   */
  const x2 = Math.sin(t * 0.47 + 1.8) * blob.moveX * 0.42;

  const y2 = Math.cos(t * 0.63 + 2.2) * blob.moveY * 0.55;

  const x = width * (blob.x + x1 + x2);

  const y = height * (blob.y + y1 + y2);

  /*
   * 光晕呼吸
   */
  const pulse = 1 + Math.sin(t * 1.35) * blob.pulse;

  const radius = Math.max(width, height) * blob.radius * pulse;

  /*
   * 当前透明度也变化
   */
  const alpha = blob.alpha * (0.88 + Math.sin(t * 1.15) * 0.12);

  const [r, g, b] = blob.color;

  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);

  gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);

  gradient.addColorStop(0.16, `rgba(${r}, ${g}, ${b}, ${alpha * 0.8})`);

  gradient.addColorStop(0.34, `rgba(${r}, ${g}, ${b}, ${alpha * 0.5})`);

  gradient.addColorStop(0.56, `rgba(${r}, ${g}, ${b}, ${alpha * 0.25})`);

  gradient.addColorStop(0.76, `rgba(${r}, ${g}, ${b}, ${alpha * 0.1})`);

  gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

  ctx.globalCompositeOperation = "screen";

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = "source-over";
}

function draw(time: number) {
  if (!ctx) {
    return;
  }

  /*
   * 黑色底
   */
  ctx.fillStyle = "#080808";

  ctx.fillRect(0, 0, width, height);

  /*
   * 彩色雾气
   */
  for (const blob of blobs) {
    drawBlob(time, blob);
  }

  /*
   * ==========================
   * 圆形顶部黑色遮罩
   * ==========================
   */

  // 遮罩中心：顶部偏中间
  const maskX = width * 0.56;
  const maskY = height * 0.08;

  // 控制遮罩范围
  const maskRadius = Math.max(width, height) * 0.68;

  const topMask = ctx.createRadialGradient(
    maskX,
    maskY,
    0,
    maskX,
    maskY,
    maskRadius,
  );

  /*
   * 中心几乎纯黑
   */
  topMask.addColorStop(0, "rgba(5, 5, 5, 0.98)");

  /*
   * 中间区域保持比较黑
   */
  topMask.addColorStop(0.3, "rgba(5, 5, 5, 0.75)");

  topMask.addColorStop(0.5, "rgba(5, 5, 5, 0.58)");

  /*
   * 开始快速淡出
   */
  topMask.addColorStop(0.68, "rgba(5, 5, 5, 0.42)");

  topMask.addColorStop(0.82, "rgba(5, 5, 5, 0.12)");

  topMask.addColorStop(1, "rgba(5, 5, 5, 0)");

  ctx.fillStyle = topMask;

  ctx.fillRect(0, 0, width, height);

  /*
   * ==========================
   * 左右暗角
   * ==========================
   */

  const sideGradient = ctx.createLinearGradient(0, 0, width, 0);

  sideGradient.addColorStop(0, "rgba(0,0,0,0.08)");

  sideGradient.addColorStop(0.16, "rgba(0,0,0,0)");

  sideGradient.addColorStop(0.75, "rgba(0,0,0,0)");

  sideGradient.addColorStop(1, "rgba(0,0,0,0.32)");

  ctx.fillStyle = sideGradient;

  ctx.fillRect(0, 0, width, height);

  /*
   * ==========================
   * 底部轻微遮罩
   * ==========================
   */

  const bottomGradient = ctx.createLinearGradient(0, height * 0.76, 0, height);

  bottomGradient.addColorStop(0, "rgba(0,0,0,0)");

  bottomGradient.addColorStop(1, "rgba(0,0,0,0.12)");

  ctx.fillStyle = bottomGradient;

  ctx.fillRect(0, height * 0.76, width, height * 0.24);

  animationFrame = requestAnimationFrame(draw);
}

onMounted(() => {
  if (!canvas.value) {
    return;
  }

  resize();

  resizeObserver = new ResizeObserver(() => {
    resize();
  });

  resizeObserver.observe(canvas.value);

  animationFrame = requestAnimationFrame(draw);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame);

  resizeObserver?.disconnect();
});
</script>

<style scoped>
.ambient-canvas {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
}
</style>
