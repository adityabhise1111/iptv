import { renderSearchBar } from './components/SearchBar.tsx';
import { renderVideoPlayer } from './components/VideoPlayer.tsx';
import { renderCategoryTabs } from './components/CategoryTabs.tsx';
import { renderChannelGrid } from './components/ChannelGrid.tsx';

const IPTV_PLAYLIST_URL = 'https://iptv-org.github.io/iptv/index.m3u';
const VISIBLE_BATCH_SIZE = 80;
const SWITCH_DEBOUNCE_MS = 140;
const STREAM_RETRY_LIMIT = 1;
const STREAM_RETRY_DELAY_MS = 900;

const MAIN_CATEGORIES = [
  'All',
  'News',
  'Sports',
  'Movies',
  'Kids',
  'Music',
  'Entertainment',
  'Education',
  'Lifestyle',
  'Documentary',
  'Religious',
  'Other'
];

const CATEGORY_PRIORITY = [
  'News',
  'Sports',
  'Movies',
  'Kids',
  'Music',
  'Entertainment',
  'Education',
  'Documentary',
  'Lifestyle',
  'Religious',
  'Other'
];

const CATEGORY_KEYWORDS = {
  News: ['news', 'newscast', 'headline', 'journal', 'bulletin', 'current affairs'],
  Sports: ['sports', 'sport', 'football', 'soccer', 'cricket', 'nba', 'nfl', 'tennis', 'f1'],
  Movies: ['movie', 'movies', 'film', 'cinema', 'blockbuster'],
  Kids: ['kids', 'kid', 'children', 'child', 'cartoon', 'animation', 'anime', 'nursery'],
  Music: ['music', 'radio', 'audio', 'song', 'songs', 'hits', 'mtv'],
  Entertainment: ['entertainment', 'general', 'variety', 'show', 'drama', 'comedy'],
  Education: ['education', 'educational', 'learning', 'school', 'science', 'history', 'knowledge'],
  Documentary: ['documentary', 'docu', 'nature', 'wildlife'],
  Lifestyle: ['lifestyle', 'travel', 'food', 'cooking', 'fashion', 'health', 'fitness'],
  Religious: ['religious', 'religion', 'faith', 'islamic', 'christian', 'hindu', 'spiritual']
};

const TAB_CATEGORIES = MAIN_CATEGORIES.filter((category) => category !== 'All');

let channels = [];
let channelByUrl = new Map();
let selectedChannel = null;
let selectedCategory = 'All';
let searchQuery = '';
let currentHls = null;
let searchDebounceTimer = null;
let switchDebounceTimer = null;
let playlistAbortController = null;
let filteredChannels = [];
let visibleCount = VISIBLE_BATCH_SIZE;
let activeSwitchToken = 0;
let autoRetryTimer = null;
let isLoadingMore = false;
let tabsRendered = false;
let searchBarVisible = false;

const mounts = {
  searchBar: document.getElementById('searchBarMount'),
  searchToggleBtn: document.getElementById('searchToggleBtn'),
  videoPlayer: document.getElementById('videoPlayerMount'),
  categoryTabs: document.getElementById('categoryTabsMount'),
  contentArea: document.getElementById('contentArea'),
  channelGrid: document.getElementById('channelGridMount'),
  loadingState: document.getElementById('loadingState'),
  errorState: document.getElementById('errorState'),
  retryBtn: document.getElementById('retryBtn')
};

let elements = {};

function initializeStaticUI() {
  mounts.searchBar.innerHTML = renderSearchBar(searchQuery);
  mounts.videoPlayer.innerHTML = renderVideoPlayer();

  elements = {
    searchInput: document.getElementById('searchInput'),
    searchBarContainer: document.getElementById('searchBarContainer'),
    videoPlayer: document.getElementById('videoPlayer'),
    placeholder: document.getElementById('placeholder'),
    streamLoading: document.getElementById('streamLoading'),
    streamError: document.getElementById('streamError'),
    nowPlaying: document.getElementById('nowPlaying'),
    currentChannel: document.getElementById('currentChannel')
  };

  ensureCategoryTabsRendered();

  elements.searchInput.addEventListener('input', handleSearchInput);
  mounts.searchToggleBtn.addEventListener('click', handleSearchToggle);
  mounts.retryBtn.addEventListener('click', fetchPlaylist);
  mounts.contentArea.addEventListener('scroll', handleContentScroll, { passive: true });

  mounts.categoryTabs.addEventListener('click', handleCategoryClick);
  mounts.channelGrid.addEventListener('click', handleChannelClick);

  bindVideoLifecycleListeners();
}

