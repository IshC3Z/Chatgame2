/**
 * Notifications Studio - Single Clip 4K MP4 Generator & Exporter
 * Supports broadcast-grade 4K MP4 @ 60 FPS via static FFmpeg
 */

// ==========================================================================
// 1. Data Defaults & State
// ==========================================================================

const DEFAULT_CHARACTERS = [
  {
    id: 'char_linda',
    name: 'Linda',
    avatar: '/assets/avatars/linda.jpg'
  },
  {
    id: 'char_teta',
    name: 'Teta',
    avatar: '/assets/avatars/teta.jpg'
  }
];

const DEFAULT_SAVED_NOTIFS = [
  {
    id: 'notif_demo_1',
    charId: 'char_linda',
    senderName: 'Linda',
    avatar: '/assets/avatars/linda.jpg',
    message: 'Hey! Are you ready for tonight’s game? Let me know ASAP! 🎉',
    timeText: 'now',
    duration: 3.5,
    theme: 'black'
  },
  {
    id: 'notif_demo_2',
    charId: 'char_teta',
    senderName: 'Teta',
    avatar: '/assets/avatars/teta.jpg',
    message: 'Linda told me you are coming! Don’t forget the extra controller 🎮',
    timeText: 'now',
    duration: 3.0,
    theme: 'white'
  }
];

let characters = [];
let savedNotifs = [];
let activeNotifId = null;
let activeCharId = null;

// Display & Export State (Stable 16:9 Landscape)
let currentRatio = '16:9';
let currentTheme = 'black'; // 'black' or 'white'
let displayMode = 'all'; // 'all' (All Stacked) or 'current' (Current Only)
let isPreviewing = false;
let previewTimeoutId = null;
let isExporting = false;


// ==========================================================================
// 2. DOM Elements
// ==========================================================================

