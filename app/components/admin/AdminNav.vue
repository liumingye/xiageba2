<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { onClickOutside } from "@vueuse/core";
import {
  Music,
  Users,
  Settings,
  MessageSquare,
  FolderOpen,
  Database,
  Tags,
  UserCog,
  Webhook,
  Megaphone,
  Cloud,
  FileText,
  HardDrive,
  Menu,
  X,
  ChevronDown,
} from "@lucide/vue";

interface NavChild {
  label: string;
  path: string;
  icon: any;
}

interface NavItem {
  label: string;
  path?: string;
  icon: any;
  children?: NavChild[];
}

const route = useRoute();
const router = useRouter();

// 1. 集中定义导航数据架构
const navItems: NavItem[] = [
  {
    label: "资源",
    icon: FolderOpen,
    children: [
      { label: "资源管理", path: "/admin/resource", icon: Database },
      { label: "分类管理", path: "/admin/category", icon: Tags },
      { label: "账号管理", path: "/admin/account", icon: UserCog },
      { label: "接口配置", path: "/admin/apiList", icon: Webhook },
    ],
  },
  {
    label: "文件",
    icon: Cloud,
    children: [
      { label: "文件管理", path: "/admin/storage/files", icon: FileText },
      { label: "存储配置", path: "/admin/storage/config", icon: HardDrive },
    ],
  },
  { label: "音乐管理", path: "/admin", icon: Music },
  { label: "反馈管理", path: "/admin/feedback", icon: MessageSquare },
  { label: "公告管理", path: "/admin/announcement", icon: Megaphone },
  { label: "管理员管理", path: "/admin/admins", icon: Users },
  { label: "系统配置", path: "/admin/maintain", icon: Settings },
];

// 状态控制
const activeDropdown = ref<string | null>(null); // 桌面端当前打开的下拉框 ('资源' | '文件' | null)
const mobileMenuOpen = ref(false); // 移动端抽屉开关
const expandedMobileGroups = ref<Record<string, boolean>>({}); // 移动端折叠面板状态
const dropdownContainerRef = ref<HTMLElement | null>(null);

// 点击外部关闭桌面端下拉框
onClickOutside(dropdownContainerRef, () => {
  activeDropdown.value = null;
});

// 路由监听：路由变化时关闭所有菜单
watch(
  () => route.path,
  () => {
    activeDropdown.value = null;
    mobileMenuOpen.value = false;
  }
);

// 路径匹配逻辑
const isPathActive = (path?: string) => {
  if (!path) return false;
  if (path === "/admin") return route.path === "/admin";
  return route.path.startsWith(path);
};

const isGroupActive = (item: NavItem) => {
  if (item.path) return isPathActive(item.path);
  return item.children?.some((child) => isPathActive(child.path)) ?? false;
};

// 交互操作
const handleNavigate = (path?: string) => {
  if (!path) return;
  router.push(path);
  activeDropdown.value = null;
  mobileMenuOpen.value = false;
};

const toggleDropdown = (label: string) => {
  activeDropdown.value = activeDropdown.value === label ? null : label;
};

const toggleMobileGroup = (label: string) => {
  expandedMobileGroups.value[label] = !expandedMobileGroups.value[label];
};
</script>

