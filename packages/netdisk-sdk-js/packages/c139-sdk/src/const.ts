/** 分享接口域名 */
export const C139_SHARE_BASE = "https://share-kd-njs.yun.139.com";
/** 分享文件列表 */
export const C139_SHARE_LIST_URL = `${C139_SHARE_BASE}/yun-share/richlifeApp/devapp/IOutLink/getOutLinkInfoV6`;
/** 分享下载链接 */
export const C139_SHARE_LINK_URL = `${C139_SHARE_BASE}/yun-share/richlifeApp/devapp/IOutLink/dlFromOutLinkV3`;
/** 分享概要（标题/提取码） */
export const C139_SHARE_GENERAL_URL = `${C139_SHARE_BASE}/yun-share/richlifeApp/devapp/IOutLink/getOutLinkGeneral`;
/** 分享接口 AES-CBC 密钥（16 字节） */
export const C139_SHARE_AES_KEY = "PVGDwmcvfs1uV3d1";
/** 创建转存任务 */
export const C139_TRANSFER_CREATE_URL = `${C139_SHARE_BASE}/yun-share/richlifeApp/devapp/IBatchOprTask/createOuterLinkBatchOprTask`;
/** 查询转存任务 */
export const C139_TRANSFER_QUERY_URL = `${C139_SHARE_BASE}/yun-share/richlifeApp/devapp/IBatchOprTask/queryBatchOprTaskDetail`;
/** 创建分享链接 */
export const C139_CREATE_SHARE_URL = "https://yun.139.com/orchestration/personalCloud-rebuild/outlink/v1.0/getOutLink";

/** 个人网盘接口域名 */
export const C139_CLOUD_BASE = "https://personal-kd-njs.yun.139.com";
/** 个人盘文件列表 */
export const C139_FILE_LIST_URL = `${C139_CLOUD_BASE}/hcy/file/list`;
/** 文件更新（重命名） */
export const C139_FILE_UPDATE_URL = `${C139_CLOUD_BASE}/hcy/file/update`;
/** 批量移动 */
export const C139_BATCH_MOVE_URL = `${C139_CLOUD_BASE}/hcy/file/batchMove`;
/** 批量删除（回收站） */
export const C139_BATCH_TRASH_URL = `${C139_CLOUD_BASE}/hcy/recyclebin/batchTrash`;
/** 获取下载链接 */
export const C139_DOWNLOAD_URL = `${C139_CLOUD_BASE}/hcy/file/getDownloadUrl`;
/** 任务查询 */
export const C139_TASK_GET_URL = `${C139_CLOUD_BASE}/hcy/task/get`;

/** 渠道来源 */
export const C139_YUN_CHANNEL_SOURCE = "10000034";
export const C139_MCLOUD_VERSION = "7.18.0";
export const C139_MCLOUD_CLIENT = "10701";
export const C139_MCLOUD_CHANNEL = "1000101";
export const C139_YUN_MODULE_TYPE = "100";
export const C139_M4C_SRC = "10002";
export const C139_M4C_CALLER = "PC";

/** 个人盘 x-deviceinfo */
export const C139_X_DEVICEINFO =
  "||9|7.18.0|chrome|132.0.0.0|084a669f0b1b0fc62fef1aca1147a412||windows 10||zh-CN|||";
/** 个人盘 x-client-info */
export const C139_X_CLIENT_INFO =
  "||9|7.18.0|chrome|132.0.0.0|084a669f0b1b0fc62fef1aca1147a412||windows 10||zh-CN|||dW5kZWZpbmVk||";

/** 分享接口 x-deviceinfo */
export const C139_SHARE_X_DEVICEINFO =
  "||3|12.27.0|||||chrome 150.0.0.0|360X444|zh-cn|||";
export const C139_SHARE_X_HUAWEI_CHANNELSRC = "10245500";
export const C139_SHARE_X_MM_SOURCE = "0002";

/** 分享接口移动端 UA */
export const C139_SHARE_MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36";
/** PC 端 UA */
export const C139_PC_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.6839.99 Safari/537.36";

/** 转存任务轮询上限 */
export const C139_TASK_POLL_MAX = 30;
/** 转存任务轮询间隔（ms） */
export const C139_TASK_POLL_INTERVAL = 1000;
