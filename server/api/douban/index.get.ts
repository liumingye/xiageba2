interface DoubanItem {
  id?: string;
  uri?: string;
  title?: string;
  card_subtitle?: string;
  episodes_info?: string;
  is_new?: boolean;
  pic?: { large?: string; normal?: string };
  rating?: { value?: number };
}

interface DoubanResponse {
  items?: DoubanItem[];
  total?: number;
  count?: number;
}

interface DoubanResult {
  vod_id: string;
  link: string;
  vod_name: string;
  search: boolean;
  vod_pic: string;
  type_id: string;
  type_name: string;
  vod_remarks: string;
  vod_year: string;
  vod_douban_score: string;
  vod_subtitle: string;
}

const CATEGORY_NAMES: Record<string, string> = {
  movie: "选电影",
  tv: "选剧集",
  show: "选综艺",
  movie_filter: "电影筛选",
  tv_filter: "电视剧筛选",
  show_filter: "综艺筛选",
};

const CLASSES = [
  { type_id: "movie", type_name: "选电影" },
  { type_id: "tv", type_name: "选剧集" },
  { type_id: "show", type_name: "选综艺" },
  { type_id: "movie_filter", type_name: "电影筛选" },
  { type_id: "tv_filter", type_name: "电视剧筛选" },
  { type_id: "show_filter", type_name: "综艺筛选" },
];

