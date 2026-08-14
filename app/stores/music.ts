import { defineStore, skipHydrate, storeToRefs } from "pinia";
import { ref } from "vue";
import { useLocalStorage } from "@vueuse/core";
export { storeToRefs };

export interface DownloadOption {
  quality: string;
  url: string;
}

export interface MusicSearch {
  id: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  quality: string[];
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
  const searchType = useLocalStorage<"resource" | "music" | "ai">(
    "searchType",
    "music",
  );

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

  const clearSearchHistory = () => {
    searchHistory.value = [];
  };

  return {
    searchHistory: skipHydrate(searchHistory),
    searchType: skipHydrate(searchType),
    addSearchHistory,
    clearSearchHistory,
  };
});
