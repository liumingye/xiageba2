/**
 * 文件相关工具函数
 * 统一文件大小格式化、文件类型判断等逻辑，避免在多个组件中重复实现。
 */

const IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "avif"];
const AUDIO_EXTS = ["mp3", "flac", "wav", "aac", "ogg", "m4a", "ape", "alac"];
const VIDEO_EXTS = ["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "m4v"];

/** 文件描述接口：只需 mimeType 与 name 即可判断类型 */
export interface FileLike {
  mimeType?: string;
  name: string;
}

/**
 * 格式化文件大小
 * @param bytes 字节数
 * @returns 如 "1.5 MB"、"2048 B"
 */
export const formatSize = (bytes: number): string => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
};

/**
 * 格式化日期时间（YYYY-MM-DD HH:mm）
 * @param dateStr 可被 Date 解析的日期字符串
 * @returns 格式化后的字符串；非法输入返回原值
 */
export const formatDate = (dateStr: string): string => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
};

const extOf = (file: FileLike): string =>
  file.name.split(".").pop()?.toLowerCase() || "";

/** 判断是否为图片文件（按 mimeType 或扩展名） */
export const isImage = (file: FileLike): boolean =>
  !!file.mimeType?.startsWith("image/") || IMAGE_EXTS.includes(extOf(file));

/** 判断是否为音频文件（按 mimeType 或扩展名） */
export const isAudio = (file: FileLike): boolean =>
  !!file.mimeType?.startsWith("audio/") || AUDIO_EXTS.includes(extOf(file));

/** 判断是否为视频文件（按 mimeType 或扩展名） */
export const isVideo = (file: FileLike): boolean =>
  !!file.mimeType?.startsWith("video/") || VIDEO_EXTS.includes(extOf(file));
