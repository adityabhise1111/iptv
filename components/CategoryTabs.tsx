export function renderCategoryTabs(categories: string[], selectedCategory: string) {
  const tabs = ['All', ...categories].map((category) => {
    const isActive = category === selectedCategory;

    return `
      <button
        type="button"
        data-category="${escapeAttribute(category)}"
        class="category-tab shrink-0 px-4 py-2 rounded-full border text-sm transition ${
          isActive
            ? 'bg-blue-600 border-blue-500 text-white'
            : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white'
        }"
      >
        ${escapeHtml(category)}
      </button>
    `;
  }).join('');

  return `
    <section class="-mx-1">
      <div id="categoryTabs" class="flex gap-2 overflow-x-auto px-1 pb-2 scroll-smooth">
        ${tabs}
      </div>
    </section>
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
