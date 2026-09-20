// 文件工具函数测试：覆盖 formatSize / formatDate / isImage / isAudio / isVideo
// 对应源码：app/utils/file.ts

import { describe, expect, it } from "vitest";
import {
  formatSize,
  formatDate,
  isImage,
  isAudio,
  isVideo,
  type FileLike,
} from "./file";

describe("formatSize", () => {
  it("0 / undefined / null 返回 \"0 B\"", () => {
    expect(formatSize(0)).toBe("0 B");
    // @ts-expect-error 测试非法输入（边界）
    expect(formatSize(undefined)).toBe("0 B");
    // @ts-expect-error 测试非法输入（边界）
    expect(formatSize(null)).toBe("0 B");
  });

  it("小于 1024 字节直接显示 B（整数无小数）", () => {
    expect(formatSize(1)).toBe("1 B");
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(1023)).toBe("1023 B");
  });

  it("KB 单位显示一位小数", () => {
    expect(formatSize(1024)).toBe("1.0 KB");
    expect(formatSize(1536)).toBe("1.5 KB");
  });

  it("MB 单位显示一位小数", () => {
    expect(formatSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatSize(1024 * 1024 * 1.5)).toBe("1.5 MB");
  });

  it("GB 单位显示一位小数", () => {
    expect(formatSize(1024 ** 3)).toBe("1.0 GB");
    expect(formatSize(1024 ** 3 * 10)).toBe("10.0 GB");
  });
});

describe("formatDate", () => {
  it("空字符串返回空串", () => {
    expect(formatDate("")).toBe("");
  });

  it("ISO 字符串格式化为 YYYY-MM-DD HH:mm", () => {
    const out = formatDate("2026-09-20T15:30:00Z");
    // 时区会影响具体小时数，但格式固定
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it("非日期字符串原样返回", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });

  it("null 当作空处理", () => {
    // @ts-expect-error 测试非法输入
    expect(formatDate(null)).toBe("");
  });
});

describe("isImage", () => {
  it("按 mimeType:image/* 判定为图片", () => {
    expect(isImage({ name: "file", mimeType: "image/png" })).toBe(true);
    expect(isImage({ name: "file", mimeType: "image/jpeg" })).toBe(true);
  });

  it("按扩展名判定图片", () => {
    expect(isImage({ name: "cover.jpg" })).toBe(true);
    expect(isImage({ name: "cover.JPEG" })).toBe(true);
    expect(isImage({ name: "cover.PNG" })).toBe(true);
    expect(isImage({ name: "pic.webp" })).toBe(true);
    expect(isImage({ name: "icon.svg" })).toBe(true);
    expect(isImage({ name: "anim.gif" })).toBe(true);
  });

  it("非图片返回 false", () => {
    expect(isImage({ name: "song.mp3" })).toBe(false);
    expect(isImage({ name: "video.mp4" })).toBe(false);
    expect(isImage({ name: "doc.pdf" })).toBe(false);
  });

  it("无扩展名 + 无 mimeType 返回 false", () => {
    expect(isImage({ name: "noext" })).toBe(false);
  });
});

describe("isAudio", () => {
  it("按 mimeType:audio/* 判定为音频", () => {
    expect(isAudio({ name: "x", mimeType: "audio/mpeg" })).toBe(true);
  });

  it("按扩展名判定音频", () => {
    expect(isAudio({ name: "song.mp3" })).toBe(true);
    expect(isAudio({ name: "lossless.FLAC" })).toBe(true);
    expect(isAudio({ name: "track.wav" })).toBe(true);
    expect(isAudio({ name: "track.m4a" })).toBe(true);
    expect(isAudio({ name: "track.ogg" })).toBe(true);
    expect(isAudio({ name: "track.ape" })).toBe(true);
  });

  it("非音频返回 false", () => {
    expect(isAudio({ name: "img.png" })).toBe(false);
    expect(isAudio({ name: "video.mp4" })).toBe(false);
  });
});

describe("isVideo", () => {
  it("按 mimeType:video/* 判定为视频", () => {
    expect(isVideo({ name: "x", mimeType: "video/mp4" })).toBe(true);
  });

  it("按扩展名判定视频", () => {
    expect(isVideo({ name: "movie.mp4" })).toBe(true);
    expect(isVideo({ name: "movie.MKV" })).toBe(true);
    expect(isVideo({ name: "clip.webm" })).toBe(true);
    expect(isVideo({ name: "clip.mov" })).toBe(true);
    expect(isVideo({ name: "clip.avi" })).toBe(true);
  });

  it("非视频返回 false", () => {
    expect(isVideo({ name: "img.png" })).toBe(false);
    expect(isVideo({ name: "song.mp3" })).toBe(false);
  });
});

describe("FileLike 互斥性", () => {
  it("同一文件不会被同时识别为多种类型（除 mimeType 同时声明外）", () => {
    const file: FileLike = { name: "song.mp3" };
    expect(isAudio(file)).toBe(true);
    expect(isImage(file)).toBe(false);
    expect(isVideo(file)).toBe(false);
  });
});
