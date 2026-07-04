import { validateNetDiskLink } from "../utils/netDiskLinkValidator";

export default defineEventHandler(async (event) => {
  const res = await validateNetDiskLink("https://pan.xunlei.com/s/VOo9HiV_pgrcOERK8GB2uBQyA1?pwd=53ch");
  console.log(res);
});
