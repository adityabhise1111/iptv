import { renderChannelCard, type Channel } from './ChannelCard.tsx';

export function renderChannelGrid(channels: Channel[], selectedChannel: Channel | null) {
  if (channels.length === 0) {
    return `
      <div class="bg-gray-800 border border-gray-700 rounded-xl p-10 text-center text-gray-400 text-sm">
        No channels found
      </div>
    `;
  }

  const cards = channels
    .map((channel: Channel) => renderChannelCard(channel, selectedChannel?.url === channel.url))
    .join('');

  return `
    <div id="channelGrid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      ${cards}
    </div>
  `;
}
