const IPTV_PLAYLIST_URL = 'https://iptv-org.github.io/iptv/index.m3u';

let channels = [];
let currentHls = null;

const elements = {
  searchInput: document.getElementById('searchInput'),
  channelList: document.getElementById('channelList'),
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

    const response = await fetch(IPTV_PLAYLIST_URL);
    if (!response.ok) throw new Error('Failed to fetch playlist');

    const text = await response.text();
    channels = parseM3U(text);

    elements.loadingState.classList.add('hidden');
    elements.channelList.classList.remove('hidden');

    renderChannels(channels);
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
        const url = nextLine;

        if (url && (url.startsWith('http') || url.startsWith('https'))) {
          parsedChannels.push({ name, url });
        }
      }
    }
  }

  return parsedChannels;
}

function renderChannels(channelsToRender) {
  elements.channelList.innerHTML = '';

  if (channelsToRender.length === 0) {
    elements.channelList.innerHTML = `
      <div class="text-center py-8 text-gray-400 text-sm">
        No channels found
      </div>
    `;
    return;
  }

  channelsToRender.forEach((channel, index) => {
    const channelItem = document.createElement('button');
    channelItem.className = 'w-full text-left px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
    channelItem.textContent = channel.name;
    channelItem.setAttribute('data-index', index);

    channelItem.addEventListener('click', () => playChannel(channel));

    elements.channelList.appendChild(channelItem);
  });
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
      video.addEventListener('loadedmetadata', hideStreamLoading);
      video.addEventListener('error', showStreamError);
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
    video.addEventListener('loadedmetadata', hideStreamLoading);
    video.addEventListener('error', showStreamError);
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

function filterChannels(searchTerm) {
  const filtered = channels.filter(channel =>
    channel.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  renderChannels(filtered);
}

elements.searchInput.addEventListener('input', (e) => {
  filterChannels(e.target.value);
});

elements.retryBtn.addEventListener('click', fetchPlaylist);

fetchPlaylist();