// Header
const loadDemoBtn = document.getElementById('loadDemoBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeMoonIcon = document.getElementById('themeMoonIcon');
const themeSunIcon = document.getElementById('themeSunIcon');
const themeToggleText = document.getElementById('themeToggleText');

// Characters Section & Modal
const characterChipsRow = document.getElementById('characterChipsRow');
const openAddCharModalBtn = document.getElementById('openAddCharModalBtn');
const charModal = document.getElementById('charModal');
const charModalTitle = document.getElementById('charModalTitle');
const closeCharModalBtn = document.getElementById('closeCharModalBtn');
const cancelCharModalBtn = document.getElementById('cancelCharModalBtn');
const saveCharModalBtn = document.getElementById('saveCharModalBtn');
const modalDeleteCharBtn = document.getElementById('modalDeleteCharBtn');
const editingCharId = document.getElementById('editingCharId');
const charNameInput = document.getElementById('charNameInput');
const charPhotoFileInput = document.getElementById('charPhotoFileInput');
const charAvatarPreviewImg = document.getElementById('charAvatarPreviewImg');
const charAvatarPlaceholder = document.getElementById('charAvatarPlaceholder');
let tempUploadedAvatarData = null;

// Composer Section
const composerHeading = document.getElementById('composerHeading');
const btnNewNotif = document.getElementById('btnNewNotif');
const composerSenderSelect = document.getElementById('composerSenderSelect');
const composerMessageInput = document.getElementById('composerMessageInput');
const composerTimeInput = document.getElementById('composerTimeInput');
const composerDurationRange = document.getElementById('composerDurationRange');
const durationValueBadge = document.getElementById('durationValueBadge');
const charCount = document.getElementById('charCount');
const saveNotifBtn = document.getElementById('saveNotifBtn');
const saveNotifBtnText = document.getElementById('saveNotifBtnText');
const saveAsNewNotifBtn = document.getElementById('saveAsNewNotifBtn');

// Saved List Section
const savedNotifsList = document.getElementById('savedNotifsList');
const savedCountMeta = document.getElementById('savedCountMeta');
const btnHeaderAddNotif = document.getElementById('btnHeaderAddNotif');

// Display Screen (Stable 16:9 Landscape)
const stageFrame = document.getElementById('stageFrame');
const ratioBadgeText = document.getElementById('ratioBadgeText');
const displayContainer = document.getElementById('displayContainer');
const stageModeAllBtn = document.getElementById('stageModeAllBtn');
const stageModeCurrentBtn = document.getElementById('stageModeCurrentBtn');

// Notification Color Style (Black / White)
const themeBlackBtn = document.getElementById('themeBlackBtn');
const themeWhiteBtn = document.getElementById('themeWhiteBtn');

// Footer Actions
const previewNotifBtn = document.getElementById('previewNotifBtn');
const previewBtnIcon = document.getElementById('previewBtnIcon');
const previewBtnText = document.getElementById('previewBtnText');
const download4kBtn = document.getElementById('download4kBtn');
const recordBtnText = document.getElementById('recordBtnText');
const recordSpinner = document.getElementById('recordSpinner');
const recordIcon = document.getElementById('recordIcon');

// Progress Bar
const videoProgressContainer = document.getElementById('videoProgressContainer');
const progressBar = document.getElementById('progressBar');
const progressPercentage = document.getElementById('progressPercentage');
const progressStatusText = document.getElementById('progressStatusText');
const progressDetailText = document.getElementById('progressDetailText');
const progressEtaText = document.getElementById('progressEtaText');
const progressSpinner = document.getElementById('progressSpinner');

// ==========================================================================
// 3. App Initialization
// ==========================================================================

function initApp() {
  loadCharacters();
  loadSavedNotifs();
  setupEventListeners();

  renderCharacterChips();
  populateComposerSenderSelect();
  renderSavedNotifsList();

  // Load active notification onto screen
  if (savedNotifs.length > 0) {
    setActiveNotification(savedNotifs[0].id);
  } else {
    loadNewNotificationForm();
  }

  renderDisplayStage();
}

function loadCharacters() {
  try {
    const saved = localStorage.getItem('chatgame_notif_characters');
    if (saved) {
      characters = JSON.parse(saved);
    } else {
      characters = [...DEFAULT_CHARACTERS];
      saveCharacters();
    }
  } catch (e) {
    characters = [...DEFAULT_CHARACTERS];
  }
  if (characters.length > 0) {
    activeCharId = characters[0].id;
  }
}

function saveCharacters() {
  try {
    localStorage.setItem('chatgame_notif_characters', JSON.stringify(characters));
  } catch (e) {}
}

function loadSavedNotifs() {
  try {
    const saved = localStorage.getItem('chatgame_saved_notifs');
    if (saved) {
      savedNotifs = JSON.parse(saved);
    } else {
      savedNotifs = [...DEFAULT_SAVED_NOTIFS];
      saveSavedNotifs();
    }
  } catch (e) {
    savedNotifs = [...DEFAULT_SAVED_NOTIFS];
  }
}

function saveSavedNotifs() {
  try {
    localStorage.setItem('chatgame_saved_notifs', JSON.stringify(savedNotifs));
  } catch (e) {}
  if (savedCountMeta) {
    savedCountMeta.textContent = `${savedNotifs.length} saved`;
  }
}

// ==========================================================================
// 4. Character Management
// ==========================================================================

function renderCharacterChips() {
  if (!characterChipsRow) return;
  characterChipsRow.innerHTML = '';

  characters.forEach((char) => {
    const chip = document.createElement('div');
    chip.className = `char-chip ${char.id === activeCharId ? 'active' : ''}`;
    chip.dataset.id = char.id;

    const avatarElem = char.avatar
      ? `<img src="${char.avatar}" class="char-chip-avatar" alt="${escapeHtml(char.name)}">`
      : `<div class="char-chip-avatar">${escapeHtml(char.name.charAt(0))}</div>`;

    chip.innerHTML = `
      ${avatarElem}
      <span class="char-chip-name">${escapeHtml(char.name)}</span>
      <div class="char-chip-actions">
        <button type="button" class="char-action-btn char-edit-btn" title="Customize ${escapeHtml(char.name)}">
          <span class="material-symbols-outlined">edit</span>
        </button>
        <button type="button" class="char-action-btn char-delete-btn" title="Delete ${escapeHtml(char.name)}">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
    `;

    // Clicking chip body selects character
    chip.addEventListener('click', (e) => {
      if (e.target.closest('.char-chip-actions')) return;
      setActiveCharacter(char.id);
    });

    // Edit / Customize button
    const editBtn = chip.querySelector('.char-edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openCustomizeCharacterModal(char.id);
      });
    }

    // Delete button
    const delBtn = chip.querySelector('.char-delete-btn');
    if (delBtn) {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteCharacter(char.id);
      });
    }

    characterChipsRow.appendChild(chip);
  });
}

function setActiveCharacter(charId) {
  activeCharId = charId;
  renderCharacterChips();
  if (composerSenderSelect) {
    composerSenderSelect.value = charId;
  }
  updateDisplayBannerLive();
}

function populateComposerSenderSelect() {
  if (!composerSenderSelect) return;
  composerSenderSelect.innerHTML = '';

  characters.forEach((char) => {
    const opt = document.createElement('option');
    opt.value = char.id;
    opt.textContent = char.name;
    if (char.id === activeCharId) opt.selected = true;
    composerSenderSelect.appendChild(opt);
  });

  composerSenderSelect.addEventListener('change', (e) => {
    setActiveCharacter(e.target.value);
  });
}

// Open modal for Adding New Character
function openAddCharacterModal() {
  if (!charModal) return;
  if (charModalTitle) charModalTitle.textContent = 'Add New Character';
  if (editingCharId) editingCharId.value = '';
  if (charNameInput) {
    charNameInput.value = '';
    charNameInput.focus();
  }
  tempUploadedAvatarData = null;
  if (charAvatarPreviewImg) {
    charAvatarPreviewImg.src = '';
    charAvatarPreviewImg.classList.add('hidden');
  }
  if (charAvatarPlaceholder) {
    charAvatarPlaceholder.classList.remove('hidden');
  }
  if (modalDeleteCharBtn) modalDeleteCharBtn.classList.add('hidden');
  if (saveCharModalBtn) saveCharModalBtn.textContent = 'Save Character';

  charModal.classList.add('is-open');
}