function ensureCategoryTabsRendered() {
  if (tabsRendered) {
    return;
  }

  mounts.categoryTabs.innerHTML = renderCategoryTabs(TAB_CATEGORIES, selectedCategory);
  tabsRendered = true;
}

function updateCategoryTabState() {
  const tabButtons = mounts.categoryTabs.querySelectorAll('[data-category]');

  tabButtons.forEach((button) => {
    const isActive = button.getAttribute('data-category') === selectedCategory;

    button.classList.toggle('bg-blue-600', isActive);
    button.classList.toggle('border-blue-500', isActive);
    button.classList.toggle('text-white', isActive);

    button.classList.toggle('bg-gray-800', !isActive);
    button.classList.toggle('border-gray-700', !isActive);
    button.classList.toggle('text-gray-300', !isActive);
    button.classList.toggle('hover:bg-gray-700', !isActive);
    button.classList.toggle('hover:text-white', !isActive);
  });
}

function handleSearchInput(event) {
  const value = event.target.value;

  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }

  searchDebounceTimer = setTimeout(() => {
    searchQuery = value;
    resetVisibleWindow();
    renderDynamicUI();
  }, 180);
}

function handleSearchToggle() {
  searchBarVisible = !searchBarVisible;

  if (searchBarVisible) {
    elements.searchBarContainer.classList.remove('hidden');
    elements.searchInput.focus();
  } else {
    elements.searchBarContainer.classList.add('hidden');
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
    }
    elements.searchInput.value = '';
    searchQuery = '';
    resetVisibleWindow();
    renderDynamicUI();
  }
}

function handleCategoryClick(event) {
  const target = event.target.closest('[data-category]');
  if (!target) return;

  const nextCategory = target.getAttribute('data-category') || 'All';
  if (nextCategory === selectedCategory) {
    return;
  }

  selectedCategory = nextCategory;
  resetVisibleWindow();
  renderDynamicUI();
}

function handleChannelClick(event) {
  const loadMoreTarget = event.target.closest('[data-load-more]');
  if (loadMoreTarget) {
    increaseVisibleChannels();
    return;
  }

  const target = event.target.closest('[data-channel-url]');
  if (!target) return;

  const channelUrl = target.getAttribute('data-channel-url');
  const channel = channelByUrl.get(channelUrl);

  if (!channel) return;

  if (selectedChannel?.url === channel.url) {
    return;
  }

  selectedChannel = channel;
  renderDynamicUI();
  scheduleChannelSwitch(channel);
}

async function fetchPlaylist() {
  try {
    if (playlistAbortController) {
      playlistAbortController.abort();
    }

    playlistAbortController = new AbortController();

    mounts.loadingState.classList.remove('hidden');
    mounts.errorState.classList.add('hidden');
    mounts.channelGrid.classList.add('hidden');

    const response = await fetch(IPTV_PLAYLIST_URL, { signal: playlistAbortController.signal });
    if (!response.ok) throw new Error('Failed to fetch playlist');

    const text = await response.text();
    channels = parseM3U(text);
    channelByUrl = new Map(channels.map((channel) => [channel.url, channel]));

    mounts.loadingState.classList.add('hidden');
    mounts.channelGrid.classList.remove('hidden');

    resetVisibleWindow();
    renderDynamicUI();
  } catch (error) {
    if (error?.name === 'AbortError') {
      return;
    }

    console.error('Error fetching playlist:', error);
    mounts.loadingState.classList.add('hidden');
    mounts.errorState.classList.remove('hidden');
  } finally {
    playlistAbortController = null;
  }
}

