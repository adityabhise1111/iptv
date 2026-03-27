import { renderSearchBar } from './components/SearchBar.tsx';
import { renderVideoPlayer } from './components/VideoPlayer.tsx';
import { renderCategoryTabs } from './components/CategoryTabs.tsx';
import { renderChannelGrid } from './components/ChannelGrid.tsx';

const IPTV_PLAYLIST_URL = 'https://iptv-org.github.io/iptv/index.m3u';
const VISIBLE_BATCH_SIZE = 80;
const SWITCH_DEBOUNCE_MS = 140;
const STREAM_RETRY_LIMIT = 1;
const STREAM_RETRY_DELAY_MS = 900;

let channels = [];
let channelByUrl = new Map();
let groupedChannels = {};
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

const mounts = {
  searchBar: document.getElementById('searchBarMount'),
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
    videoPlayer: document.getElementById('videoPlayer'),
    placeholder: document.getElementById('placeholder'),
    streamLoading: document.getElementById('streamLoading'),
    streamError: document.getElementById('streamError'),
    nowPlaying: document.getElementById('nowPlaying'),
    currentChannel: document.getElementById('currentChannel')
  };

  elements.searchInput.addEventListener('input', handleSearchInput);
  mounts.retryBtn.addEventListener('click', fetchPlaylist);
  mounts.contentArea.addEventListener('scroll', handleContentScroll, { passive: true });

  mounts.categoryTabs.addEventListener('click', handleCategoryClick);
  mounts.channelGrid.addEventListener('click', handleChannelClick);

  bindVideoLifecycleListeners();
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

function handleCategoryClick(event) {
  const target = event.target.closest('[data-category]');
  if (!target) return;

  selectedCategory = target.getAttribute('data-category') || 'All';
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
    // Abort previous playlist request so outdated network responses never overwrite current UI.
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

    groupedChannels = channels.reduce((accumulator, channel) => {
      const category = channel.category || 'Uncategorized';
      if (!accumulator[category]) {
        accumulator[category] = [];
      }
      accumulator[category].push(channel);
      return accumulator;
    }, {});

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

    const categoryMatch = line.match(/group-title="([^"]*)"/i);
    const category = categoryMatch?.[1]?.trim() || 'Uncategorized';

    const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
    const logo = logoMatch?.[1]?.trim() || undefined;

    const url = nextLine;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      parsedChannels.push({ name, url, category, logo });
    }
  }

  return parsedChannels;
}

function getCategories() {
  return Object.keys(groupedChannels).sort((left, right) => left.localeCompare(right));
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
  mounts.categoryTabs.innerHTML = renderCategoryTabs(getCategories(), selectedCategory);

  // Render only a window of channels to keep DOM light for very large playlists.
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

  // Debounce rapid taps to prevent overlapping destroy/create player cycles.
  switchDebounceTimer = setTimeout(() => {
    loadChannel(channel);
  }, SWITCH_DEBOUNCE_MS);
}

function loadChannel(channel, attempt = 0) {
  // Token invalidates stale async callbacks when users switch channels quickly.
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
    // Destroy hls.js instance before loading the next stream to release buffers/listeners.
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
