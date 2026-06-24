export default defineEventHandler(async (event) => {
  const submissionId = getRouterParam(event, "sid");

  if (!submissionId) {
    throw createError({ statusCode: 400, message: "缺少 submission ID" });
  }

  const pancheckApi = process.env.PANCHECK_API;
  const pancheckPassword = process.env.PANCHECK_API_PASSWORD;

  if (!pancheckApi) {
    throw createError({
      statusCode: 500,
      message: "网盘检测 API 未配置",
    });
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (pancheckPassword) {
      headers["x-admin-password"] = pancheckPassword;
    }

    const response = await fetch(
      `${pancheckApi.replace(/\/$/, "")}/api/v1/links/submissions/${submissionId}`,
      {
        method: "GET",
        headers,
      },
    );

    if (!response.ok) {
      throw new Error(`检测服务返回 ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      message: `查询检测状态失败: ${error.message || "未知错误"}`,
    });
  }
});
