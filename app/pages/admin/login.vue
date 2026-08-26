<script setup lang="ts">
import { ref } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { post } from "~/utils/request";
import { Music, Lock, User } from "@lucide/vue";

const router = useRouter();
const route = useRoute();
const { login, isLoggedIn } = useAuth();

const username = ref("");
const password = ref("");
const error = ref("");
const loading = ref(false);

const handleLogin = async () => {
  if (!username.value.trim() || !password.value.trim()) {
    error.value = "请输入用户名和密码";
    return;
  }

  loading.value = true;

  try {
    const data = await post("/api/admin/login", {
      username: username.value,
      password: password.value,
    });
    login(data.username, data.token);
    const redirect = route.query.redirect as string;
    const SAFE_REDIRECT =
      redirect && redirect.startsWith("/") && !redirect.startsWith("//")
        ? redirect
        : "/admin";
    router.push(SAFE_REDIRECT);
  } catch (e: any) {
    if (e.response) {
      error.value = e.response.data.message || e.response.data.error || "登录失败";
    } else {
      error.value = "网络错误";
    }
  } finally {
    loading.value = false;
  }
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === "Enter") {
    handleLogin();
  }
};
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <div
          class="w-16 h-16 bg-gradient-to-br from-primary-400 to-primary-600 rounded-xl flex items-center justify-center mx-auto mb-4"
        >
          <Music class="w-10 h-10 text-white" />
        </div>
        <h1 class="text-2xl font-bold text-white">下歌吧管理后台</h1>
        <p class="text-zinc-500 mt-2">管理员登录</p>
      </div>

      <div class="card p-6">
        <div
          v-if="error"
          class="mb-4 p-3 bg-red-900/50 border border-red-800 rounded-lg text-red-400 text-sm"
        >
          {{ error }}
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-zinc-400 text-sm mb-2">用户名</label>
            <div class="relative">
              <User
                class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500"
              />
              <input
                v-model="username"
                type="text"
                placeholder="请输入用户名"
                class="input-search pl-10"
                @keydown="handleKeydown"
              />
            </div>
          </div>

          <div>
            <label class="block text-zinc-400 text-sm mb-2">密码</label>
            <div class="relative">
              <Lock
                class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500"
              />
              <input
                v-model="password"
                type="password"
                placeholder="请输入密码"
                class="input-search pl-10"
                @keydown="handleKeydown"
              />
            </div>
          </div>

          <button
            class="w-full py-3 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="loading"
            @click="handleLogin"
          >
            {{ loading ? "登录中..." : "登录" }}
          </button>
        </div>

        <p class="text-center text-zinc-600 text-sm mt-4">
          还没有账号？请联系超级管理员
        </p>
      </div>
    </div>
  </div>
</template>
