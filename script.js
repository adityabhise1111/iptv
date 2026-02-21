const IPTV_PLAYLIST_URL = 'https://iptv-org.github.io/iptv/index.m3u';

// Category display order (iptv-org standard group-title values)
const CATEGORY_ORDER = [
  'News', 'Kids', 'Entertainment', 'Sports', 'Movies', 'Music',
  'Documentary', 'Cooking', 'Travel', 'Science', 'Education',
  'Lifestyle', 'Religion', 'Business', 'Auto', 'Family',
  'Animated', 'Action', 'Classic', 'Comedy', 'Horror', 'Romance',
  'Series', 'Weather', 'XXX', 'Other'
];

let channels = [];
let currentHls = null;
let activeCategory = 'All';

const elements = {
  searchInput: document.getElementById('searchInput'),
  channelList: document.getElementById('channelList'),
  categoryTabs: document.getElementById('categoryTabs'),
  loadingState: document.getElementById('loadingState'),
  errorState: document.getElementById('errorState'),
  retryBtn: document.getElementById('retryBtn'),
  videoPlayer: document.getElementById('videoPlayer'),
  placeholder: document.getElementById('placeholder'),
  streamLoading: document.getElementById('streamLoading'),
  streamError: document.getElementById('streamError'),
  nowPlaying: document.getElementById('nowPlaying'),
  currentChannel: document.getElementById('currentChannel')
};

async function fetchPlaylist() {
  try {
    elements.loadingState.classList.remove('hidden');
    elements.errorState.classList.add('hidden');
    elements.channelList.classList.add('hidden');
    elements.categoryTabs.innerHTML = '';

    const response = await fetch(IPTV_PLAYLIST_URL);
    if (!response.ok) throw new Error('Failed to fetch playlist');

    const text = await response.text();
    channels = parseM3U(text);

    elements.loadingState.classList.add('hidden');
    elements.channelList.classList.remove('hidden');

    renderCategoryTabs();
    renderChannels(getFilteredChannels());
  } catch (error) {
    console.error('Error fetching playlist:', error);
    elements.loadingState.classList.add('hidden');
    elements.errorState.classList.remove('hidden');
  }
}

function parseM3U(text) {
  const lines = text.split('\n');
  const parsedChannels = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('#EXTINF:')) {
      const nextLine = lines[i + 1]?.trim();

      if (nextLine && !nextLine.startsWith('#')) {
        const nameMatch = line.match(/,(.+)$/);
        const name = nameMatch ? nameMatch[1].trim() : 'Unknown Channel';
        const logoMatch = line.match(/tvg-logo="([^"]+)"/);
        const rawLogo = logoMatch ? logoMatch[1].trim() : '';
        const logo = /^https?:\/\//i.test(rawLogo) ? rawLogo : '';
        const groupMatch = line.match(/group-title="([^"]+)"/);
        const group = groupMatch ? groupMatch[1].trim() : 'Other';
        const url = nextLine;

        if (url && (url.startsWith('http') || url.startsWith('https'))) {
          parsedChannels.push({ name, url, logo, group });
        }
      }
    }
  }

  return parsedChannels;
}

function getCategories() {
  const groupSet = new Set(channels.map(c => c.group));
  const ordered = CATEGORY_ORDER.filter(g => groupSet.has(g));
  const rest = [...groupSet].filter(g => !CATEGORY_ORDER.includes(g)).sort();
  return ['All', ...ordered, ...rest];
}

function renderCategoryTabs() {
  const categories = getCategories();
  elements.categoryTabs.innerHTML = '';

  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.textContent = cat;
    btn.dataset.category = cat;
    btn.className = getCategoryTabClass(cat === activeCategory);
    btn.addEventListener('click', () => {
      activeCategory = cat;
      document.querySelectorAll('#categoryTabs button').forEach(b => {
        b.className = getCategoryTabClass(b.dataset.category === activeCategory);
      });
      elements.searchInput.value = '';
      renderChannels(getFilteredChannels());
    });
    elements.categoryTabs.appendChild(btn);
  });
}

function getCategoryTabClass(active) {
  const base = 'px-4 py-1.5 rounded-full text-sm font-medium transition whitespace-nowrap';
  return active
    ? `${base} bg-blue-600 text-white`
    : `${base} bg-gray-800 text-gray-300 hover:bg-gray-700`;
}

function getFilteredChannels() {
  const search = elements.searchInput.value.toLowerCase();
  return channels.filter(ch => {
    const matchesCategory = activeCategory === 'All' || ch.group === activeCategory;
    const matchesSearch = !search || ch.name.toLowerCase().includes(search);
    return matchesCategory && matchesSearch;
  });
}

function renderChannels(channelsToRender) {
  elements.channelList.innerHTML = '';

  if (channelsToRender.length === 0) {
    elements.channelList.innerHTML = `
      <div class="col-span-full text-center py-12 text-gray-400 text-sm">
        No channels found
      </div>
    `;
    return;
  }

  channelsToRender.forEach(channel => {
    const card = document.createElement('button');
    card.className = 'flex flex-col items-center gap-2 p-3 bg-gray-800 hover:bg-gray-700 rounded-xl transition focus:outline-none focus:ring-2 focus:ring-blue-500 text-center group';

    const logoHtml = channel.logo
      ? `<img src="${channel.logo}" alt="${escapeHtml(channel.name)} logo" class="w-12 h-12 object-contain rounded-lg bg-gray-700 p-1" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />`
      : '';
    const fallbackHtml = `<div class="${channel.logo ? 'hidden' : 'flex'} w-12 h-12 items-center justify-center rounded-lg bg-gray-700 text-gray-400 text-xl">📺</div>`;

    card.innerHTML = `
      ${logoHtml}
      ${fallbackHtml}
      <span class="text-xs text-gray-300 group-hover:text-white leading-tight line-clamp-2 w-full">${escapeHtml(channel.name)}</span>
    `;

    card.addEventListener('click', () => playChannel(channel));
    elements.channelList.appendChild(card);
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

  const baseUrl = streamUrl.split('?')[0];
  if (baseUrl.endsWith('.m3u8')) {
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.addEventListener('loadedmetadata', hideStreamLoading, { once: true });
      video.addEventListener('error', showStreamError, { once: true });
    } else if (Hls.isSupported()) {
      currentHls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90
      });

      currentHls.loadSource(streamUrl);
      currentHls.attachMedia(video);

      currentHls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(err => {
          console.error('Playback error:', err);
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

elements.searchInput.addEventListener('input', () => {
  renderChannels(getFilteredChannels());
});

elements.retryBtn.addEventListener('click', fetchPlaylist);

fetchPlaylist();