const FILTERS: Record<string, Array<{ key: string; name: string; init: string; value: { name: string; value: string }[] }>> = {
  movie: [
    {
      key: "category",
      name: "类型",
      init: "热门",
      value: [
        { name: "热门", value: "热门" },
        { name: "最新", value: "最新" },
        { name: "豆瓣高分", value: "豆瓣高分" },
        { name: "冷门佳片", value: "冷门佳片" },
      ],
    },
    {
      key: "type",
      name: "地区",
      init: "全部",
      value: [
        { name: "全部", value: "全部" },
        { name: "华语", value: "华语" },
        { name: "欧美", value: "欧美" },
        { name: "韩国", value: "韩国" },
        { name: "日本", value: "日本" },
      ],
    },
  ],
  tv: [
    {
      key: "type",
      name: "类型",
      init: "tv",
      value: [
        { name: "综合", value: "tv" },
        { name: "国产剧", value: "tv_domestic" },
        { name: "欧美剧", value: "tv_american" },
        { name: "日剧", value: "tv_japanese" },
        { name: "韩剧", value: "tv_korean" },
        { name: "动漫", value: "tv_animation" },
        { name: "纪录片", value: "tv_documentary" },
      ],
    },
  ],
  show: [
    {
      key: "type",
      name: "类型",
      init: "show",
      value: [
        { name: "综合", value: "show" },
        { name: "国内", value: "show_domestic" },
        { name: "国外", value: "show_foreign" },
      ],
    },
  ],
  movie_filter: [
    {
      key: "genre",
      name: "类型",
      init: "",
      value: [
        { name: "全部", value: "" },
        { name: "喜剧", value: "喜剧" },
        { name: "爱情", value: "爱情" },
        { name: "动作", value: "动作" },
        { name: "科幻", value: "科幻" },
        { name: "动画", value: "动画" },
        { name: "悬疑", value: "悬疑" },
        { name: "犯罪", value: "犯罪" },
        { name: "惊悚", value: "惊悚" },
        { name: "冒险", value: "冒险" },
        { name: "音乐", value: "音乐" },
        { name: "历史", value: "历史" },
        { name: "奇幻", value: "奇幻" },
        { name: "恐怖", value: "恐怖" },
        { name: "战争", value: "战争" },
        { name: "传记", value: "传记" },
        { name: "歌舞", value: "歌舞" },
        { name: "武侠", value: "武侠" },
        { name: "情色", value: "情色" },
        { name: "灾难", value: "灾难" },
        { name: "西部", value: "西部" },
        { name: "纪录片", value: "纪录片" },
        { name: "短片", value: "短片" },
      ],
    },
    {
      key: "region",
      name: "地区",
      init: "",
      value: [
        { name: "全部", value: "" },
        { name: "华语", value: "华语" },
        { name: "欧美", value: "欧美" },
        { name: "韩国", value: "韩国" },
        { name: "日本", value: "日本" },
        { name: "中国大陆", value: "中国大陆" },
        { name: "美国", value: "美国" },
        { name: "中国香港", value: "中国香港" },
        { name: "中国台湾", value: "中国台湾" },
        { name: "英国", value: "英国" },
        { name: "法国", value: "法国" },
        { name: "德国", value: "德国" },
        { name: "意大利", value: "意大利" },
        { name: "西班牙", value: "西班牙" },
        { name: "印度", value: "印度" },
        { name: "泰国", value: "泰国" },
        { name: "俄罗斯", value: "俄罗斯" },
        { name: "加拿大", value: "加拿大" },
        { name: "澳大利亚", value: "澳大利亚" },
        { name: "爱尔兰", value: "爱尔兰" },
        { name: "瑞典", value: "瑞典" },
        { name: "巴西", value: "巴西" },
        { name: "丹麦", value: "丹麦" },
      ],
    },
    {
      key: "year",
      name: "年代",
      init: "",
      value: [
        { name: "全部", value: "" },
        { name: "2026", value: "2026" },
        { name: "2025", value: "2025" },
        { name: "2024", value: "2024" },
        { name: "2023", value: "2023" },
        { name: "2022", value: "2022" },
        { name: "2021", value: "2021" },
        { name: "2020", value: "2020" },
        { name: "2019", value: "2019" },
        { name: "2020年代", value: "2020年代" },
        { name: "2010年代", value: "2010年代" },
        { name: "2000年代", value: "2000年代" },
        { name: "90年代", value: "90年代" },
        { name: "80年代", value: "80年代" },
        { name: "70年代", value: "70年代" },
        { name: "60年代", value: "60年代" },
        { name: "更早", value: "更早" },
      ],
    },
    {
      key: "sort",
      name: "排序",
      init: "U",
      value: [
        { name: "热度", value: "U" },
        { name: "评分", value: "S" },
        { name: "时间", value: "R" },
      ],
    },
  ],
  tv_filter: [
    {
      key: "genre",
      name: "类型",
      init: "",
      value: [
        { name: "全部", value: "" },
        { name: "喜剧", value: "喜剧" },
        { name: "爱情", value: "爱情" },
        { name: "悬疑", value: "悬疑" },
        { name: "动画", value: "动画" },
        { name: "武侠", value: "武侠" },
        { name: "古装", value: "古装" },
        { name: "家庭", value: "家庭" },
        { name: "犯罪", value: "犯罪" },
        { name: "科幻", value: "科幻" },
        { name: "恐怖", value: "恐怖" },
        { name: "历史", value: "历史" },
        { name: "战争", value: "战争" },
        { name: "动作", value: "动作" },
        { name: "冒险", value: "冒险" },
        { name: "传记", value: "传记" },
        { name: "剧情", value: "剧情" },
        { name: "奇幻", value: "奇幻" },
        { name: "惊悚", value: "惊悚" },
        { name: "灾难", value: "灾难" },
        { name: "歌舞", value: "歌舞" },
        { name: "音乐", value: "音乐" },
      ],
    },
    {
      key: "region",
      name: "地区",
      init: "",
      value: [
        { name: "全部", value: "" },
        { name: "华语", value: "华语" },
        { name: "欧美", value: "欧美" },
        { name: "国外", value: "国外" },
        { name: "韩国", value: "韩国" },
        { name: "日本", value: "日本" },
        { name: "中国大陆", value: "中国大陆" },
        { name: "中国香港", value: "中国香港" },
        { name: "美国", value: "美国" },
        { name: "英国", value: "英国" },
        { name: "泰国", value: "泰国" },
        { name: "中国台湾", value: "中国台湾" },
        { name: "意大利", value: "意大利" },
        { name: "法国", value: "法国" },
        { name: "德国", value: "德国" },
        { name: "西班牙", value: "西班牙" },
        { name: "俄罗斯", value: "俄罗斯" },
        { name: "瑞典", value: "瑞典" },
        { name: "巴西", value: "巴西" },
        { name: "丹麦", value: "丹麦" },
        { name: "印度", value: "印度" },
        { name: "加拿大", value: "加拿大" },
        { name: "爱尔兰", value: "爱尔兰" },
        { name: "澳大利亚", value: "澳大利亚" },
      ],
    },
    {
      key: "year",
      name: "年代",
      init: "",
      value: [
        { name: "全部", value: "" },
        { name: "2026", value: "2026" },
        { name: "2025", value: "2025" },
        { name: "2024", value: "2024" },
        { name: "2023", value: "2023" },
        { name: "2022", value: "2022" },
        { name: "2021", value: "2021" },
        { name: "2020", value: "2020" },
        { name: "2019", value: "2019" },
        { name: "2020年代", value: "2020年代" },
        { name: "2010年代", value: "2010年代" },
        { name: "2000年代", value: "2000年代" },
        { name: "90年代", value: "90年代" },
        { name: "80年代", value: "80年代" },
        { name: "70年代", value: "70年代" },
        { name: "60年代", value: "60年代" },
        { name: "更早", value: "更早" },
      ],
    },
    {
      key: "platform",
      name: "平台",
      init: "",
      value: [
        { name: "全部", value: "" },
        { name: "腾讯视频", value: "腾讯视频" },
        { name: "爱奇艺", value: "爱奇艺" },
        { name: "优酷", value: "优酷" },
        { name: "湖南卫视", value: "湖南卫视" },
        { name: "Netflix", value: "Netflix" },
        { name: "HBO", value: "HBO" },
        { name: "BBC", value: "BBC" },
        { name: "NHK", value: "NHK" },
        { name: "CBS", value: "CBS" },
        { name: "NBC", value: "NBC" },
        { name: "tvN", value: "tvN" },
      ],
    },
    {
      key: "sort",
      name: "排序",
      init: "U",
      value: [
        { name: "热度", value: "U" },
        { name: "评分", value: "S" },
        { name: "时间", value: "R" },
      ],
    },
  ],
  show_filter: [
    {
      key: "genre",
      name: "类型",
      init: "",
      value: [
        { name: "全部", value: "" },
        { name: "真人秀", value: "真人秀" },
        { name: "脱口秀", value: "脱口秀" },
        { name: "音乐", value: "音乐" },
        { name: "歌舞", value: "歌舞" },
      ],
    },
    {
      key: "region",
      name: "地区",
      init: "",
      value: [
        { name: "全部", value: "" },
        { name: "华语", value: "华语" },
        { name: "欧美", value: "欧美" },
        { name: "国外", value: "国外" },
        { name: "韩国", value: "韩国" },
        { name: "日本", value: "日本" },
        { name: "中国大陆", value: "中国大陆" },
        { name: "中国香港", value: "中国香港" },
        { name: "美国", value: "美国" },
        { name: "英国", value: "英国" },
        { name: "泰国", value: "泰国" },
        { name: "中国台湾", value: "中国台湾" },
        { name: "意大利", value: "意大利" },
        { name: "法国", value: "法国" },
        { name: "德国", value: "德国" },
        { name: "西班牙", value: "西班牙" },
        { name: "俄罗斯", value: "俄罗斯" },
        { name: "瑞典", value: "瑞典" },
        { name: "巴西", value: "巴西" },
        { name: "丹麦", value: "丹麦" },
        { name: "印度", value: "印度" },
        { name: "加拿大", value: "加拿大" },
        { name: "爱尔兰", value: "爱尔兰" },
        { name: "澳大利亚", value: "澳大利亚" },
      ],
    },
    {
      key: "year",
      name: "年代",
      init: "",
      value: [
        { name: "全部", value: "" },
        { name: "2026", value: "2026" },
        { name: "2025", value: "2025" },
        { name: "2024", value: "2024" },
        { name: "2023", value: "2023" },
        { name: "2022", value: "2022" },
        { name: "2021", value: "2021" },
        { name: "2020", value: "2020" },
        { name: "2019", value: "2019" },
        { name: "2020年代", value: "2020年代" },
        { name: "2010年代", value: "2010年代" },
        { name: "2000年代", value: "2000年代" },
        { name: "90年代", value: "90年代" },
        { name: "80年代", value: "80年代" },
        { name: "70年代", value: "70年代" },
        { name: "60年代", value: "60年代" },
        { name: "更早", value: "更早" },
      ],
    },
    {
      key: "platform",
      name: "平台",
      init: "",
      value: [
        { name: "全部", value: "" },
        { name: "腾讯视频", value: "腾讯视频" },
        { name: "爱奇艺", value: "爱奇艺" },
        { name: "优酷", value: "优酷" },
        { name: "湖南卫视", value: "湖南卫视" },
        { name: "Netflix", value: "Netflix" },
        { name: "HBO", value: "HBO" },
        { name: "BBC", value: "BBC" },
        { name: "NHK", value: "NHK" },
        { name: "CBS", value: "CBS" },
        { name: "NBC", value: "NBC" },
        { name: "tvN", value: "tvN" },
      ],
    },
    {
      key: "sort",
      name: "排序",
      init: "U",
      value: [
        { name: "热度", value: "U" },
        { name: "评分", value: "S" },
        { name: "时间", value: "R" },
      ],
    },
  ],
};

