export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter();
  const getHistoryPosition = () => {
    const position = window.history.state?.position;
    return typeof position === "number" ? position : null;
  };

  let currentPosition = getHistoryPosition();

  router.beforeEach((to, from) => {
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    to.meta.viewTransition = isMobile;

    if (!isMobile) {
      delete document.documentElement.dataset.navigationDirection;
      return;
    }

    if (!from.matched.length) return;

    const nextPosition = getHistoryPosition();
    const direction =
      nextPosition !== null &&
      currentPosition !== null &&
      nextPosition < currentPosition
        ? "back"
        : "forward";

    document.documentElement.dataset.navigationDirection = direction;
  });

  router.afterEach(() => {
    currentPosition = getHistoryPosition();
  });

  nuxtApp.hook("app:error", () => {
    delete document.documentElement.dataset.navigationDirection;
  });
});
