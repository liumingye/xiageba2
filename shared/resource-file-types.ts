export const RESOURCE_FILE_TYPE_EXTENSIONS = {
  document: [
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".pdf",
    ".txt",
    ".md",
    ".go",
    ".html",
    ".css",
    ".js",
    ".json",
    ".xml",
    ".yml",
    ".yaml",
    ".csv",
    ".rtf",
    ".sql",
    ".log",
    ".ini",
    ".toml",
    ".ts",
    ".tsx",
    ".jsx",
    ".vue",
    ".java",
    ".c",
    ".cpp",
  ],
  image: [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".webp",
    ".ico",
    ".svg",
    ".avif",
    ".heic",
    ".tif",
    ".tiff",
    ".psd",
  ],
  software: [
    ".exe",
    ".msi",
    ".bat",
    ".sh",
    ".py",
    ".jar",
    ".ipa",
    ".apk",
    ".dmg",
    ".iso",
    ".pkg",
    ".deb",
    ".rpm",
    ".dll",
    ".torrent",
    ".appimage",
  ],
  video: [
    ".mp4",
    ".mkv",
    ".flv",
    ".rmvb",
    ".wmv",
    ".3gp",
    ".mov",
    ".m4v",
    ".swf",
    ".f4v",
    ".webm",
    ".ogg",
    ".ogv",
    ".m3u8",
    ".mpd",
    ".avi",
    ".mpg",
    ".mpeg",
    ".mpe",
    ".mpv",
    ".m2v",
    ".mxf",
    ".3g2",
    ".f4p",
    ".f4a",
    ".f4b",
    ".ts",
    ".mts",
    ".m2ts",
    ".asf",
    ".vob",
  ],
  music: [".mp3", ".aac", ".flac", ".wav", ".ape", ".m4a", ".wma", ".opus"],
  archive: [
    ".rar",
    ".zip",
    ".7z",
    ".tar",
    ".gz",
    ".tgz",
    ".bz2",
    ".xz",
    ".cab",
  ],
  ebook: [".epub", ".mobi", ".azw3"],
  subtitle: [".srt", ".ass", ".ssa", ".vtt"],
} as const;

export type ResourceFileType = keyof typeof RESOURCE_FILE_TYPE_EXTENSIONS;

export const RESOURCE_FILE_TYPE_OPTIONS: ReadonlyArray<{
  value: ResourceFileType;
  label: string;
}> = [
  { value: "document", label: "文档" },
  { value: "image", label: "图片" },
  { value: "software", label: "软件" },
  { value: "video", label: "视频" },
  { value: "music", label: "音乐" },
  { value: "archive", label: "压缩包" },
  { value: "ebook", label: "电子书" },
  { value: "subtitle", label: "字幕" },
];

export const normalizeResourceFileTypes = (
  value: unknown,
): ResourceFileType[] => {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [
    ...new Set(
      values
        .map(String)
        .filter((item): item is ResourceFileType =>
          Object.prototype.hasOwnProperty.call(
            RESOURCE_FILE_TYPE_EXTENSIONS,
            item,
          ),
        ),
    ),
  ];
};

export const getResourceFileExtensions = (
  types: ResourceFileType[],
): string[] => types.flatMap((type) => RESOURCE_FILE_TYPE_EXTENSIONS[type]);