function buildDoubanSubjectLink(vodId: string): string {
  return `https://movie.douban.com/subject/${vodId}`;
}

function mapItem(item: DoubanItem, categoryId: string): DoubanResult {
  const cardSubtitle = item.card_subtitle || "";
  const yearMatch = cardSubtitle.match(/^(\d{4})/);
  const vod_year = yearMatch ? yearMatch[1] : "";

  let vod_remarks = "";
  if (item.episodes_info && item.episodes_info.trim()) {
    vod_remarks = item.episodes_info.trim();
  } else if (item.is_new) {
    vod_remarks = categoryId === "movie" ? "新片" : "新剧";
  }

  const vod_pic = item.pic?.large || item.pic?.normal || "";

  const parts = cardSubtitle.split(" / ");
  const vod_subtitle = parts.length > 1 ? parts.slice(1).join(" / ") : cardSubtitle;

  return {
    vod_id: item.id || `douban_${item.uri}`,
    link: buildDoubanSubjectLink(item.id || `douban_${item.uri}`),
    vod_name: item.title || "",
    search: true,
    vod_pic,
    type_id: categoryId,
    type_name: CATEGORY_NAMES[categoryId] || "未知分类",
    vod_remarks,
    vod_year,
    vod_douban_score: item.rating?.value ? item.rating.value.toString() : "",
    vod_subtitle,
  };
}

