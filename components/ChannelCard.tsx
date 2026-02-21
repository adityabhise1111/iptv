export interface Channel {
  name: string;
  url: string;
  category: string;
  logo?: string;
}

export function renderChannelCard(channel: Channel, isSelected: boolean) {
  const logo = channel.logo ? `
    <img
      src="${escapeAttribute(channel.logo)}"
      alt="${escapeAttribute(channel.name)} logo"
      class="w-12 h-12 rounded-md object-cover bg-gray-700"
      loading="lazy"
      referrerpolicy="no-referrer"
      onerror="this.remove()"
    />
  ` : '';

  const placeholder = `
    <div class="w-12 h-12 rounded-md bg-gray-700 flex items-center justify-center text-blue-300 font-bold text-lg">📺</div>
  `;

  return `
    <button
      type="button"
      data-channel-url="${escapeAttribute(channel.url)}"
      class="channel-card w-full text-left bg-gray-800 border rounded-xl p-3 transition hover:bg-gray-700 hover:-translate-y-0.5 ${
        isSelected ? 'border-blue-500 ring-1 ring-blue-500/70' : 'border-gray-700'
      }"
    >
      <div class="flex items-center gap-3">
        ${logo || placeholder}
        <div class="min-w-0">
          <p class="font-medium text-gray-100 truncate">${escapeHtml(channel.name)}</p>
          <p class="text-xs text-gray-400 truncate">${escapeHtml(channel.category || 'Uncategorized')}</p>
        </div>
      </div>
    </button>
  `;
}

function escapeHtml(value: string) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replaceAll('`', '&#096;');
}
