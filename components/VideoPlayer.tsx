export function renderVideoPlayer() {
  return `
    <section class="bg-gray-800 border border-gray-700 rounded-xl p-4 md:p-6">
      <div id="playerContainer" class="relative">
        <div id="placeholder" class="aspect-video bg-gray-700 rounded-lg flex items-center justify-center">
          <div class="text-center px-6">
            <svg class="w-16 h-16 mx-auto text-gray-600 mb-3" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
            </svg>
            <p class="text-gray-400">Select a channel to start watching</p>
          </div>
        </div>

        <video id="videoPlayer" class="w-full aspect-video rounded-lg hidden" controls autoplay playsinline preload="none"></video>

        <div id="streamLoading" class="absolute inset-0 bg-gray-900/75 rounded-lg flex items-center justify-center hidden">
          <div class="text-center">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-3"></div>
            <p class="text-gray-300">Loading stream...</p>
          </div>
        </div>

        <div id="streamError" class="absolute inset-0 bg-gray-900/90 rounded-lg flex items-center justify-center hidden">
          <div class="text-center p-6">
            <svg class="w-12 h-12 mx-auto text-red-500 mb-3" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
            </svg>
            <p class="text-red-400 font-medium mb-2">Stream unavailable</p>
            <p class="text-gray-400 text-sm">This channel may be offline or blocked in your region</p>
          </div>
        </div>
      </div>

      <div id="nowPlaying" class="mt-4 hidden">
        <p class="text-sm text-gray-400">Now Playing</p>
        <p id="currentChannel" class="text-lg font-semibold text-gray-100"></p>
      </div>
    </section>
  `;
}
