import { defineStore } from "pinia";
import { ref } from "vue";
import { useLocalStorage } from "@vueuse/core";

export interface DownloadOption {
  quality: string;
  url: string;
}

export interface Music {
  id: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  lyrics: string;
  playUrl: string;
  downloads: DownloadOption[];
}

export const useMusicStore = defineStore("music", () => {
  const searchHistory = useLocalStorage<string[]>("searchHistory", []);
  const currentMusic = ref<Music | null>(null);

  const addSearchHistory = (keyword: string) => {
    if (!keyword.trim()) return;
    const index = searchHistory.value.indexOf(keyword);
    if (index > -1) {
      searchHistory.value.splice(index, 1);
    }
    searchHistory.value.unshift(keyword);
    if (searchHistory.value.length > 20) {
      searchHistory.value.pop();
    }
  };

  const loadSearchHistory = () => {
    // useLocalStorage 已在初始化时读取
  };

  const clearSearchHistory = () => {
    searchHistory.value = [];
  };

  const setCurrentMusic = (music: Music) => {
    currentMusic.value = music;
  };

  const searchType = ref<"resource" | "music">("music");

  return {
    searchHistory,
    currentMusic,
    addSearchHistory,
    loadSearchHistory,
    clearSearchHistory,
    searchType,
    setCurrentMusic,
  };
});
