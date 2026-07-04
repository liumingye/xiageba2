import { defineStore } from "pinia";
import { ref } from "vue";

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
  const searchHistory = ref<string[]>([]);
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
    localStorage.setItem("searchHistory", JSON.stringify(searchHistory.value));
  };

  const loadSearchHistory = () => {
    const saved = localStorage.getItem("searchHistory");
    if (saved) {
      searchHistory.value = JSON.parse(saved);
    }
  };

  const clearSearchHistory = () => {
    searchHistory.value = [];
    localStorage.removeItem("searchHistory");
  };

  const setCurrentMusic = (music: Music) => {
    currentMusic.value = music;
  };

  const searchType = ref("music");

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
