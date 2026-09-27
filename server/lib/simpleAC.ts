import { getConfigValue } from "#server/lib/configCache";

// SimpleAC 多模式匹配自动机
export interface TrieNode {
  children: Map<string, TrieNode>;
  end?: boolean;
  fail?: TrieNode;
}

export class SimpleAC {
  root: TrieNode = { children: new Map() };
  // 原始关键词集合，用于完整匹配（不受 fail 指针 end 传播影响）
  private fullMatchSet: Set<string>;

  constructor(keywords: string[]) {
    this.fullMatchSet = new Set(keywords.filter((k) => k.length > 0));
    this.buildTrie(keywords);
    this.buildFail();
  }

  private buildTrie(words: string[]) {
    for (const w of words) {
      if (!w) continue;
      let node = this.root;
      for (const ch of w) {
        if (!node.children.has(ch)) {
          node.children.set(ch, { children: new Map() });
        }
        node = node.children.get(ch)!;
      }
      node.end = true;
    }
  }

  private buildFail() {
    const queue: TrieNode[] = [];
    this.root.fail = undefined;
    for (const child of this.root.children.values()) {
      child.fail = this.root;
      queue.push(child);
    }
    while (queue.length) {
      const curr = queue.shift()!;
      for (const [ch, child] of curr.children) {
        let f = curr.fail;
        while (f && !f.children.has(ch)) f = f.fail;
        child.fail = f ? f.children.get(ch)! : this.root;
        if (child.fail?.end) child.end = true;
        queue.push(child);
      }
    }
  }

  hasMatch(text: string): boolean {
    let node = this.root;
    for (const ch of text) {
      while (node && !node.children.has(ch)) node = node.fail!;
      node = node ? node.children.get(ch)! : this.root;
      if (node.end) return true;
    }
    return false;
  }

  /**
   * 完整匹配：text 整体等于某个关键词时返回 true
   * 用于搜索关键词屏蔽（避免子串误伤，如"激情"作为电影名的一部分）
   */
  hasFullMatch(text: string): boolean {
    return this.fullMatchSet.has(text);
  }
}

