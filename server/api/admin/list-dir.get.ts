import {
  getQuarkClient,
  getUCClient,
  getBaiduClient,
  getXunleiClient,
} from "#server/lib/pan-instance";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const type = query.type as string;

  if (!type || !["quark", "baidu", "uc", "xunlei"].includes(type)) {
    throw createError({ statusCode: 400, message: "type 参数不合法" });
  }

  interface DirItem {
    id: string;
    name: string;
  }

  let dirs: DirItem[] = [];

  try {
    if (type === "quark" || type === "uc") {
      const client =
        type === "quark" ? await getQuarkClient() : await getUCClient();
      const res = await client.fsApi.sort({
        pdir_fid: "0",
        _page: 1,
        _size: 100,
      });
      dirs = (res.list || [])
        .filter((f) => f.file_type === 0)
        .map((f) => ({ id: f.fid, name: f.file_name }));
    } else if (type === "baidu") {
      const client = await getBaiduClient();
      const res = await client.fsApi.list({
        dir: "/",
        page: 1,
        num: 100,
        order: "name",
        desc: 0,
      });
      dirs = (res.list || [])
        .filter((f) => f.isdir === 1)
        .map((f) => ({ id: f.path, name: f.server_filename }));
    } else if (type === "xunlei") {
      const client = await getXunleiClient();
      const res = await client.fsApi.listFiles({
        parentId: "",
        limit: 100,
      });
      dirs = (res.list || [])
        .filter((f) => f.is_dir)
        .map((f) => ({ id: f.id, name: f.name }));
    }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      message: `获取目录列表失败: ${error.message || "未知错误"}`,
    });
  }

  return { list: dirs };
});