<template>
  <nav class="bg-zinc-900 backdrop-blur-md border-b border-zinc-800 sticky top-0 z-40">
    <div class="max-w-7xl mx-auto px-4 sm:px-6">
      <div class="flex items-center h-14">
        
        <!-- 移动端：左侧 Logo 或标题区 + 汉堡按钮 -->
        <div class="flex items-center justify-between w-full md:w-auto">
          <span class="text-white font-semibold text-sm md:hidden">管理后台</span>
          
          <button
            class="md:hidden p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
            @click="mobileMenuOpen = !mobileMenuOpen"
            aria-label="Toggle Menu"
          >
            <Menu v-if="!mobileMenuOpen" class="w-6 h-6" />
            <X v-else class="w-6 h-6" />
          </button>
        </div>

        <!-- 桌面端导航（md 及以上显示） -->
        <div ref="dropdownContainerRef" class="hidden md:flex items-center gap-1">
          <template v-for="item in navItems" :key="item.label">
            
            <!-- 含下拉菜单项 -->
            <div v-if="item.children" class="relative">
              <button
                class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                :class="
                  activeDropdown === item.label || isGroupActive(item)
                    ? 'text-primary-400 bg-primary-500/10'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                "
                @click="toggleDropdown(item.label)"
              >
                <Component :is="item.icon" class="w-4 h-4" />
                <span>{{ item.label }}</span>
                <ChevronDown
                  class="w-3.5 h-3.5 transition-transform duration-200"
                  :class="{ 'rotate-180': activeDropdown === item.label }"
                />
              </button>

              <!-- 下拉 Popover -->
              <Transition
                enter-active-class="transition duration-150 ease-out"
                enter-from-class="opacity-0 scale-95 -translate-y-1"
                enter-to-class="opacity-100 scale-100 translate-y-0"
                leave-active-class="transition duration-100 ease-in"
                leave-from-class="opacity-100 scale-100 translate-y-0"
                leave-to-class="opacity-0 scale-95 -translate-y-1"
              >
                <div
                  v-if="activeDropdown === item.label"
                  class="absolute left-0 top-full mt-1.5 w-44 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl py-1.5 z-50 overflow-hidden"
                >
                  <button
                    v-for="child in item.children"
                    :key="child.path"
                    class="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-left transition-colors"
                    :class="
                      isPathActive(child.path)
                        ? 'bg-primary-500/10 text-primary-500 font-medium'
                        : 'text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'
                    "
                    @click="handleNavigate(child.path)"
                  >
                    <Component :is="child.icon" class="w-4 h-4 shrink-0" />
                    <span>{{ child.label }}</span>
                  </button>
                </div>
              </Transition>
            </div>

            <!-- 普通单项按钮 -->
            <button
              v-else
              class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              :class="
                isPathActive(item.path)
                  ? 'text-primary-400 bg-primary-500/10'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              "
              @click="handleNavigate(item.path)"
            >
              <Component :is="item.icon" class="w-4 h-4" />
              <span>{{ item.label }}</span>
            </button>

          </template>
        </div>

      </div>
    </div>

    <!-- 移动端抽屉菜单 Drawer（小于 md 时使用） -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="mobileMenuOpen"
        class="absolute w-full md:hidden border-t border-zinc-800 bg-zinc-900 px-4 pt-2 pb-4 space-y-1 max-h-[calc(100vh-3.5rem)] overflow-y-auto"
      >
        <template v-for="item in navItems" :key="item.label">
          
          <!-- 移动端带折叠菜单的项 -->
          <div v-if="item.children" class="space-y-1">
            <button
              class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
              :class="
                isGroupActive(item)
                  ? 'text-primary-400 bg-primary-500/10'
                  : 'text-zinc-300 hover:bg-zinc-800'
              "
              @click="toggleMobileGroup(item.label)"
            >
              <div class="flex items-center gap-2.5">
                <Component :is="item.icon" class="w-4 h-4" />
                <span>{{ item.label }}</span>
              </div>
              <ChevronDown
                class="w-4 h-4 transition-transform duration-200"
                :class="{ 'rotate-180': expandedMobileGroups[item.label] }"
              />
            </button>

            <!-- 折叠子菜单列表 -->
            <div
              v-show="expandedMobileGroups[item.label] || isGroupActive(item)"
              class="pl-4 space-y-1 border-l-2 border-zinc-800 ml-3 my-1"
            >
              <button
                v-for="child in item.children"
                :key="child.path"
                class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors"
                :class="
                  isPathActive(child.path)
                    ? 'text-primary-400 font-medium bg-primary-500/10'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                "
                @click="handleNavigate(child.path)"
              >
                <Component :is="child.icon" class="w-3.5 h-3.5" />
                <span>{{ child.label }}</span>
              </button>
            </div>
          </div>

          <!-- 移动端普通菜单项 -->
          <button
            v-else
            class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
            :class="
              isPathActive(item.path)
                ? 'text-primary-400 bg-primary-500/10'
                : 'text-zinc-300 hover:bg-zinc-800'
            "
            @click="handleNavigate(item.path)"
          >
            <Component :is="item.icon" class="w-4 h-4" />
            <span>{{ item.label }}</span>
          </button>

        </template>
      </div>
    </Transition>
  </nav>
</template>