// Open modal for Customizing / Editing Existing Character
function openCustomizeCharacterModal(charId) {
  const char = characters.find(c => c.id === charId);
  if (!char || !charModal) return;

  if (charModalTitle) charModalTitle.textContent = `Customize "${char.name}"`;
  if (editingCharId) editingCharId.value = char.id;
  if (charNameInput) {
    charNameInput.value = char.name;
    charNameInput.focus();
  }

  tempUploadedAvatarData = char.avatar || null;
  if (char.avatar && charAvatarPreviewImg) {
    charAvatarPreviewImg.src = char.avatar;
    charAvatarPreviewImg.classList.remove('hidden');
    if (charAvatarPlaceholder) charAvatarPlaceholder.classList.add('hidden');
  } else {
    if (charAvatarPreviewImg) charAvatarPreviewImg.classList.add('hidden');
    if (charAvatarPlaceholder) charAvatarPlaceholder.classList.remove('hidden');
  }

  // Show delete button inside customize modal
  if (modalDeleteCharBtn) {
    modalDeleteCharBtn.classList.remove('hidden');
    modalDeleteCharBtn.onclick = () => {
      deleteCharacter(char.id);
    };
  }

  if (saveCharModalBtn) saveCharModalBtn.textContent = 'Update Character';
  charModal.classList.add('is-open');
}

function closeCharModal() {
  if (charModal) charModal.classList.remove('is-open');
}

if (openAddCharModalBtn) openAddCharModalBtn.addEventListener('click', openAddCharacterModal);
if (closeCharModalBtn) closeCharModalBtn.addEventListener('click', closeCharModal);
if (cancelCharModalBtn) cancelCharModalBtn.addEventListener('click', closeCharModal);

// Delete character logic
function deleteCharacter(charId) {
  if (characters.length <= 1) {
    alert('You need to keep at least one character in your roster.');
    return;
  }

  const char = characters.find(c => c.id === charId);
  const charName = char ? char.name : 'this character';

  if (!confirm(`Are you sure you want to delete character "${charName}"?`)) {
    return;
  }

  characters = characters.filter(c => c.id !== charId);
  saveCharacters();

  // If deleted character was active, pick the first remaining character
  if (activeCharId === charId) {
    activeCharId = characters[0].id;
  }

  renderCharacterChips();
  populateComposerSenderSelect();
  setActiveCharacter(activeCharId);
  closeCharModal();
}

// Upload character photo
if (charPhotoFileInput) {
  charPhotoFileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      tempUploadedAvatarData = loadEvent.target.result;
      if (charAvatarPreviewImg) {
        charAvatarPreviewImg.src = tempUploadedAvatarData;
        charAvatarPreviewImg.classList.remove('hidden');
      }
      if (charAvatarPlaceholder) {
        charAvatarPlaceholder.classList.add('hidden');
      }
    };
    reader.readAsDataURL(file);
  });
}

// Save or Update character form submit
if (saveCharModalBtn) {
  saveCharModalBtn.addEventListener('click', () => {
    const name = charNameInput?.value?.trim();
    if (!name) {
      alert('Please enter a character name.');
      charNameInput?.focus();
      return;
    }

    const editId = editingCharId?.value;

    if (editId) {
      // Update existing character
      const existing = characters.find(c => c.id === editId);
      if (existing) {
        existing.name = name;
        if (tempUploadedAvatarData) {
          existing.avatar = tempUploadedAvatarData;
        }

        // Also update any saved notifications for this character
        savedNotifs.forEach(notif => {
          if (notif.charId === editId) {
            notif.senderName = name;
            if (tempUploadedAvatarData) notif.avatar = tempUploadedAvatarData;
          }
        });
        saveSavedNotifs();
        renderSavedNotifsList();
      }
      saveCharacters();
      renderCharacterChips();
      populateComposerSenderSelect();
      setActiveCharacter(editId);
    } else {
      // Add new character
      const newCharId = `char_${Date.now()}`;
      let avatarUrl = tempUploadedAvatarData;
      if (!avatarUrl) {
        avatarUrl = generateInitialsAvatar(name);
      }

      const newChar = {
        id: newCharId,
        name,
        avatar: avatarUrl
      };

      characters.push(newChar);
      saveCharacters();

      renderCharacterChips();
      populateComposerSenderSelect();
      setActiveCharacter(newCharId);
    }

    closeCharModal();
  });
}

