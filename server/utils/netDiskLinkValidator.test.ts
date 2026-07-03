import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  extractNetDiskShareId,
  validateNetDiskLink,
  validateNetDiskLinks,
} from "./netDiskLinkValidator";

describe("extractNetDiskShareId", () => {
  const cases: { url: string; expected: { type: string; shareId: string } }[] =
    [
      {
        url: "https://drive.uc.cn/s/e1ebe95d144c4?public=1",
        expected: { type: "uc", shareId: "e1ebe95d144c4" },
      },
      {
        url: "https://www.aliyundrive.com/s/hz1HHxhahsE",
        expected: { type: "aliyun", shareId: "hz1HHxhahsE" },
      },
      {
        url: "https://www.alipan.com/s/QbaHJ71QjV1",
        expected: { type: "aliyun", shareId: "QbaHJ71QjV1" },
      },
      {
        url: "https://pan.quark.cn/s/9803af406f13",
        expected: { type: "quark", shareId: "9803af406f13" },
      },
      {
        url: "https://115cdn.com/s/swh88n13z72?password=r9b2#",
        expected: { type: "115", shareId: "swh88n13z72" },
      },
      {
        url: "https://www.123pan.com/s/i4uaTd-WHn0",
        expected: { type: "123pan", shareId: "i4uaTd-WHn0" },
      },
      {
        url: "https://cloud.189.cn/t/viy2quQzMBne",
        expected: { type: "tianyi", shareId: "viy2quQzMBne" },
      },
      {
        url: "https://cloud.189.cn/web/share?code=UfUjiiFRbymq",
        expected: { type: "tianyi", shareId: "UfUjiiFRbymq" },
      },
      {
        url: "https://pan.xunlei.com/s/VFe4X9Y8Zkm",
        expected: { type: "xunlei", shareId: "VFe4X9Y8Zkm" },
      },
      {
        url: "https://pan.baidu.com/s/1rIcc6X7D3rVzNSqivsRejw?pwd=0w0j",
        expected: { type: "baidu", shareId: "1rIcc6X7D3rVzNSqivsRejw" },
      },
      {
        url: "https://yun.baidu.com/s/1abc123",
        expected: { type: "baidu", shareId: "1abc123" },
      },
    ];

  it.each(cases)("extracts $expected.type from $url", ({ url, expected }) => {
    expect(extractNetDiskShareId(url)).toEqual(expected);
  });

  it("returns null for unsupported url", () => {
    expect(extractNetDiskShareId("https://example.com/file")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractNetDiskShareId("")).toBeNull();
  });
});

