<script setup lang="ts">
import { ref } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { post } from "~/utils/request";
import type { AuthFormField, FormError } from "@nuxt/ui";

const router = useRouter();
const route = useRoute();
const { login } = useAuth();

const error = ref("");
const loading = ref(false);

const fields: AuthFormField[] = [
  {
    name: "username",
    type: "text",
    label: "用户名",
    placeholder: "请输入用户名",
    autocomplete: "username",
    required: true,
  },
  {
    name: "password",
    type: "password",
    label: "密码",
    placeholder: "请输入密码",
    autocomplete: "current-password",
    required: true,
  },
];

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

const handleSubmit = async (payload: any) => {
  error.value = "";
  loading.value = true;

  try {
    const data = await post("/api/admin/login", {
      username: String(payload?.data?.username ?? "").trim(),
      password: String(payload?.data?.password ?? ""),
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
  <div class="min-h-screen flex items-center justify-center p-4">
    <UCard class="w-full max-w-md" :ui="{ body: 'p-6 sm:p-8' }">
      <UAuthForm
        icon="i-lucide-user"
        title="管理后台"
        description="管理员登录"
        :fields="fields"
        :validate="validate"
        :loading="loading"
        :submit="{ label: '登录', size: 'lg' }"
        @submit="handleSubmit"
      >
        <template #validation>
          <UAlert v-if="error" color="error" variant="soft" :title="error" />
        </template>

        <template #footer>还没有账号？请联系超级管理员</template>
      </UAuthForm>
    </UCard>
  </div>
</template>
