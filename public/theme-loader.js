// Load user's theme preference and apply it
async function loadTheme() {
  try {
    const response = await fetch('/api/theme');
    const data = await response.json();
    const theme = data.theme || 'blue';
    applyTheme(theme);
  } catch (err) {
    console.error('Error loading theme:', err);
    applyTheme('blue'); // Default to blue theme
  }
}

// Apply theme by setting the data-theme attribute
function applyTheme(theme) {
  document.documentElement.setAttribute('class', `theme-${theme}`);
  sessionStorage.setItem('currentTheme', theme);
}

// Load theme when page loads
document.addEventListener('DOMContentLoaded', loadTheme);

// Also load theme immediately if document has already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadTheme);
} else {
  loadTheme();
}