function parseM3U(text) {
  const lines = text.split('\n');
  const parsedChannels = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();

    if (!line.startsWith('#EXTINF:')) {
      continue;
    }

    const nextLine = lines[index + 1]?.trim();
    if (!nextLine || nextLine.startsWith('#')) {
      continue;
    }

    const nameMatch = line.match(/,(.+)$/);
    const name = nameMatch ? nameMatch[1].trim() : 'Unknown Channel';

    const groupTitleMatch = line.match(/group-title="([^"]*)"/i);
    const groupTitleRaw = groupTitleMatch?.[1]?.trim() || '';
    const categoryTags = parseCategoryTags(groupTitleRaw);

    // Example usage:
    // group-title "Animation;Kids;Music" -> ["Animation", "Kids", "Music"] -> "Kids"
    const category = mapRawTagsToMainCategory(categoryTags);

    const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
    const logo = logoMatch?.[1]?.trim() || undefined;

    const url = nextLine;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      parsedChannels.push({ name, url, category, logo });
    }
  }

  return parsedChannels;
}

function parseCategoryTags(rawGroupTitle) {
  if (!rawGroupTitle) {
    return [];
  }

  return rawGroupTitle
    .split(';')
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function mapRawTagsToMainCategory(rawTags) {
  if (!rawTags.length) {
    return 'Other';
  }

  const normalizedTags = rawTags.map((tag) => tag.toLowerCase());
  const tokenSet = new Set();

  normalizedTags.forEach((tag) => {
    tokenSet.add(tag);
    const words = tag.split(/[^a-z0-9]+/).filter(Boolean);
    words.forEach((word) => tokenSet.add(word));
  });

  for (const category of CATEGORY_PRIORITY) {
    if (category === 'Other') {
      continue;
    }

    const keywords = CATEGORY_KEYWORDS[category];
    const matched = keywords.some((keyword) => {
      if (tokenSet.has(keyword)) {
        return true;
      }

      return normalizedTags.some((tag) => tag.includes(keyword));
    });

    if (matched) {
      return category;
    }
  }

  return 'Other';
}

function getFilteredChannels() {
  const loweredQuery = searchQuery.trim().toLowerCase();

  return channels.filter((channel) => {
    const matchesCategory = selectedCategory === 'All' || channel.category === selectedCategory;
    const matchesSearch = !loweredQuery || channel.name.toLowerCase().includes(loweredQuery);
    return matchesCategory && matchesSearch;
  });
}

function renderDynamicUI() {
  updateCategoryTabState();

  filteredChannels = getFilteredChannels();
  const visibleChannels = filteredChannels.slice(0, visibleCount);

  mounts.channelGrid.innerHTML = renderChannelGrid(
    visibleChannels,
    selectedChannel,
    filteredChannels.length > visibleChannels.length
  );
}

function resetVisibleWindow() {
  visibleCount = VISIBLE_BATCH_SIZE;
  isLoadingMore = false;
}

function increaseVisibleChannels() {
  if (isLoadingMore || visibleCount >= filteredChannels.length) {
    return;
  }

  isLoadingMore = true;
  visibleCount = Math.min(visibleCount + VISIBLE_BATCH_SIZE, filteredChannels.length);
  renderDynamicUI();
  isLoadingMore = false;
}

function handleContentScroll() {
  const container = mounts.contentArea;
  const nearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 260;

  if (nearBottom) {
    increaseVisibleChannels();
  }
}

function scheduleChannelSwitch(channel) {
  if (switchDebounceTimer) {
    clearTimeout(switchDebounceTimer);
  }

  switchDebounceTimer = setTimeout(() => {
    loadChannel(channel);
  }, SWITCH_DEBOUNCE_MS);
}

function loadChannel(channel, attempt = 0) {
  activeSwitchToken += 1;
  const switchToken = activeSwitchToken;

  elements.placeholder.classList.add('hidden');
  elements.streamError.classList.add('hidden');
  elements.streamLoading.classList.remove('hidden');
  elements.videoPlayer.classList.remove('hidden');
  elements.nowPlaying.classList.remove('hidden');
  elements.currentChannel.textContent = channel.name;

  stopCurrentStream();

  const video = elements.videoPlayer;
  const streamUrl = channel.url;
  const isLikelyHls = isHlsStream(streamUrl);

  if (isLikelyHls) {
    attachHlsStream(video, streamUrl, switchToken, channel, attempt);
    return;
  }

  attachDirectVideoStream(video, streamUrl, switchToken, channel, attempt);
}

function attachHlsStream(video, streamUrl, switchToken, channel, attempt) {
  if (!window.Hls && !canUseNativeHls(video)) {
    showStreamError();
    return;
  }

  if (window.Hls && Hls.isSupported()) {
    currentHls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 30,
      maxBufferLength: 20,
      maxMaxBufferLength: 30,
      liveSyncDurationCount: 3,
      manifestLoadingTimeOut: 12000,
      fragLoadingTimeOut: 15000
    });

    currentHls.attachMedia(video);
    currentHls.loadSource(streamUrl);

    currentHls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (switchToken !== activeSwitchToken) {
        return;
      }

      video.play().catch((error) => {
        console.error('Playback error:', error);
        retryOrFail(channel, attempt, switchToken);
      });
    });

    currentHls.on(Hls.Events.ERROR, (_, data) => {
      if (switchToken !== activeSwitchToken) {
        return;
      }

      if (!data.fatal) {
        return;
      }

      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        try {
          currentHls.recoverMediaError();
          return;
        } catch (error) {
          console.error('Recover media error failed:', error);
        }
      }

      retryOrFail(channel, attempt, switchToken);
    });

    return;
  }

  if (canUseNativeHls(video)) {
    attachDirectVideoStream(video, streamUrl, switchToken, channel, attempt);
    return;
  }

  showStreamError();
}