function generateInitialsAvatar(name) {
  const initial = (name.charAt(0) || 'U').toUpperCase();
  const colors = ['#0b57d0', '#673ab7', '#e91e63', '#009688', '#ff5722', '#3f51b5'];
  const color = colors[Math.abs(name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % colors.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <circle cx="64" cy="64" r="64" fill="${color}"/>
    <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="#ffffff" font-family="-apple-system, Roboto, sans-serif" font-size="62" font-weight="600">${initial}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ==========================================================================
// ==========================================================================
// 5. Active Notification & Multi-Notification Screen Display
// ==========================================================================

function getActiveNotification() {
  return savedNotifs.find(n => n.id === activeNotifId) || null;
}

function renderDisplayStage() {
  if (!displayContainer) return;
  displayContainer.innerHTML = '';

  let notifsToRender = [];
  if (displayMode === 'current') {
    const active = getActiveNotification();
    if (active) {
      notifsToRender = [active];
    } else {
      // Draft mode
      const char = characters.find(c => c.id === activeCharId) || characters[0];
      notifsToRender = [{
        id: 'draft',
        charId: char?.id,
        senderName: char ? char.name : 'Linda',
        avatar: char ? char.avatar : '/assets/avatars/linda.jpg',
        message: composerMessageInput?.value?.trim() || 'Type your notification message...',
        timeText: composerTimeInput?.value?.trim() || 'now',
        theme: currentTheme
      }];
    }
  } else {
    // 'all' stacked mode
    if (savedNotifs.length > 0) {
      notifsToRender = savedNotifs;
    } else {
      const char = characters.find(c => c.id === activeCharId) || characters[0];
      notifsToRender = [{
        id: 'draft',
        charId: char?.id,
        senderName: char ? char.name : 'Linda',
        avatar: char ? char.avatar : '/assets/avatars/linda.jpg',
        message: composerMessageInput?.value?.trim() || 'Type your notification message...',
        timeText: composerTimeInput?.value?.trim() || 'now',
        theme: currentTheme
      }];
    }
  }

  notifsToRender.forEach((item, index) => {
    const card = document.createElement('div');
    const isSelected = item.id === activeNotifId;
    const itemTheme = item.theme === 'white' ? 'white' : 'black';
    card.className = `ios-banner-card theme-${itemTheme} is-visible ${isSelected ? 'is-selected-card' : ''}`;
    card.dataset.notifId = item.id || '';
    card.dataset.index = index;

    const char = characters.find(c => c.id === item.charId);
    const avatarSrc = item.avatar || (char ? char.avatar : '/assets/avatars/linda.jpg');
    const senderName = item.senderName || (char ? char.name : 'Linda');
    const timeText = item.timeText || 'now';
    const message = item.message || '';

    card.innerHTML = `
      <div class="banner-avatar-wrap">
        <img src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(senderName)}" class="banner-avatar-img" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'44\\' height=\\'44\\'><circle cx=\\'22\\' cy=\\'22\\' r=\\'22\\' fill=\\'%230b57d0\\'/><text x=\\'50%\\' y=\\'55%\\' text-anchor=\\'middle\\' dominant-baseline=\\'middle\\' fill=\\'white\\' font-size=\\'20\\' font-family=\\'system-ui\\'>${escapeHtml(senderName.charAt(0))}</text></svg>'">
      </div>
      <div class="banner-content">
        <div class="banner-header">
          <span class="banner-title">${escapeHtml(senderName)}</span>
          <span class="banner-time">${escapeHtml(timeText)}</span>
        </div>
        <div class="banner-message">
          <span class="banner-message-text">${escapeHtml(message)}</span>
        </div>
      </div>
    `;

    // Clicking card on stage selects it for editing
    if (item.id && item.id !== 'draft') {
      card.addEventListener('click', () => {
        setActiveNotification(item.id);
      });
    }

    displayContainer.appendChild(card);
  });
}

function setActiveNotification(notifId) {
  activeNotifId = notifId;
  const notif = getActiveNotification();
  if (!notif) return;

  // Set notification color style (black vs white)
  setNotificationTheme(notif.theme || 'black');

  // Populate composer fields for editing
  if (composerSenderSelect) composerSenderSelect.value = notif.charId;
  activeCharId = notif.charId;
  renderCharacterChips();

  if (composerMessageInput) composerMessageInput.value = notif.message;
  if (charCount) charCount.textContent = `${notif.message.length} / 140`;
  if (composerTimeInput) composerTimeInput.value = notif.timeText || 'now';
  if (composerDurationRange) composerDurationRange.value = notif.duration || 3.0;
  if (durationValueBadge) durationValueBadge.textContent = `${parseFloat(notif.duration || 3.0).toFixed(1)}s`;

  if (composerHeading) composerHeading.textContent = 'Edit Notification';
  if (saveNotifBtnText) saveNotifBtnText.textContent = 'Update Notification';

  renderDisplayStage();
  renderSavedNotifsList();
}

function loadNewNotificationForm() {
  activeNotifId = null;
  setNotificationTheme('black');
  if (composerHeading) composerHeading.textContent = 'Create Notification';
  if (composerMessageInput) composerMessageInput.value = '';
  if (charCount) charCount.textContent = '0 / 140';
  if (composerTimeInput) composerTimeInput.value = 'now';
  if (composerDurationRange) composerDurationRange.value = '3.0';
  if (durationValueBadge) durationValueBadge.textContent = '3.0s';
  if (saveNotifBtnText) saveNotifBtnText.textContent = 'Save Notification';

  renderDisplayStage();
  renderSavedNotifsList();
  composerMessageInput?.focus();
}

if (btnNewNotif) btnNewNotif.addEventListener('click', loadNewNotificationForm);
if (btnHeaderAddNotif) btnHeaderAddNotif.addEventListener('click', loadNewNotificationForm);

// Live preview typing into banner
function updateDisplayBannerLive() {
  const char = characters.find(c => c.id === activeCharId) || characters[0];
  const msg = composerMessageInput?.value?.trim() || 'Type your notification message...';
  const time = composerTimeInput?.value?.trim() || 'now';

  if (activeNotifId) {
    // Update active item in array live
    const activeItem = getActiveNotification();
    if (activeItem) {
      activeItem.message = msg;
      activeItem.timeText = time;
      activeItem.senderName = char ? char.name : activeItem.senderName;
      activeItem.avatar = char ? char.avatar : activeItem.avatar;
      activeItem.charId = char ? char.id : activeItem.charId;
    }
  }

  renderDisplayStage();
}

if (composerMessageInput) {
  composerMessageInput.addEventListener('input', () => {
    const len = composerMessageInput.value.length;
    if (charCount) charCount.textContent = `${len} / 140`;
    updateDisplayBannerLive();
  });
}

if (composerTimeInput) {
  composerTimeInput.addEventListener('input', updateDisplayBannerLive);
}

if (composerDurationRange && durationValueBadge) {
  composerDurationRange.addEventListener('input', (e) => {
    const dur = parseFloat(e.target.value).toFixed(1);
    durationValueBadge.textContent = `${dur}s`;
    if (activeNotifId) {
      const activeItem = getActiveNotification();
      if (activeItem) activeItem.duration = parseFloat(dur);
    }
  });
}

// Save or Update Notification
function saveNotificationHandler(asNew = false) {
  const msg = composerMessageInput?.value?.trim();
  if (!msg) {
    alert('Please enter a notification message.');
    composerMessageInput?.focus();
    return;
  }

  const char = characters.find(c => c.id === composerSenderSelect.value) || characters[0];
  const timeText = composerTimeInput?.value?.trim() || 'now';
  const duration = parseFloat(composerDurationRange?.value) || 3.0;

  if (!asNew && activeNotifId) {
    // Update existing
    const existing = savedNotifs.find(n => n.id === activeNotifId);
    if (existing) {
      existing.charId = char.id;
      existing.senderName = char.name;
      existing.avatar = char.avatar;
      existing.message = msg;
      existing.timeText = timeText;
      existing.duration = duration;
      existing.theme = currentTheme;
    }
  } else {
    // Create new notification
    const newNotif = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      charId: char.id,
      senderName: char.name,
      avatar: char.avatar,
      message: msg,
      timeText,
      duration,
      theme: currentTheme
    };
    savedNotifs.push(newNotif);
    activeNotifId = newNotif.id;
  }

  saveSavedNotifs();
  renderSavedNotifsList();
  renderDisplayStage();

  // Provide visual feedback
  const targetBtnText = asNew ? null : saveNotifBtnText;
  const originalText = targetBtnText?.textContent;
  if (targetBtnText) targetBtnText.textContent = asNew ? 'Added! ✓' : 'Saved! ✓';
  setTimeout(() => {
    if (targetBtnText) targetBtnText.textContent = originalText || 'Save Notification';
  }, 1500);
}

if (saveNotifBtn) {
  saveNotifBtn.addEventListener('click', () => saveNotificationHandler(false));
}

if (saveAsNewNotifBtn) {
  saveAsNewNotifBtn.addEventListener('click', () => saveNotificationHandler(true));
}

// Stage Display Mode Toggles
if (stageModeAllBtn) {
  stageModeAllBtn.addEventListener('click', () => {
    displayMode = 'all';
    stageModeAllBtn.classList.add('active');
    if (stageModeCurrentBtn) stageModeCurrentBtn.classList.remove('active');
    renderDisplayStage();
  });
}

if (stageModeCurrentBtn) {
  stageModeCurrentBtn.addEventListener('click', () => {
    displayMode = 'current';
    stageModeCurrentBtn.classList.add('active');
    if (stageModeAllBtn) stageModeAllBtn.classList.remove('active');
    renderDisplayStage();
  });
}

// ==========================================================================
// 6. Saved Notifications List (Manage, Reorder, Duplicate, Delete)
// ==========================================================================

function renderSavedNotifsList() {
  if (!savedNotifsList) return;
  savedNotifsList.innerHTML = '';

  if (savedCountMeta) {
    savedCountMeta.textContent = `${savedNotifs.length} notification${savedNotifs.length === 1 ? '' : 's'}`;
  }

  if (savedNotifs.length === 0) {
    savedNotifsList.innerHTML = `
      <div style="text-align: center; padding: 24px 12px; color: var(--md-sys-color-on-surface-variant); font-size: 0.85rem;">
        No notifications yet.<br>Type a message above and click <strong>Save Notification</strong> to add one!
      </div>
    `;
    return;
  }

  savedNotifs.forEach((item, index) => {
    const el = document.createElement('div');
    const isActive = item.id === activeNotifId;
    el.className = `saved-notif-item ${isActive ? 'is-active-item' : ''}`;
    el.dataset.id = item.id;

    const itemTheme = item.theme === 'white' ? 'white' : 'black';
    el.innerHTML = `
      <span class="saved-notif-order-badge" title="Sequence Order">#${index + 1}</span>
      <img src="${escapeHtml(item.avatar || '/assets/avatars/linda.jpg')}" class="saved-notif-avatar" alt="${escapeHtml(item.senderName)}" onerror="this.src='/assets/avatars/linda.jpg'">
      <div class="saved-notif-info">
        <div class="saved-notif-top">
          <span class="saved-notif-sender">${escapeHtml(item.senderName)}</span>
          <span class="saved-notif-tag tag-${itemTheme}">${itemTheme}</span>
          <span class="saved-notif-dur">${item.duration ? item.duration.toFixed(1) : '3.0'}s</span>
        </div>
        <div class="saved-notif-text">${escapeHtml(item.message)}</div>
      </div>
      <div class="saved-notif-actions">
        <button type="button" class="btn-icon-subtle btn-move-up" title="Move Up in Stack" ${index === 0 ? 'disabled' : ''}>
          <span class="material-symbols-outlined">arrow_upward</span>
        </button>
        <button type="button" class="btn-icon-subtle btn-move-down" title="Move Down in Stack" ${index === savedNotifs.length - 1 ? 'disabled' : ''}>
          <span class="material-symbols-outlined">arrow_downward</span>
        </button>
        <button type="button" class="btn-icon-subtle btn-duplicate" title="Duplicate Notification">
          <span class="material-symbols-outlined">content_copy</span>
        </button>
        <button type="button" class="btn-icon-subtle btn-delete" title="Delete Notification">
          <span class="material-symbols-outlined">delete</span>
        </button>
      </div>
    `;

    // Click item to load into composer
    el.addEventListener('click', () => {
      setActiveNotification(item.id);
    });

    // Move Up
    const btnUp = el.querySelector('.btn-move-up');
    if (btnUp) {
      btnUp.addEventListener('click', (e) => {
        e.stopPropagation();
        moveSavedNotification(index, -1);
      });
    }

    // Move Down
    const btnDown = el.querySelector('.btn-move-down');
    if (btnDown) {
      btnDown.addEventListener('click', (e) => {
        e.stopPropagation();
        moveSavedNotification(index, 1);
      });
    }

    // Duplicate
    const btnDup = el.querySelector('.btn-duplicate');
    if (btnDup) {
      btnDup.addEventListener('click', (e) => {
        e.stopPropagation();
        duplicateSavedNotification(item.id);
      });
    }

    // Delete button
    const btnDel = el.querySelector('.btn-delete');
    if (btnDel) {
      btnDel.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSavedNotification(item.id);
      });
    }

    savedNotifsList.appendChild(el);
  });
}

