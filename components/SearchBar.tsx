export function renderSearchBar(searchQuery: string = '') {
  return `
    <div class="bg-gray-800 border border-gray-700 rounded-xl p-3">
      <label for="searchInput" class="sr-only">Search channels</label>
      <input
        id="searchInput"
        type="text"
        value="${escapeHtml(searchQuery)}"
        placeholder="Search channels..."
        class="w-full px-4 py-3 bg-gray-700 text-gray-100 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
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
