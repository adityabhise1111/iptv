import { renderSearchBar } from './components/SearchBar.tsx';
import { renderVideoPlayer } from './components/VideoPlayer.tsx';
import { renderCategoryTabs } from './components/CategoryTabs.tsx';
import { renderChannelGrid } from './components/ChannelGrid.tsx';

const IPTV_PLAYLIST_URL = 'https://iptv-org.github.io/iptv/index.m3u';

let channels = [];
let groupedChannels = {};
let selectedChannel = null;
let selectedCategory = 'All';
let searchQuery = '';
let currentHls = null;
let searchDebounceTimer = null;

const mounts = {
  searchBar: document.getElementById('searchBarMount'),
  videoPlayer: document.getElementById('videoPlayerMount'),
  categoryTabs: document.getElementById('categoryTabsMount'),
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

  mounts.categoryTabs.addEventListener('click', handleCategoryClick);
  mounts.channelGrid.addEventListener('click', handleChannelClick);
}

function handleSearchInput(event) {
  const value = event.target.value;

  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }

  searchDebounceTimer = setTimeout(() => {
    searchQuery = value;
    renderDynamicUI();
  }, 180);
}

function handleCategoryClick(event) {
  const target = event.target.closest('[data-category]');
  if (!target) return;

  selectedCategory = target.getAttribute('data-category') || 'All';
  renderDynamicUI();
}

function handleChannelClick(event) {
  const target = event.target.closest('[data-channel-url]');
  if (!target) return;

  const channelUrl = target.getAttribute('data-channel-url');
  const channel = channels.find((item) => item.url === channelUrl);

  if (!channel) return;

  selectedChannel = channel;
  renderDynamicUI();
  playChannel(channel);
}

async function fetchPlaylist() {
  try {
    mounts.loadingState.classList.remove('hidden');
    mounts.errorState.classList.add('hidden');
    mounts.channelGrid.classList.add('hidden');

    const response = await fetch(IPTV_PLAYLIST_URL);
    if (!response.ok) throw new Error('Failed to fetch playlist');

    const text = await response.text();
    channels = parseM3U(text);

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

    renderDynamicUI();
  } catch (error) {
    console.error('Error fetching playlist:', error);
    mounts.loadingState.classList.add('hidden');
    mounts.errorState.classList.remove('hidden');
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
  mounts.channelGrid.innerHTML = renderChannelGrid(getFilteredChannels(), selectedChannel);
}

function playChannel(channel) {
  elements.placeholder.classList.add('hidden');
  elements.streamError.classList.add('hidden');
  elements.streamLoading.classList.remove('hidden');
  elements.videoPlayer.classList.remove('hidden');
  elements.nowPlaying.classList.remove('hidden');
  elements.currentChannel.textContent = channel.name;

  stopCurrentStream();

  const video = elements.videoPlayer;
  const streamUrl = channel.url;

  if (streamUrl.endsWith('.m3u8')) {
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.addEventListener('loadedmetadata', hideStreamLoading, { once: true });
      video.addEventListener('error', showStreamError, { once: true });
    } else if (window.Hls && Hls.isSupported()) {
      currentHls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90
      });

      currentHls.loadSource(streamUrl);
      currentHls.attachMedia(video);

      currentHls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch((error) => {
          console.error('Playback error:', error);
          showStreamError();
        });
        hideStreamLoading();
      });

      currentHls.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS error:', data);
        if (data.fatal) {
          showStreamError();
        }
      });
    } else {
      showStreamError();
    }
  } else {
    video.src = streamUrl;
    video.addEventListener('loadedmetadata', hideStreamLoading, { once: true });
    video.addEventListener('error', showStreamError, { once: true });
  }
}

function stopCurrentStream() {
  if (currentHls) {
    currentHls.destroy();
    currentHls = null;
  }

  elements.videoPlayer.pause();
  elements.videoPlayer.src = '';
  elements.videoPlayer.load();
}

function hideStreamLoading() {
  elements.streamLoading.classList.add('hidden');
}

function showStreamError() {
  elements.streamLoading.classList.add('hidden');
  elements.streamError.classList.remove('hidden');
}

initializeStaticUI();
fetchPlaylist();
