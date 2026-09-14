<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { post } from "~/utils/request";
import type { FormSubmitEvent, AuthFormField, FormError } from "@nuxt/ui";
import { useStyleTag, useMounted, useStorage } from "@vueuse/core";

const router = useRouter();
const route = useRoute();
const { login } = useAuth();

const error = ref("");
const loading = ref(false);

const { load } = useStyleTag(`body{
  overflow: hidden;
}`);
load();

const isMounted = useMounted();

// 记住账号：useStorage 自动同步 localStorage
const rememberChecked = useStorage<boolean>("remember-me", false);
const rememberedUsername = useStorage<string>("remembered-account", "");

const inputUi = {
  base: "h-16 rounded-2xl bg-transparent hover:bg-transparent focus:bg-transparent border border-transparent focus:border-white/15 focus-visible:outline-0 md:text-lg px-6 placeholder:text-white/70",
};

const fields = computed<AuthFormField[]>(() => [
  {
    name: "username",
    type: "text",
    label: "用户名",
    placeholder: "请输入用户名",
    autocomplete: "username",
    // required: true,
    variant: "soft",
    defaultValue: rememberedUsername.value,
    ui: inputUi,
  },
  {
    name: "password",
    type: "password",
    label: "密码",
    placeholder: "请输入密码",
    autocomplete: "password",
    // required: true,
    variant: "soft",
    ui: inputUi,
  },
  {
    name: "remember",
    label: "记住账号",
    type: "checkbox",
    color: "primary",
    defaultValue: rememberChecked.value,
    ui: {
      base: "ring-white/15",
    },
  },
]);

const validate = (state: any): FormError[] => {
  const errors: FormError[] = [];
  if (!state?.username?.trim()) {
    errors.push({ name: "username", message: "请输入用户名" });
  }
  if (!state?.password?.trim()) {
    errors.push({ name: "password", message: "请输入密码" });
  }
  return errors;
};

const handleSubmit = async (
  payload: FormSubmitEvent<{
    username: string;
    password: string;
    remember: boolean;
  }>,
) => {
  error.value = "";
  loading.value = true;

  try {
    const data = await post("/api/admin/login", {
      username: String(payload.data.username ?? "").trim(),
      password: String(payload.data.password ?? ""),
    });

    // 记住账号：useStorage 响应式写入会自动同步到 localStorage
    if (payload.data.remember) {
      rememberChecked.value = true;
      rememberedUsername.value = String(payload.data.username ?? "").trim();
    } else {
      rememberChecked.value = false;
      rememberedUsername.value = "";
    }

    login(data.username, data.token);
    const redirect = route.query.redirect as string;
    const SAFE_REDIRECT =
      redirect && redirect.startsWith("/") && !redirect.startsWith("//")
        ? redirect
        : "/admin";
    router.push(SAFE_REDIRECT);
  } catch (e: any) {
    if (e.response) {
      error.value =
        e.response.data.message || e.response.data.error || "登录失败";
    } else {
      error.value = "网络错误";
    }
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div
    class="dark bg-black"
    :class="{
      'auth-page-ready': isMounted,
    }"
  >
    <AdminAmbientCanvas class="max-md:opacity-50" />
    <div class="min-h-screen w-full flex items-center justify-end p-4">
      <div class="w-full sm:max-w-md auth-reveal data-reveal-order3 xl:mr-30">
        <UAuthForm
          :fields="fields"
          :validate="validate"
          :validateOn="['change', 'input']"
          :loading="loading"
          :submit="{
            label: '登录',
            size: 'xl',
            color: 'neutral',
            ui: {
              base: 'mt-3 h-16 rounded-2xl auth-reveal data-reveal-order7',
            },
          }"
          :ui="{
            header: 'flex-row gap-4 text-left mb-10',
            input:
              'mt-1 bg-inverted/6 hover:bg-inverted/10 focus:bg-inverted/10 rounded-2xl',
            password:
              'mt-1 bg-inverted/6 hover:bg-inverted/10 focus:bg-inverted/10 rounded-2xl',
            body: 'auth-reveal data-reveal-order5',
            footer: 'text-white/70 auth-reveal data-reveal-order7',
            checkbox: 'items-center',
          }"
          @submit="handleSubmit"
        >
          <template #header>
            <div class="flex justify-center items-center size-22.5">
              <img class="h-full w-full" src="/img/logo.png" />
            </div>

            <div class="flex flex-col justify-between">
              <div
                class="text-pretty font-semibold text-highlighted text-5xl items-start"
              >
                全盘搜
              </div>
              <div class="mt-auto text-xl text-pretty text-muted">管理后台</div>
            </div>
          </template>

          <template #validation>
            <UAlert v-if="error" color="error" variant="soft" :title="error" />
          </template>

          <template #footer>还没有账号？请联系超级管理员</template>
        </UAuthForm>
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(form input:-internal-autofill-selected) {
  -webkit-text-fill-color: var(--ui-text-highlighted);
  transition: background-color 50000s ease-in-out;
}
.auth-reveal,
:deep(.auth-reveal) {
  opacity: 0;
  transition:
    opacity 0.42s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.42s cubic-bezier(0.16, 1, 0.3, 1);
  transition-delay: calc(20ms + var(--reveal-order, 0) * 55ms);
  transform: translateY(16px);
}

.data-reveal-order3 {
  --reveal-order: 3;
}
.data-reveal-order5,
:deep(.data-reveal-order5) {
  --reveal-order: 5;
}
.data-reveal-order7,
:deep(.data-reveal-order7) {
  --reveal-order: 7;
}

.auth-page-ready .auth-reveal,
.auth-page-ready :deep(.auth-reveal) {
  opacity: 1;
  transform: translateY(0);
}
</style>
