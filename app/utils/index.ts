export function debounce(fn: () => void, delay: number): () => void {
  let timer: undefined | number;
  return function () {
    if (timer !== undefined) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(() => {
      fn();
      timer = undefined;
    }, delay);
  };
}

export const getTypeName = (type: string) => {
  switch (type) {
    case "quark":
      return "夸克网盘";
    case "baidu":
      return "百度网盘";
    case "uc":
      return "UC网盘";
    case "xunlei":
      return "迅雷网盘";
    default:
      return "其他网盘";
  }
};

export const copyToClipboard = (text: string) => {
  const input = document.createElement("input");
  input.value = text;
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  document.body.removeChild(input);
};