function buildCategoryUrl(categoryId: string, page: number, filters: Record<string, string>): string {
  const limit = 20;
  const start = (page - 1) * limit;

  if (categoryId === "movie") {
    const category = filters.category || "热门";
    const type = filters.type || "全部";
    return `https://m.douban.com/rexxar/api/v2/subject/recent_hot/movie?start=${start}&limit=${limit}&category=${encodeURIComponent(category)}&type=${encodeURIComponent(type)}`;
  }

  if (categoryId === "tv" || categoryId === "show") {
    const category = categoryId;
    const type = filters.type || (categoryId === "tv" ? "tv_domestic" : "show");
    return `https://m.douban.com/rexxar/api/v2/subject/recent_hot/tv?start=${start}&limit=${limit}&category=${encodeURIComponent(category)}&type=${encodeURIComponent(type)}`;
  }

  if (categoryId === "movie_filter") {
    const genre = filters.genre || "";
    const region = filters.region || "";
    const year = filters.year || "";
    const sort = filters.sort || "U";
    const selectedCategories: Record<string, string> = {};
    if (genre) selectedCategories["类型"] = genre;
    if (region) selectedCategories["地区"] = region;
    const tags = [genre, region, year].filter(Boolean).join(",");
    return `https://m.douban.com/rexxar/api/v2/movie/recommend?refresh=0&start=${start}&count=${limit}&selected_categories=${encodeURIComponent(JSON.stringify(selectedCategories))}&uncollect=false&score_range=0,10&tags=${encodeURIComponent(tags)}&sort=${sort}`;
  }

  if (categoryId === "tv_filter" || categoryId === "show_filter") {
    const genre = filters.genre || "";
    const region = filters.region || "";
    const year = filters.year || "";
    const platform = filters.platform || "";
    const sort = filters.sort || "U";
    const selectedCategories: Record<string, string> = { 形式: categoryId === "tv_filter" ? "电视剧" : "综艺" };
    if (genre) selectedCategories["类型"] = genre;
    if (region) selectedCategories["地区"] = region;
    const tags = [genre, region, year, platform].filter(Boolean).join(",");
    return `https://m.douban.com/rexxar/api/v2/tv/recommend?refresh=0&start=${start}&count=${limit}&selected_categories=${encodeURIComponent(JSON.stringify(selectedCategories))}&uncollect=false&score_range=0,10&tags=${encodeURIComponent(tags)}&sort=${sort}`;
  }

  throw createError({ statusCode: 400, message: `未知的分类ID: ${categoryId}` });
}

function getReferer(categoryId: string): string {
  if (categoryId === "tv" || categoryId === "show" || categoryId.startsWith("tv_") || categoryId.startsWith("show_")) {
    return "https://movie.douban.com/tv/";
  }
  return "https://movie.douban.com/explore";
}

async function fetchCategory(categoryId: string, page: number, filters: Record<string, string>) {
  const url = buildCategoryUrl(categoryId, page, filters);
  const referer = getReferer(categoryId);

  const res = await fetch(url, {
    headers: {
      Accept: "*/*",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      referer,
    },
  });

  if (!res.ok) {
    throw createError({ statusCode: 502, message: `豆瓣接口请求失败: ${res.status}` });
  }

  const data = (await res.json()) as DoubanResponse;
  if (!data.items || !Array.isArray(data.items)) {
    throw createError({ statusCode: 502, message: "豆瓣接口返回数据格式错误" });
  }

  const list = data.items.map((item) => mapItem(item, categoryId));
  const total = data.total || data.count || list.length;
  const limit = 20;

  return {
    page,
    pagecount: Math.ceil(total / limit),
    total,
    list,
  };
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const categoryId = (query.categoryId as string) || "";
  const page = Math.max(1, parseInt((query.page as string) || "1", 10));
  let filters: Record<string, string> = {};

  if (query.filters) {
    try {
      filters = typeof query.filters === "string" ? JSON.parse(query.filters) : (query.filters as Record<string, string>);
    } catch {
      throw createError({ statusCode: 400, message: "filters 参数格式错误" });
    }
  }

  if (!categoryId) {
    return {
      class: CLASSES,
      filters: FILTERS,
      list: [],
      page: 1,
      pagecount: 0,
      total: 0,
    };
  }

  return fetchCategory(categoryId, page, filters);
});
