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
