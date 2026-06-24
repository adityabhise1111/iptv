import { renderSearchBar } from './components/SearchBar.tsx';
import { renderVideoPlayer } from './components/VideoPlayer.tsx';
import { renderCategoryTabs } from './components/CategoryTabs.tsx';
import { renderChannelGrid } from './components/ChannelGrid.tsx';
import React from 'react';
import { createRoot } from 'react-dom/client';
import ReactPlayer from 'react-player';

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
let reactPlayerRoot = null;
let playerState = {
  streamUrl: '',
  isLoading: false,
  hasError: false,
  switchToken: 0,
  attempt: 0
};

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

function PlayerSurface({
  streamUrl,
  isLoading,
  hasError,
  onReady,
  onPlaying,
  onWaiting,
  onError
}) {
  const hasStream = Boolean(streamUrl);

  return React.createElement(
    'div',
    { className: 'relative' },
    !hasStream
      ? React.createElement(
          'div',
          { className: 'aspect-video bg-gray-700 md:rounded-lg flex items-center justify-center' },
          React.createElement(
            'div',
            { className: 'text-center px-6' },
            React.createElement(
              'svg',
              { className: 'w-16 h-16 mx-auto text-gray-600 mb-3', fill: 'currentColor', viewBox: '0 0 20 20' },
              React.createElement('path', { d: 'M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z' })
            ),
            React.createElement('p', { className: 'text-gray-400' }, 'Select a channel to start watching')
          )
        )
      : React.createElement(
          'div',
          { className: 'w-full aspect-video md:rounded-lg overflow-hidden bg-black' },
          React.createElement(ReactPlayer, {
            src: streamUrl,
            width: '100%',
            height: '100%',
            controls: true,
            playing: true,
            playsInline: true,
            onReady,
            onPlaying,
            onWaiting,
            onError,
            config: {
              file: {
                forceHLS: isHlsStream(streamUrl),
                hlsOptions: {
                  enableWorker: true,
                  lowLatencyMode: true,
                  backBufferLength: 30,
                  maxBufferLength: 20,
                  maxMaxBufferLength: 30,
                  liveSyncDurationCount: 3,
                  manifestLoadingTimeOut: 12000,
                  fragLoadingTimeOut: 15000
                }
              }
            }
          })
        ),
    React.createElement(
      'div',
      {
        className: `absolute inset-0 bg-gray-900/75 md:rounded-lg flex items-center justify-center ${isLoading ? '' : 'hidden'}`
      },
      React.createElement(
        'div',
        { className: 'text-center' },
        React.createElement('div', { className: 'animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-3' }),
        React.createElement('p', { className: 'text-gray-300' }, 'Loading stream...')
      )
    ),
    React.createElement(
      'div',
      {
        className: `absolute inset-0 bg-gray-900/90 md:rounded-lg flex items-center justify-center ${hasError ? '' : 'hidden'}`
      },
      React.createElement(
        'div',
        { className: 'text-center p-6' },
        React.createElement(
          'svg',
          { className: 'w-12 h-12 mx-auto text-red-500 mb-3', fill: 'currentColor', viewBox: '0 0 20 20' },
          React.createElement('path', {
            fillRule: 'evenodd',
            d: 'M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z',
            clipRule: 'evenodd'
          })
        ),
        React.createElement('p', { className: 'text-red-400 font-medium mb-2' }, 'Stream unavailable'),
        React.createElement('p', { className: 'text-gray-400 text-sm' }, 'This channel may be offline or blocked in your region')
      )
    )
  );
}

function initializeReactPlayer() {
  if (!elements.reactPlayerMount) {
    return;
  }

  reactPlayerRoot = createRoot(elements.reactPlayerMount);
  renderReactPlayer();
}

function renderReactPlayer() {
  if (!reactPlayerRoot) {
    return;
  }

  const switchToken = playerState.switchToken;

  reactPlayerRoot.render(
    React.createElement(PlayerSurface, {
      streamUrl: playerState.streamUrl,
      isLoading: playerState.isLoading,
      hasError: playerState.hasError,
      onReady: () => handlePlayerReady(switchToken),
      onPlaying: () => handlePlayerPlaying(switchToken),
      onWaiting: () => handlePlayerWaiting(switchToken),
      onError: (error) => handlePlayerError(error, switchToken)
    })
  );
}