function moveSavedNotification(index, direction) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= savedNotifs.length) return;
  const temp = savedNotifs[index];
  savedNotifs[index] = savedNotifs[targetIndex];
  savedNotifs[targetIndex] = temp;
  saveSavedNotifs();
  renderSavedNotifsList();
  renderDisplayStage();
}

function duplicateSavedNotification(notifId) {
  const idx = savedNotifs.findIndex(n => n.id === notifId);
  if (idx === -1) return;
  const source = savedNotifs[idx];
  const duplicate = {
    ...source,
    id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    message: `${source.message} (Copy)`
  };
  savedNotifs.splice(idx + 1, 0, duplicate);
  saveSavedNotifs();
  setActiveNotification(duplicate.id);
}

function deleteSavedNotification(notifId) {
  savedNotifs = savedNotifs.filter(n => n.id !== notifId);
  saveSavedNotifs();
  if (activeNotifId === notifId) {
    if (savedNotifs.length > 0) {
      setActiveNotification(savedNotifs[0].id);
    } else {
      loadNewNotificationForm();
    }
  } else {
    renderSavedNotifsList();
    renderDisplayStage();
  }
}

// ==========================================================================
// 7. Notification Color Theme (Black vs White)
// ==========================================================================

function setNotificationTheme(theme) {
  currentTheme = theme === 'white' ? 'white' : 'black';

  if (themeBlackBtn && themeWhiteBtn) {
    themeBlackBtn.classList.toggle('active', currentTheme === 'black');
    themeWhiteBtn.classList.toggle('active', currentTheme === 'white');
  }

  const notif = getActiveNotification();
  if (notif) {
    notif.theme = currentTheme;
  }

  renderDisplayStage();
}