describe("validateNetDiskLink", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const mockResponse = (
    body: string | object,
    status = 200,
  ): ReturnType<typeof vi.fn> => {
    const text = async () =>
      typeof body === "string" ? body : JSON.stringify(body);
    const json = async () => body;
    return fetchMock.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      text,
      json,
    });
  };

  it("returns false for unsupported url", async () => {
    const result = await validateNetDiskLink("https://example.com/file");
    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns true for valid UC link", async () => {
    mockResponse("<html><body>文件</body></html>");
    const result = await validateNetDiskLink(
      "https://drive.uc.cn/s/e1ebe95d144c4",
    );
    expect(result).toBe(true);
  });

  it("returns false for invalid UC link", async () => {
    mockResponse("<html><body>链接已失效</body></html>");
    const result = await validateNetDiskLink(
      "https://drive.uc.cn/s/m7and23e132a1",
    );
    expect(result).toBe(false);
  });

  it("returns true for valid aliyun link", async () => {
    mockResponse({ file_infos: [{ file_id: "1" }] });
    const result = await validateNetDiskLink(
      "https://www.alipan.com/s/QbaHJ71QjV1",
    );
    expect(result).toBe(true);
  });

  it("returns false for not found aliyun link", async () => {
    mockResponse({ code: "NotFound.ShareLink" });
    const result = await validateNetDiskLink(
      "https://www.aliyundrive.com/s/p51zbVtgmy",
    );
    expect(result).toBe(false);
  });

  it("returns true for password protected aliyun link", async () => {
    mockResponse({ has_pwd: true });
    const result = await validateNetDiskLink(
      "https://www.alipan.com/s/GMrv1QCZhNB",
    );
    expect(result).toBe(true);
  });

  it("returns true for valid 115 link", async () => {
    mockResponse({ state: true });
    const result = await validateNetDiskLink("https://115.com/s/swhsaua36a1");
    expect(result).toBe(true);
  });

  it("returns true for password protected 115 link", async () => {
    mockResponse({ error: "请输入访问码" });
    const result = await validateNetDiskLink("https://115.com/s/swhsaua36a1");
    expect(result).toBe(true);
  });

  it("returns false for invalid 115 link", async () => {
    mockResponse({ state: false });
    const result = await validateNetDiskLink("https://115.com/s/sw313r03zx1");
    expect(result).toBe(false);
  });

  it("returns true for valid quark link", async () => {
    mockResponse({ message: "ok", data: { stoken: "token123" } });
    mockResponse({ data: { share: { status: 1 } } });
    const result = await validateNetDiskLink(
      "https://pan.quark.cn/s/9803af406f13",
    );
    expect(result).toBe(true);
  });

  it("returns true for password protected quark link", async () => {
    mockResponse({ message: "需要提取码" });
    const result = await validateNetDiskLink(
      "https://pan.quark.cn/s/f161a5364657",
    );
    expect(result).toBe(true);
  });

  it("returns false for invalid quark link", async () => {
    mockResponse({ message: "ok", data: { stoken: "token123" } });
    mockResponse({ status: 200, data: { share: { status: 0 } } });
    const result = await validateNetDiskLink(
      "https://pan.quark.cn/s/9803af406f15",
    );
    expect(result).toBe(false);
  });

  it("returns true for valid 123pan link", async () => {
    mockResponse({ code: 0 });
    const result = await validateNetDiskLink(
      "https://www.123pan.com/s/i4uaTd-WHn0",
    );
    expect(result).toBe(true);
  });

  it("returns false for non-existent 123pan link", async () => {
    mockResponse("分享页面不存在");
    const result = await validateNetDiskLink(
      "https://www.123pan.com/s/A6cA-AKH11",
    );
    expect(result).toBe(false);
  });

  it("returns true for valid tianyi link", async () => {
    mockResponse('{"shareInfo":{}}');
    const result = await validateNetDiskLink(
      "https://cloud.189.cn/t/viy2quQzMBne",
    );
    expect(result).toBe(true);
  });

  it("returns false for expired tianyi link", async () => {
    mockResponse("ShareExpiredError");
    const result = await validateNetDiskLink(
      "https://cloud.189.cn/t/vENFvuVNbyqa",
    );
    expect(result).toBe(false);
  });

  it("returns true for password protected tianyi link", async () => {
    mockResponse("needAccessCode");
    const result = await validateNetDiskLink("https://cloud.189.cn/t/somecode");
    expect(result).toBe(true);
  });

  it("returns true for valid xunlei link", async () => {
    mockResponse({ captcha_token: "token123" });
    mockResponse('{"share_id":"xxx"}');
    const result = await validateNetDiskLink(
      "https://pan.xunlei.com/s/VFe4X9Y8Zkm",
    );
    expect(result).toBe(true);
  });

  it("returns false for invalid xunlei link", async () => {
    mockResponse({ captcha_token: "token123" });
    mockResponse("NOT_FOUND");
    const result = await validateNetDiskLink(
      "https://pan.xunlei.com/s/notexist",
    );
    expect(result).toBe(false);
  });

  it("returns false when xunlei token is missing", async () => {
    mockResponse({ captcha_token: "" });
    const result = await validateNetDiskLink(
      "https://pan.xunlei.com/s/VFe4X9Y8Zkm",
    );
    expect(result).toBe(false);
  });

  it("returns true for valid baidu link", async () => {
    mockResponse("<html><body>提取文件</body></html>");
    const result = await validateNetDiskLink(
      "https://pan.baidu.com/s/1rIcc6X7D3rVzNSqivsRejw",
    );
    expect(result).toBe(true);
  });

  it("returns true for password protected baidu link", async () => {
    mockResponse("<html><body>请输入提取码</body></html>");
    const result = await validateNetDiskLink(
      "https://pan.baidu.com/s/1TMhfQ5yNnlPPSGbw4RQ-LA",
    );
    expect(result).toBe(true);
  });

  it("returns false for canceled baidu link", async () => {
    mockResponse("<html><body>分享的文件已经被取消</body></html>");
    const result = await validateNetDiskLink(
      "https://pan.baidu.com/s/1R_itrvmA0ZyMMaHybg7G2Q",
    );
    expect(result).toBe(false);
  });

  it("returns false when fetch throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network error"));
    const result = await validateNetDiskLink(
      "https://drive.uc.cn/s/e1ebe95d144c4",
    );
    expect(result).toBe(false);
  });
});

describe("validateNetDiskLinks", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("validates multiple links in parallel", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "<html><body>文件</body></html>",
        json: async () => "<html><body>文件</body></html>",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "<html><body>分享已过期</body></html>",
        json: async () => "<html><body>分享已过期</body></html>",
      });

    const results = await validateNetDiskLinks([
      "https://drive.uc.cn/s/valid",
      "https://drive.uc.cn/s/expired",
    ]);

    expect(results).toEqual([
      { url: "https://drive.uc.cn/s/valid", valid: true },
      { url: "https://drive.uc.cn/s/expired", valid: false },
    ]);
  });

  it("returns false for unsupported links", async () => {
    const results = await validateNetDiskLinks([
      "https://example.com/file",
      "",
    ]);

    expect(results).toEqual([
      { url: "https://example.com/file", valid: false },
      { url: "", valid: false },
    ]);
  });
});
