import { ref, computed, watch, onUnmounted, type Ref } from "vue";

const funnyTexts = [
  "正在殴打服务器酱...",
  "好运正在路上...",
  "数据太多，正在努力检索...",
  "服务器正在疯狂运转中...",
  "正在跟网盘讨价还价...",
  "数据跑得比兔子还快，正在追...",
  "正在翻箱倒柜找资源...",
  "资源正在打包发货...",
  "正在施展可爱魔法...",
  "服务器表示压力很大...",
  "正在跟数据打交道...",
  "再等等，马上就好...",
  "正在给服务器做人工呼吸...",
  "服务器CPU已经开始冒烟，正在紧急灭火...",
  "正在给服务器投喂猫粮，等它吃完就工作...",
  "正在安抚情绪激动的服务器酱...",
  "服务器说它想静静，但我把它拉回来加班了...",
  "服务器正在热身，准备给你表演个后空翻...",
  "正在逼服务器签下“绝不宕机”的保证书...",
  "服务器刚才打了个喷嚏，数据掉了一地，正在捡...",
  "正在教服务器如何成为一个成熟的打工魂...",
  "服务器正在疯狂摸鱼，我这就去拿鞭子抽它...",
  "数据正在坐电梯，马上就到你面前...",
  "正在拦截在网线里狂奔的数据流...",
  "数据不听话走丢了，正在贴寻人启事...",
  "正在努力把0和1排成整齐的队列...",
  "数据正在穿鞋，马上就出门...",
  "字节跳得太欢，正在拿网兜全城捕捉...",
  "数据正在路上买煎饼果子，耽误了点时间...",
  "正在给数据做SPA，好让它们精神抖擞地见你...",
  "正在解开缠在一起的数据线头...",
  "正在去隔壁库房“借”点新数据...",
  "代码正在自我纠错，希望它别写出新Bug...",
  "正在和Bug们展开激烈的办公室枪战...",
  "正在给代码加点调料，让它看起来更美味...",
  "正在用爱发电中，请稍候...",
  "正在疯狂点击刷新，假装这样能变快...",
  "正在对网络延迟进行物理超度...",
  "别催了别催了，程序员的头发已经掉光了...",
  "正在向代码之神祈祷，保佑这次一次性通过...",
  "正在将代码翻译成人类能够理解的语言...",
  "正在努力把进度条拉长...",
  "正在召唤数据传送门，请退后...",
  "正在使用量子纠缠技术寻找你的资源...",
  "进度条正在积攒怒气值，准备大招...",
  "正在破译外星人留下的神秘数据包...",
  "正在给进度条注入神秘的“催更药水”...",
  "正在连接宇宙信号中，请保持脑电波稳定...",
  "正在向月亮许愿，希望加载能快一点...",
  "正在启动备用星际引擎...",
  "趁现在，快去喝口水、眨眨眼...",
  "进度条在摸鱼，我已经警告过它了...",
  "允许你先发个呆，发完就加载好了...",
  "别看我了，再看我也不会变快的...",
  "正在检测您的颜值……由于太高导致系统瞬间卡顿...",
  "请闭上眼睛数三个数，没加载完就再数三声...",
  "进度条觉得今天风儿甚是喧嚣，决定走得慢一点...",
  "正在为您的数据进行安全消杀，请稍候...",
  "正在把网线拉直，让数据跑得更顺畅...",
  "信号正在翻山越岭，骑着自行车来看你...",
  "正在给路由器烧香拜佛...",
  "数据快递已派送，请准备好零食迎接...",
];

export function useFunnyLoading() {
  const funnyTextIndex = ref(Math.floor(Math.random() * funnyTexts.length));
  let timer: ReturnType<typeof setInterval> | null = null;

  const start = () => {
    funnyTextIndex.value = Math.floor(Math.random() * funnyTexts.length);
    timer = setInterval(() => {
      funnyTextIndex.value = (funnyTextIndex.value + 1) % funnyTexts.length;
    }, 5000);
  };

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const currentText = computed(() => funnyTexts[funnyTextIndex.value]);

  const bindFetching = (fetching: Ref<boolean> | Ref<boolean>[]) => {
    watch(fetching, (val) => {
      const isFetching = Array.isArray(val) ? val.some((item) => item) : val;
      if (isFetching) start();
      else stop();
    });
    onUnmounted(stop);
  };

  return { currentText, start, stop, bindFetching };
}