if (themeBlackBtn) {
  themeBlackBtn.addEventListener('click', () => {
    setNotificationTheme('black');
    saveSavedNotifs();
    renderSavedNotifsList();
  });
}

if (themeWhiteBtn) {
  themeWhiteBtn.addEventListener('click', () => {
    setNotificationTheme('white');
    saveSavedNotifs();
    renderSavedNotifsList();
  });
}

// ==========================================================================
// 8. Preview Notification Animation (Play once, Staggered for Multi-Notif, NO LOOP)
// ==========================================================================

let previewTimeouts = [];

function clearAllPreviewTimeouts() {
  previewTimeouts.forEach(t => clearTimeout(t));
  previewTimeouts = [];
}

function previewNotification() {
  if (isPreviewing) {
    stopPreview();
    return;
  }

  const cards = displayContainer ? Array.from(displayContainer.querySelectorAll('.ios-banner-card')) : [];
  if (cards.length === 0) return;

  isPreviewing = true;
  if (previewBtnIcon) previewBtnIcon.textContent = 'stop';
  if (previewBtnText) previewBtnText.textContent = 'Stop Preview';
  if (previewNotifBtn) previewNotifBtn.classList.add('is-playing');

  // Step 1: Hide all banner cards initially
  cards.forEach(card => {
    card.classList.remove('is-visible', 'is-exiting');
  });

  const enterDurationMs = 500;
  const exitDurationMs = 500;
  const staggerDelayMs = 1200; // 1.2s delay between consecutive incoming notifications

  // Step 2: Animate each card entrance in sequence
  cards.forEach((card, i) => {
    const entranceTimeout = setTimeout(() => {
      if (!isPreviewing) return;
      card.classList.add('is-visible');
    }, 100 + (i * staggerDelayMs));
    previewTimeouts.push(entranceTimeout);
  });

  // Calculate total active hold time
  const maxHoldMs = Math.max(...savedNotifs.map(n => (n.duration || 3.0) * 1000), 3000);
  const totalEntranceDuration = 100 + ((cards.length - 1) * staggerDelayMs);
  const exitStartTime = totalEntranceDuration + maxHoldMs;

  // Step 3: Trigger exit animation for all cards
  const exitTimeout = setTimeout(() => {
    if (!isPreviewing) return;
    cards.forEach((card, i) => {
      const cardExitTimeout = setTimeout(() => {
        if (!isPreviewing) return;
        card.classList.remove('is-visible');
        card.classList.add('is-exiting');
      }, i * 150);
      previewTimeouts.push(cardExitTimeout);
    });

    // Step 4: After exit completes, stop completely (NO LOOP!)
    const finishTimeout = setTimeout(() => {
      stopPreview();
    }, exitDurationMs + (cards.length * 150));
    previewTimeouts.push(finishTimeout);

  }, exitStartTime);

  previewTimeouts.push(exitTimeout);
}

