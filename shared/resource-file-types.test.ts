import { describe, expect, it } from "vitest";
import {
  getResourceFileExtensions,
  normalizeResourceFileTypes,
} from "./resource-file-types";

describe("resource file types", () => {
  it("normalizes repeated query parameters", () => {
    expect(
      normalizeResourceFileTypes(["video", "document", "video", "invalid"]),
    ).toEqual(["video", "document"]);
  });

  it("combines extensions for all selected types", () => {
    const extensions = getResourceFileExtensions(["document", "music"]);
    expect(extensions).toContain(".docx");
    expect(extensions).toContain(".pdf");
    expect(extensions).toContain(".mp3");
    expect(extensions).toContain(".flac");
    expect(extensions).not.toContain(".mp4");
  });
});