// 实例
export let automaton_websearch_filter_keywords: SimpleAC | null = null;
// 配置屏蔽词列表（配置词），供前端展示
export let websearch_filter_keywords_list: string[] = [];
export const initAutomaton_websearch_filter_keywords = async () => {
  let filterKeywordsStr = await getConfigValue("websearch_filter_keywords");
  const keywords = filterKeywordsStr
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 0);

  const defaultKeywords = [
    "爱液",
    "按摩棒",
    "拔出来",
    "爆草",
    "包二奶",
    "暴干",
    "暴奸",
    "暴乳",
    "爆乳",
    "暴淫",
    "被操",
    "被插",
    "被干",
    "逼奸",
    "仓井空",
    "插暴",
    "操逼",
    "操黑",
    "操烂",
    "肏你",
    "肏死",
    "操死",
    "操我",
    "厕奴",
    "插比",
    "插b",
    "插逼",
    "插进",
    "插你",
    "插我",
    "插阴",
    "潮吹",
    "潮喷",
    "成人电影",
    "成人论坛",
    "成人色情",
    "成人网站",
    "成人文学",
    "艳情小说",
    "成人游戏",
    "吃精",
    "抽插",
    "春药",
    "大波",
    "大力抽送",
    "大乳",
    "荡妇",
    "荡女",
    "盗撮",
    "发浪",
    "放尿",
    "肥逼",
    "粉穴",
    "风月大陆",
    "干死你",
    "干穴",
    "肛交",
    "肛门",
    "龟头",
    "裹本",
    "国产av",
    "好嫩",
    "豪乳",
    "黑逼",
    "后庭",
    "后穴",
    "虎骑",
    "换妻俱乐部",
    "黄片",
    "几吧",
    "鸡吧",
    "鸡巴",
    "鸡奸",
    "妓女",
    "奸情",
    "叫床",
    "脚交",
    "精液",
    "就去日",
    "巨屌",
    "菊花洞",
    "巨奶",
    "巨乳",
    "菊穴",
    "开苞",
    "口爆",
    "口活",
    "口交",
    "口射",
    "口淫",
    "裤袜",
    "狂操",
    "狂插",
    "浪逼",
    "浪妇",
    "浪叫",
    "浪女",
    "狼友",
    "聊性",
    "凌辱",
    "漏乳",
    "露b",
    "乱交",
    "乱伦",
    "轮暴",
    "轮操",
    "轮奸",
    "裸陪",
    "买春",
    "美逼",
    "美少妇",
    "美乳",
    "美腿",
    "美穴",
    "美幼",
    "秘唇",
    "迷奸",
    "密穴",
    "蜜穴",
    "蜜液",
    "摸奶",
    "摸胸",
    "母奸",
    "奈美",
    "奶子",
    "男奴",
    "内射",
    "嫩逼",
    "嫩女",
    "嫩穴",
    "捏弄",
    "女优",
    "炮友",
    "砲友",
    "喷精",
    "屁眼",
    "前凸后翘",
    "强jian",
    "强暴",
    "强奸处女",
    "情趣用品",
    "情色",
    "拳交",
    "全裸",
    "群交",
    "人妻",
    "人兽",
    "日逼",
    "日烂",
    "肉棒",
    "肉逼",
    "肉唇",
    "肉洞",
    "肉缝",
    "肉棍",
    "肉茎",
    "肉具",
    "揉乳",
    "肉穴",
    "肉欲",
    "乳爆",
    "乳房",
    "乳沟",
    "乳交",
    "乳头",
    "骚逼",
    "骚比",
    "骚女",
    "骚水",
    "骚穴",
    "色逼",
    "色界",
    "色猫",
    "色盟",
    "色情网站",
    "色区",
    "色色",
    "色诱",
    "色欲",
    "色b",
    "少年阿宾",
    "射爽",
    "射颜",
    "食精",
    "释欲",
    "兽奸",
    "兽交",
    "手淫",
    "兽欲",
    "熟妇",
    "熟母",
    "熟女",
    "爽片",
    "双臀",
    "死逼",
    "丝袜",
    "丝诱",
    "松岛枫",
    "酥痒",
    "汤加丽",
    "套弄",
    "体奸",
    "体位",
    "舔脚",
    "舔阴",
    "调教",
    "偷欢",
    "推油",
    "脱内裤",
    "文做",
    "舞女",
    "无修正",
    "吸精",
    "夏川纯",
    "相奸",
    "小逼",
    "校鸡",
    "小穴",
    "小xue",
    "性感妖娆",
    "性感诱惑",
    "性虎",
    "性饥渴",
    "性技巧",
    "性交",
    "性奴",
    "性虐",
    "性息",
    "性欲",
    "胸推",
    "穴口",
    "穴图",
    "亚情",
    "颜射",
    "阳具",
    "杨思敏",
    "要射了",
    "夜勤病栋",
    "一本道",
    "一夜欢",
    "一夜情",
    "一ye情",
    "阴部",
    "淫虫",
    "阴唇",
    "淫荡",
    "阴道",
    "淫电影",
    "阴阜",
    "淫妇",
    "淫河",
    "阴核",
    "阴户",
    "淫贱",
    "淫叫",
    "淫教师",
    "阴茎",
    "阴精",
    "淫浪",
    "淫媚",
    "淫糜",
    "淫魔",
    "淫母",
    "淫女",
    "淫虐",
    "淫妻",
    "淫情",
    "淫色",
    "淫声浪语",
    "淫兽学园",
    "淫书",
    "淫术炼金士",
    "淫水",
    "淫娃",
    "淫威",
    "淫亵",
    "淫样",
    "淫液",
    "淫照",
    "阴b",
    "应召",
    "幼交",
    "欲火",
    "欲女",
    "玉乳",
    "玉穴",
    "援交",
    "原味内衣",
    "援助交际",
    "招鸡",
    "招妓",
    "抓胸",
    "自慰",
    "作爱",
    "a片",
    "gay片",
    "g点",
    "h动画",
    "h动漫",
    "失身粉",
    "淫荡自慰器",
    "爱女人",
    "屄",
    "成人dv",
    "成人小说",
    "成人电",
    "成人卡通",
    "成人聊",
    "成人片",
    "成人视",
    "成人图",
    "成人文",
    "成人小",
    "赤裸",
    "扌由插",
    "抽一插",
    "多人轮",
    "封面女郎",
    "花花公子",
    "寂寞男",
    "寂寞女",
    "激情",
    "集体淫",
    "金鳞岂是池中物",
    "金麟岂是池中物",
    "流淫",
    "铃木麻",
    "品香堂",
    "惹火身材",
    "三级片",
    "少修正",
    "爽死我了",
    "偷拍",
    "我就色",
    "无码",
    "学生妹",
    "幼男",
    "幼女",
    "玉女心经",
    "玉蒲团",
    "欲仙欲死",
    "张筱雨",
    "中年美妇",
    "18禁",
    "99bb",
    "a4u",
    "a4y",
    "adult",
    "amateur",
    "anal",
    "g片",
    "hardcore",
    "incest",
    "porn",
    "secom",
    "sexinsex",
    "sm女王",
    "xiao77",
    "xing伴侣",
    "tokyohot",
    "yin荡",
    "贱人",
    "涩涩",
    "瑟瑟",
    "肏",
    "性瘾",
  ];

  automaton_websearch_filter_keywords = new SimpleAC([
    ...defaultKeywords,
    ...keywords,
  ]);
  websearch_filter_keywords_list = keywords;
};
initAutomaton_websearch_filter_keywords();