function stopPreview() {
  isPreviewing = false;
  clearAllPreviewTimeouts();

  if (previewBtnIcon) previewBtnIcon.textContent = 'play_arrow';
  if (previewBtnText) previewBtnText.textContent = 'Preview Notifications';
  if (previewNotifBtn) previewNotifBtn.classList.remove('is-playing');

  // Return all cards to visible resting state so user sees them clearly
  if (displayContainer) {
    const cards = displayContainer.querySelectorAll('.ios-banner-card');
    cards.forEach(card => {
      card.classList.remove('is-exiting');
      card.classList.add('is-visible');
    });
  }
}

if (previewNotifBtn) previewNotifBtn.addEventListener('click', previewNotification);

// Spacebar triggers preview
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
    e.preventDefault();
    previewNotification();
  }
});

// ==========================================================================
// 9. 4K MP4 Video Export Engine (Matches Exact Preview Visuals + Multi-Notification Support)
// ==========================================================================

async function download4kVideo() {
  if (isExporting) return;

  // Determine export list based on display mode
  let exportList = [];
  if (displayMode === 'all' && savedNotifs.length > 0) {
    exportList = savedNotifs.map(n => {
      const char = characters.find(c => c.id === n.charId);
      return {
        id: n.id,
        senderName: n.senderName || (char ? char.name : 'Linda'),
        avatar: n.avatar || (char ? char.avatar : '/assets/avatars/linda.jpg'),
        message: n.message,
        timeText: n.timeText || 'now',
        duration: n.duration || 3.0,
        theme: n.theme || currentTheme
      };
    });
  } else {
    const active = getActiveNotification();
    const currentMsg = active ? active.message : composerMessageInput?.value?.trim();
    if (!currentMsg) {
      alert('Please enter or save a notification message before downloading.');
      composerMessageInput?.focus();
      return;
    }
    const senderChar = active
      ? characters.find(c => c.id === active.charId)
      : characters.find(c => c.id === activeCharId) || characters[0];

    exportList = [{
      id: active ? active.id : 'single',
      senderName: senderChar ? senderChar.name : (active?.senderName || 'Linda'),
      avatar: senderChar ? senderChar.avatar : (active?.avatar || '/assets/avatars/linda.jpg'),
      message: currentMsg,
      timeText: active ? active.timeText : (composerTimeInput?.value || 'now'),
      duration: active ? active.duration : (parseFloat(composerDurationRange?.value) || 3.0),
      theme: active ? active.theme : currentTheme
    }];
  }

  isExporting = true;
  stopPreview();

  // Update UI to rendering state
  if (download4kBtn) download4kBtn.disabled = true;
  if (previewNotifBtn) previewNotifBtn.disabled = true;
  if (recordSpinner) recordSpinner.classList.remove('hidden');
  if (recordIcon) recordIcon.classList.add('hidden');
  if (recordBtnText) recordBtnText.textContent = 'Rendering 4K MP4...';

  if (videoProgressContainer) videoProgressContainer.classList.remove('hidden');
  if (progressBar) progressBar.style.width = '0%';
  if (progressPercentage) progressPercentage.textContent = '0%';
  if (progressStatusText) progressStatusText.textContent = `Initializing 4K Master Engine (${exportList.length} notification${exportList.length === 1 ? '' : 's'})...`;
  if (progressDetailText) progressDetailText.textContent = 'Connecting to server pipeline...';
  if (progressEtaText) progressEtaText.textContent = 'Calculating time...';

  const payload = {
    notifications: exportList,
    currentQuality: '4k',
    currentRatio: '16:9',
    fps: 60,
    format: 'mp4'
  };

  let eventSource = null;

  try {
    // 1. Start Render Job on Server
    const startRes = await fetch('/api/export/notification/video/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!startRes.ok) {
      const err = await startRes.json().catch(() => ({}));
      throw new Error(err.error || `Server returned HTTP ${startRes.status}`);
    }

    const { jobId, totalFrames, filename } = await startRes.json();

    if (progressDetailText) {
      progressDetailText.textContent = `4K Ultra HD (60 FPS) • 0 / ${totalFrames} frames`;
    }

    // 2. Track real-time progress via SSE
    await new Promise((resolve, reject) => {
      let isDone = false;

      function handleUpdate(data) {
        if (isDone) return;
        const percent = Math.min(100, Math.max(0, data.percent || 0));

        if (progressBar) progressBar.style.width = `${percent}%`;
        if (progressPercentage) progressPercentage.textContent = `${percent}%`;

        if (data.status === 'starting') {
          if (progressStatusText) progressStatusText.textContent = 'Initializing 4K Puppeteer pipeline...';
        } else if (data.status === 'rendering') {
          if (progressStatusText) {
            progressStatusText.textContent = `Rendering frame ${data.currentFrame || 0} of ${data.totalFrames || totalFrames}`;
          }
          if (progressDetailText) {
            progressDetailText.textContent = '4K Ultra HD • Master 60 FPS • Apple Spring Physics';
          }
          if (progressEtaText && data.etaSeconds !== null && data.etaSeconds !== undefined) {
            progressEtaText.textContent = data.etaSeconds > 0 ? `ETA: ~${data.etaSeconds}s remaining` : 'Finalizing encode...';
          }
        } else if (data.status === 'ready') {
          isDone = true;
          if (eventSource) eventSource.close();
          resolve();
        } else if (data.status === 'error') {
          isDone = true;
          if (eventSource) eventSource.close();
          reject(new Error(data.error || 'Video rendering failed'));
        }
      }

      eventSource = new EventSource(`/api/export/video/events/${jobId}`);
      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          handleUpdate(data);
        } catch (err) {}
      };

      eventSource.onerror = () => {
        // Fallback to polling if SSE drops
        eventSource.close();
        const pollTimer = setInterval(async () => {
          try {
            const pRes = await fetch(`/api/export/video/progress/${jobId}`);
            if (pRes.ok) {
              const pData = await pRes.json();
              handleUpdate(pData);
              if (pData.status === 'ready' || pData.status === 'error') {
                clearInterval(pollTimer);
              }
            }
          } catch (e) {}
        }, 800);
      };
    });

    // 3. Download the genuine 4K MP4 file
    if (progressStatusText) progressStatusText.textContent = 'Downloading 4K MP4...';
    if (progressBar) progressBar.style.width = '100%';
    if (progressPercentage) progressPercentage.textContent = '100%';

    const downloadUrl = `/api/export/video/download/${jobId}?filename=${encodeURIComponent(filename)}`;
    const dlLink = document.createElement('a');
    dlLink.href = downloadUrl;
    dlLink.download = filename;
    document.body.appendChild(dlLink);
    dlLink.click();
    document.body.removeChild(dlLink);

    if (recordBtnText) recordBtnText.textContent = 'Saved 4K MP4! ✓';

  } catch (err) {
    console.error('Export error:', err);
    alert(`Export failed: ${err.message}`);
    if (recordBtnText) recordBtnText.textContent = 'Download 4K Video (MP4)';
  } finally {
    if (eventSource) eventSource.close();
    isExporting = false;

    if (recordSpinner) recordSpinner.classList.add('hidden');
    if (recordIcon) recordIcon.classList.remove('hidden');
    if (download4kBtn) download4kBtn.disabled = false;
    if (previewNotifBtn) previewNotifBtn.disabled = false;

    setTimeout(() => {
      if (videoProgressContainer) videoProgressContainer.classList.add('hidden');
      if (recordBtnText) recordBtnText.textContent = 'Download 4K Video (MP4)';
    }, 4000);
  }
}

if (download4kBtn) download4kBtn.addEventListener('click', download4kVideo);

// ==========================================================================
// 10. Utilities & Load Demo
// ==========================================================================

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function setupEventListeners() {
  if (loadDemoBtn) {
    loadDemoBtn.addEventListener('click', () => {
      savedNotifs = JSON.parse(JSON.stringify(DEFAULT_SAVED_NOTIFS));
      saveSavedNotifs();
      renderSavedNotifsList();
      setActiveNotification(savedNotifs[0].id);
    });
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('dark-mode');
      const isDark = document.body.classList.contains('dark-mode');
      if (themeMoonIcon) themeMoonIcon.classList.toggle('hidden', isDark);
      if (themeSunIcon) themeSunIcon.classList.toggle('hidden', !isDark);
      if (themeToggleText) themeToggleText.textContent = isDark ? 'Light Mode' : 'Dark Mode';
    });
  }
}

document.addEventListener('DOMContentLoaded', initApp);
