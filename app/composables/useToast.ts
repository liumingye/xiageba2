import { ref } from "vue";

interface ToastItem {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

const toasts = ref<ToastItem[]>([]);
let toastId = 0;

export const useToast = () => {
  const add = (
    message: string,
    type: "success" | "error" | "info" = "info",
    duration: number = 2000,
  ) => {
    const id = ++toastId;
    toasts.value.push({ id, message, type });
    setTimeout(() => {
      remove(id);
    }, duration);
    return id;
  };

  const success = (message: string, duration?: number) =>
    add(message, "success", duration);
  const error = (message: string, duration?: number) =>
    add(message, "error", duration);
  const info = (message: string, duration?: number) =>
    add(message, "info", duration);

  const remove = (id: number) => {
    const index = toasts.value.findIndex((t) => t.id === id);
    if (index > -1) {
      toasts.value.splice(index, 1);
    }
  };

  const clear = () => {
    toasts.value = [];
  };

  return {
    toasts,
    add,
    success,
    error,
    info,
    remove,
    clear,
  };
};
