export function renderVideoPlayer() {
  return `
    <section class="bg-gray-800 md:border md:border-gray-700 md:rounded-xl p-0 md:p-6">
      <div id="playerContainer" class="relative">
        <div id="reactPlayerRoot"></div>
      </div>

      <div id="nowPlaying" class="mt-2 md:mt-4 px-2 md:px-0 hidden">
        <p class="text-sm text-gray-400">Now Playing</p>
        <p id="currentChannel" class="text-lg font-semibold text-gray-100"></p>
      </div>
    </section>
  `;
}
