<template>
  <div class="min-h-screen">
    <AdminHeader />
    <AdminNav />
    <main class="max-w-7xl mx-auto px-2 py-6 sm:px-6">
      <slot />
    </main>
    <UFooter>
      <ULink to="https://github.com/liumingye/xiageba2" target="_blank" no-rel>
        GitHub
      </ULink>
    </UFooter>
  </div>
</template>
