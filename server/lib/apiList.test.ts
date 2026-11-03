import { describe, expect, it } from "vitest";
import { normalizeApiListBody } from "./apiList";

/**
 * apiList 请求体规范化测试
 *
 * 锁定 create/update 共用的字段规则：JSON 字段字符串化、
 * html_url / status 的宽松真假值、默认值回落。
 */

describe("normalizeApiListBody", () => {
  it("对象型 JSON 字段被字符串化", () => {
    const data = normalizeApiListBody({
      name: "线路A",
      url: "https://example.com",
      headers: { "X-Token": "abc" },
      fixed_params: { page: 1 },
      field_map: { title: "name" },
    });

    expect(JSON.parse(data.headers)).toEqual({ "X-Token": "abc" });
    expect(JSON.parse(data.fixed_params)).toEqual({ page: 1 });
    expect(JSON.parse(data.field_map)).toEqual({ title: "name" });
  });

  it("字符串型 JSON 字段原样保留（可再解析）", () => {
    const data = normalizeApiListBody({ headers: '{"a":1}' });
    expect(JSON.parse(data.headers)).toEqual({ a: 1 });
  });

  it("非法 JSON 回落空对象，不抛错", () => {
    const data = normalizeApiListBody({ headers: "{not-json" });
    expect(JSON.parse(data.headers)).toEqual({});
  });

  it("缺省值：type=api / method=GET / count=10 / weight=0 / status=1", () => {
    const data = normalizeApiListBody({});
    expect(data.type).toBe("api");
    expect(data.method).toBe("GET");
    expect(data.count).toBe(10);
    expect(data.weight).toBe(0);
    expect(data.status).toBe(1);
    expect(data.name).toBe("");
    expect(data.url).toBe("");
  });

  it("未知 type 回落 api，合法 type 保留", () => {
    expect(normalizeApiListBody({ type: "pansou" }).type).toBe("pansou");
    expect(normalizeApiListBody({ type: "html" }).type).toBe("html");
    expect(normalizeApiListBody({ type: "hacker" }).type).toBe("api");
  });

  it("method 统一大写", () => {
    expect(normalizeApiListBody({ method: "post" }).method).toBe("POST");
  });

  it("html_url 容忍数字 1 与字符串 '1'，其余为 0", () => {
    expect(normalizeApiListBody({ html_url: 1 }).html_url).toBe(1);
    expect(normalizeApiListBody({ html_url: "1" }).html_url).toBe(1);
    expect(normalizeApiListBody({ html_url: 0 }).html_url).toBe(0);
    expect(normalizeApiListBody({ html_url: true }).html_url).toBe(0);
  });

  it("status 容忍 '0'，其余为 1", () => {
    expect(normalizeApiListBody({ status: 0 }).status).toBe(0);
    expect(normalizeApiListBody({ status: "0" }).status).toBe(0);
    expect(normalizeApiListBody({ status: 1 }).status).toBe(1);
  });

  it("name/url 去除首尾空格，count 下限为 1", () => {
    const data = normalizeApiListBody({ name: "  x  ", url: "  u  ", count: -3 });
    expect(data.name).toBe("x");
    expect(data.url).toBe("u");
    expect(data.count).toBe(1);
  });
});
