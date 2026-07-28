import { getConfigValue } from "#server/lib/configCache";

// SimpleAC 多模式匹配自动机
export interface TrieNode {
  children: Map<string, TrieNode>;
  end?: boolean;
  fail?: TrieNode;
}

export class SimpleAC {
  root: TrieNode = { children: new Map() };

  constructor(keywords: string[]) {
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
}

// 实例
export let automaton_websearch_filter_keywords: SimpleAC | null = null;
export const initAutomaton_websearch_filter_keywords = async () => {
  let filterKeywordsStr = await getConfigValue("websearch_filter_keywords");
  const keywords = filterKeywordsStr
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 0);

  automaton_websearch_filter_keywords = new SimpleAC(keywords);
};
initAutomaton_websearch_filter_keywords();