function attachDirectVideoStream(video, streamUrl, switchToken, channel, attempt) {
  video.src = streamUrl;
  video.load();
  video.play().catch((error) => {
    if (switchToken !== activeSwitchToken) {
      return;
    }

    console.error('Direct playback error:', error);
    retryOrFail(channel, attempt, switchToken);
  });
}

function retryOrFail(channel, attempt, switchToken) {
  if (switchToken !== activeSwitchToken) {
    return;
  }

  if (attempt >= STREAM_RETRY_LIMIT) {
    showStreamError();
    return;
  }

  if (autoRetryTimer) {
    clearTimeout(autoRetryTimer);
  }

  autoRetryTimer = setTimeout(() => {
    if (switchToken !== activeSwitchToken) {
      return;
    }

    loadChannel(channel, attempt + 1);
  }, STREAM_RETRY_DELAY_MS);
}

function isHlsStream(url) {
  return /\.m3u8($|\?)/i.test(url);
}

function canUseNativeHls(video) {
  return video.canPlayType('application/vnd.apple.mpegurl') !== '';
}

function bindVideoLifecycleListeners() {
  const video = elements.videoPlayer;

  video.addEventListener('playing', hideStreamLoading);
  video.addEventListener('canplay', hideStreamLoading);
  video.addEventListener('waiting', showStreamLoading);
  video.addEventListener('stalled', showStreamLoading);
  video.addEventListener('error', showStreamError);
}

function showStreamLoading() {
  if (!selectedChannel) {
    return;
  }

  elements.streamLoading.classList.remove('hidden');
}

function stopCurrentStream() {
  if (autoRetryTimer) {
    clearTimeout(autoRetryTimer);
    autoRetryTimer = null;
  }

  if (currentHls) {
    currentHls.destroy();
    currentHls = null;
  }

  const video = elements.videoPlayer;
  video.pause();
  video.removeAttribute('src');
  video.load();
}

function hideStreamLoading() {
  elements.streamLoading.classList.add('hidden');

  if (selectedChannel) {
    try {
      localStorage.setItem('lastPlayedChannelUrl', selectedChannel.url);
    } catch (_error) {
      // Ignore storage limitations for private/incognito sessions.
    }
  }
}

function showStreamError() {
  elements.streamLoading.classList.add('hidden');
  elements.streamError.classList.remove('hidden');
}

function resumeLastPlayedChannel() {
  try {
    const cachedUrl = localStorage.getItem('lastPlayedChannelUrl');
    if (!cachedUrl) {
      return;
    }

    const cachedChannel = channelByUrl.get(cachedUrl);
    if (!cachedChannel) {
      return;
    }

    selectedChannel = cachedChannel;
    renderDynamicUI();
    scheduleChannelSwitch(cachedChannel);
  } catch (_error) {
    // Ignore localStorage access errors.
  }
}

initializeStaticUI();
fetchPlaylist().then(() => {
  resumeLastPlayedChannel();
});