function updatePlayerState(nextState) {
  playerState = { ...playerState, ...nextState };
  renderReactPlayer();
}

function initializeStaticUI() {
  mounts.searchBar.innerHTML = renderSearchBar(searchQuery);
  mounts.videoPlayer.innerHTML = renderVideoPlayer();

  elements = {
    searchInput: document.getElementById('searchInput'),
    searchBarContainer: document.getElementById('searchBarContainer'),
    reactPlayerMount: document.getElementById('reactPlayerRoot'),
    nowPlaying: document.getElementById('nowPlaying'),
    currentChannel: document.getElementById('currentChannel')
  };

  initializeReactPlayer();

  ensureCategoryTabsRendered();

  // Derive initial state from the DOM so desktop (md:block) shows correctly
  searchBarVisible = !elements.searchBarContainer.classList.contains('hidden');
  mounts.searchToggleBtn.setAttribute('aria-expanded', String(searchBarVisible));
  mounts.searchToggleBtn.setAttribute('aria-controls', 'searchBarContainer');

  elements.searchInput.addEventListener('input', handleSearchInput);
  mounts.searchToggleBtn.addEventListener('click', handleSearchToggle);
  mounts.retryBtn.addEventListener('click', fetchPlaylist);
  mounts.contentArea.addEventListener('scroll', handleContentScroll, { passive: true });

  mounts.categoryTabs.addEventListener('click', handleCategoryClick);
  mounts.channelGrid.addEventListener('click', handleChannelClick);

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
  mounts.searchToggleBtn.setAttribute('aria-expanded', String(searchBarVisible));

  if (searchBarVisible) {
    elements.searchBarContainer.classList.remove('hidden');
    elements.searchInput.focus();
  } else {
    elements.searchBarContainer.classList.add('hidden');
    elements.searchInput.blur();
    mounts.searchToggleBtn.focus();
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

  elements.nowPlaying.classList.remove('hidden');
  elements.currentChannel.textContent = channel.name;

  if (autoRetryTimer) {
    clearTimeout(autoRetryTimer);
    autoRetryTimer = null;
  }

  updatePlayerState({
    streamUrl: channel.url,
    isLoading: true,
    hasError: false,
    switchToken,
    attempt
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

function handlePlayerReady(switchToken) {
  if (switchToken !== activeSwitchToken) {
    return;
  }

  hideStreamLoading();
}

function handlePlayerPlaying(switchToken) {
  if (switchToken !== activeSwitchToken) {
    return;
  }

  hideStreamLoading();
}

function handlePlayerWaiting(switchToken) {
  if (switchToken !== activeSwitchToken) {
    return;
  }

  showStreamLoading();
}

function handlePlayerError(error, switchToken) {
  if (switchToken !== activeSwitchToken) {
    return;
  }

  if (!selectedChannel) {
    showStreamError();
    return;
  }

  console.error('Playback error:', error);
  retryOrFail(selectedChannel, playerState.attempt, switchToken);
}

function showStreamLoading() {
  if (!selectedChannel) {
    return;
  }

  updatePlayerState({ isLoading: true, hasError: false });
}

function stopCurrentStream() {
  if (autoRetryTimer) {
    clearTimeout(autoRetryTimer);
    autoRetryTimer = null;
  }

  updatePlayerState({
    streamUrl: '',
    isLoading: false,
    hasError: false
  });
}

function hideStreamLoading() {
  updatePlayerState({ isLoading: false, hasError: false });

  if (selectedChannel) {
    try {
      localStorage.setItem('lastPlayedChannelUrl', selectedChannel.url);
    } catch (_error) {
      // Ignore storage limitations for private/incognito sessions.
    }
  }
}

function showStreamError() {
  updatePlayerState({ isLoading: false, hasError: true });
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
