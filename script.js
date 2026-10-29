/**
 * iMessage Mock Generator & Exporter
 * Supports 16:9 Green Screen Video Recording (1080p @ 60 FPS)
 * and Dynamic Theme Colors (Blue / Purple)
 */

// ==========================================================================
// 1. State Management & DOM Elements
// ==========================================================================

// Color Constants
const COLOR_BLUE = '#007aff';
const COLOR_BLUE_HOVER = '#0066d6';
const COLOR_PURPLE = '#af52de';
const COLOR_PURPLE_HOVER = '#9935cc';
const CHROMA_GREEN = '#00FF00'; // Digital Green Screen
const DIGITAL_GREEN = '#00FF00';

// Active sender color state (default: blue)
let currentSenderColor = COLOR_BLUE;

// Studio Customizer State
let currentRatio = '16:9'; // '16:9' | '9:16' | '1:1'
let currentQuality = '1080p'; // '1080p' (2x Retina Super-Sampled) | '4k' (Ultra HD Master)
let currentBgType = 'green'; // 'green' | 'blue' | 'black' | 'dark' | 'white'
let currentBgColor = DIGITAL_GREEN;
let currentWidthPreset = 'narrow'; // 'narrow' (740px) | 'standard' (1060px) | 'wide' (1300px)
let currentVAlign = 'top'; // 'top' | 'center' | 'bottom'
let currentPacing = 'cinematic'; // 'fast' | 'cinematic' | 'slow'
let isBounceEnabled = true;
let isSoundEnabled = true;
let isShadowEnabled = true;
let customBackdropDataUrl = null;
let isBackdropVisible = false;

// Global State for Project Architecture & Auto-Save Engine (Server as Source of Truth)
let activeProjectId = null;
let isLoadingProject = false;
let syncAbortController = null;
let cachedProjects = [];

// Array to store all message objects: { type: 'sender' | 'receiver', text: string, color: string, timestamp: Date }
const messages = [];

// DOM Element References: Sidebar & Project Management
const projectSidebar = document.getElementById('projectSidebar');
const collapseSidebarBtn = document.getElementById('collapseSidebarBtn');
const toggleSidebarHeaderBtn = document.getElementById('toggleSidebarHeaderBtn');
const newProjectBtn = document.getElementById('newProjectBtn');
const projectsList = document.getElementById('projectsList');
const projectsCount = document.getElementById('projectsCount');
const projectsEmptyNotice = document.getElementById('projectsEmptyNotice');
const saveStatusDot = document.getElementById('saveStatusDot');
const saveStatusLabel = document.getElementById('saveStatusLabel');
const activeProjectBadge = document.getElementById('activeProjectBadge');
const activeProjectNameDisplay = document.getElementById('activeProjectNameDisplay');

// DOM Element References: Display & Controls Layout
const mainLayout = document.getElementById('mainLayout');
const columnTyping = document.getElementById('columnTyping');
const toggleControlsNavBtn = document.getElementById('toggleControlsNavBtn');
const navToggleLabel = document.getElementById('navToggleLabel');
const stageToggleControlsBtn = document.getElementById('stageToggleControlsBtn');
const stageToggleControlsText = document.getElementById('stageToggleControlsText');
const closeControlsBtn = document.getElementById('closeControlsBtn');

// DOM Element References: Google Material 3 Modals
const newProjectModal = document.getElementById('newProjectModal');
const closeNewProjectModalBtn = document.getElementById('closeNewProjectModalBtn');
const cancelNewProjectBtn = document.getElementById('cancelNewProjectBtn');
const submitNewProjectBtn = document.getElementById('submitNewProjectBtn');
const newProjectForm = document.getElementById('newProjectForm');
const newProjectNameInput = document.getElementById('newProjectNameInput');
const newProjectRatioGrid = document.getElementById('newProjectRatioGrid');
const newProjectColorRow = document.getElementById('newProjectColorRow');
const newProjectTemplateGrid = document.getElementById('newProjectTemplateGrid');

const deleteModal = document.getElementById('deleteModal');
const closeDeleteModalBtn = document.getElementById('closeDeleteModalBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const deleteTargetProjectName = document.getElementById('deleteTargetProjectName');

let deleteTargetProjectId = null;

const renameModal = document.getElementById('renameModal');
const closeRenameModalBtn = document.getElementById('closeRenameModalBtn');
const cancelRenameBtn = document.getElementById('cancelRenameBtn');
const confirmRenameBtn = document.getElementById('confirmRenameBtn');
const renameProjectForm = document.getElementById('renameProjectForm');
const renameProjectInput = document.getElementById('renameProjectInput');
const renameClearBtn = document.getElementById('renameClearBtn');
const renameCharCounter = document.getElementById('renameCharCounter');
const renameCurrentDisplay = document.getElementById('renameCurrentDisplay');
const renameSuggestionsRow = document.getElementById('renameSuggestionsRow');

let renameTargetProjectId = null;

// DOM Element References: Display & Controls
const stageFrame = document.getElementById('stageFrame');
const stageBackdrop = document.getElementById('stageBackdrop');
const displayContainer = document.getElementById('displayContainer');
const emptyStateNotice = document.getElementById('emptyStateNotice');

const senderInput = document.getElementById('senderInput');
const receiverInput = document.getElementById('receiverInput');
const sendSenderBtn = document.getElementById('sendSenderBtn');
const sendReceiverBtn = document.getElementById('sendReceiverBtn');
const senderCharCount = document.getElementById('senderCharCount');
const receiverCharCount = document.getElementById('receiverCharCount');

// Color picker buttons
const colorBlueBtn = document.getElementById('colorBlueBtn');
const colorPurpleBtn = document.getElementById('colorPurpleBtn');

// Stage background preview toggle button
const toggleBgBtn = document.getElementById('toggleBgBtn');
const bgIndicator = document.getElementById('bgIndicator');
const bgToggleText = document.getElementById('bgToggleText');
const ratioBadgeText = document.getElementById('ratioBadgeText');

// Studio Customizer Controls (Under Export Buttons)
const ratioOptions = document.getElementById('ratioOptions');
const qualityOptions = document.getElementById('qualityOptions');
const bgOptions = document.getElementById('bgOptions');
const widthOptions = document.getElementById('widthOptions');
const valignOptions = document.getElementById('valignOptions');
const pacingOptions = document.getElementById('pacingOptions');
const toggleBounceBtn = document.getElementById('toggleBounceBtn');
const bounceStatusText = document.getElementById('bounceStatusText');
const toggleSoundBtn = document.getElementById('toggleSoundBtn');
const soundStatusText = document.getElementById('soundStatusText');
const toggleShadowBtn = document.getElementById('toggleShadowBtn');
const shadowStatusText = document.getElementById('shadowStatusText');
const uploadBackdropBtn = document.getElementById('uploadBackdropBtn');
const backdropFileInput = document.getElementById('backdropFileInput');
const backdropBtnTitle = document.getElementById('backdropBtnTitle');
const backdropStatusText = document.getElementById('backdropStatusText');

// Transparent PNG Export button elements
const downloadChatBtn = document.getElementById('downloadChatBtn');
const downloadSpinner = document.getElementById('downloadSpinner');
const downloadIcon = document.getElementById('downloadIcon');
const downloadBtnText = document.getElementById('downloadBtnText');

// Record Video button elements
const recordVideoBtn = document.getElementById('recordVideoBtn');
const recordSpinner = document.getElementById('recordSpinner');
const recordIcon = document.getElementById('recordIcon');
const recordBtnText = document.getElementById('recordBtnText');
const videoRecordingCanvas = document.getElementById('videoRecordingCanvas');

// Video Generation Progress Container & Metrics Elements
const videoProgressContainer = document.getElementById('videoProgressContainer');
const progressSpinner = document.getElementById('progressSpinner');
const progressStatusText = document.getElementById('progressStatusText');
const progressPercentage = document.getElementById('progressPercentage');
const progressBar = document.getElementById('progressBar');
const progressDetailText = document.getElementById('progressDetailText');
const progressEtaText = document.getElementById('progressEtaText');

const loadSampleBtn = document.getElementById('loadSampleBtn');
const clearChatBtn = document.getElementById('clearChatBtn');

// Dark / Light Theme Toggle Elements
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeMoonIcon = document.getElementById('themeMoonIcon');
const themeSunIcon = document.getElementById('themeSunIcon');
const themeToggleText = document.getElementById('themeToggleText');

// Flag to track ongoing export or recording process
let isExporting = false;

// ==========================================================================
// 1.5. Persistent Project Architecture & Auto-Save Engine
// ==========================================================================

/**
 * Robust debounce function with cancel support (750ms delay)
 * @param {Function} func 
 * @param {number} wait 
 * @returns {Function}
 */
function debounce(func, wait = 750) {
  let timeout = null;
  const debounced = function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      timeout = null;
      func.apply(this, args);
    }, wait);
  };
  debounced.cancel = function () {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };
  return debounced;
}

/**
 * Updates UI save status badge in sidebar footer
 * @param {'saved' | 'saving' | 'error'} status 
 */
function setSaveStatus(status) {
  if (!saveStatusDot || !saveStatusLabel) return;
  saveStatusDot.classList.remove('saving', 'error', 'synced');
  if (status === 'saving') {
    saveStatusDot.classList.add('saving');
    saveStatusLabel.textContent = 'Saving...';
  } else if (status === 'error') {
    saveStatusDot.classList.add('error');
    saveStatusLabel.textContent = 'Save Error';
  } else {
    saveStatusDot.classList.add('synced');
    saveStatusLabel.textContent = 'Saved';
  }
}

/**
 * Synchronizes the active DOM state, draft inputs, and messages array
 * with the SQLite backend via PUT /api/projects/:id/sync
 */
async function syncStateToBackend() {
  if (!activeProjectId || isLoadingProject) return;

  // Abort previous in-flight sync if any
  if (syncAbortController) {
    syncAbortController.abort();
  }
  syncAbortController = new AbortController();
  const signal = syncAbortController.signal;

  const currentName = activeProjectNameDisplay ? activeProjectNameDisplay.textContent.trim() : 'Untitled Project';

  const payload = {
    name: currentName,
    settings: {
      currentRatio,
      currentQuality,
      currentSenderColor,
      currentWidthPreset,
      currentVAlign,
      currentPacing,
      isBounceEnabled,
      isSoundEnabled,
      isShadowEnabled,
      currentBgType,
      currentBgColor
    },
    draft_sender: senderInput ? senderInput.value : '',
    draft_receiver: receiverInput ? receiverInput.value : '',
    messages: messages.map((m, idx) => ({
      order_index: idx,
      type: m.type,
      text: m.text,
      color: m.color
    }))
  };

  try {
    setSaveStatus('saving');
    const res = await fetch(`/api/projects/${encodeURIComponent(activeProjectId)}/sync`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal
    });

    if (!res.ok) {
      throw new Error(`Sync error: ${res.status}`);
    }

    setSaveStatus('saved');
    updateActiveSidebarItemTime();
  } catch (err) {
    if (err.name === 'AbortError') {
      return; // Handled cancel
    }
    console.error('Auto-save error:', err);
    setSaveStatus('error');
  } finally {
    if (syncAbortController && syncAbortController.signal === signal) {
      syncAbortController = null;
    }
  }
}

const debouncedSync = debounce(syncStateToBackend, 750);

/**
 * Triggers debounced auto-save if not currently loading
 */
function triggerAutoSave() {
  if (isLoadingProject || !activeProjectId || isExporting) return;
  setSaveStatus('saving');
  debouncedSync();
}

/**
 * Formats ISO date into a user-friendly relative timestamp
 * @param {string|Date} dateStr 
 */
function formatRelativeTime(dateStr) {
  if (!dateStr) return 'Just now';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Recently';
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Fetches all projects from GET /api/projects and populates the sidebar
 */
async function fetchProjectsList() {
  try {
    const res = await fetch('/api/projects');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const projects = await res.json();
    cachedProjects = projects;
    renderProjectsList(projects);
    return projects;
  } catch (err) {
    console.error('Failed to fetch projects:', err);
    return [];
  }
}

/**
 * Renders the project list in the sidebar
 * @param {Array} projects 
 */
function renderProjectsList(projects) {
  if (!projectsList) return;
  projectsList.innerHTML = '';

  if (projectsCount) {
    projectsCount.textContent = projects.length;
  }

  if (!Array.isArray(projects) || projects.length === 0) {
    if (projectsEmptyNotice) projectsEmptyNotice.classList.remove('hidden');
    return;
  }
  if (projectsEmptyNotice) projectsEmptyNotice.classList.add('hidden');

  projects.forEach(project => {
    const li = document.createElement('li');
    li.className = 'project-item' + (project.id === activeProjectId ? ' active' : '');
    li.dataset.projectId = project.id;

    const infoDiv = document.createElement('div');
    infoDiv.className = 'project-item-info';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'project-item-name';
    nameSpan.textContent = project.name || 'Untitled Project';
    nameSpan.title = 'Double click to rename';

    const metaSpan = document.createElement('span');
    metaSpan.className = 'project-item-meta';
    metaSpan.textContent = formatRelativeTime(project.last_accessed);

    infoDiv.appendChild(nameSpan);
    infoDiv.appendChild(metaSpan);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'project-item-actions';

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'btn-project-rename';
    renameBtn.title = 'Rename project';
    renameBtn.setAttribute('aria-label', `Rename project ${project.name}`);
    renameBtn.innerHTML = `<span class="material-symbols-outlined">edit</span>`;

    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openRenameModal(project.id);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-project-delete';
    deleteBtn.title = 'Delete project';
    deleteBtn.setAttribute('aria-label', `Delete project ${project.name}`);
    deleteBtn.innerHTML = `<span class="material-symbols-outlined">delete</span>`;

    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDeleteModal(project.id);
    });

    actionsDiv.appendChild(renameBtn);
    actionsDiv.appendChild(deleteBtn);

    li.appendChild(infoDiv);
    li.appendChild(actionsDiv);

    // Switch project on click
    li.addEventListener('click', () => {
      if (project.id === activeProjectId) return;
      loadProject(project.id);
    });

    // Double-click to rename via Google Material 3 modal
    nameSpan.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      openRenameModal(project.id);
    });

    projectsList.appendChild(li);
  });
}

function highlightActiveSidebarItem(id) {
  if (!projectsList) return;
  projectsList.querySelectorAll('.project-item').forEach(item => {
    item.classList.toggle('active', item.dataset.projectId === id);
  });
}

function updateActiveSidebarItemTime() {
  if (!activeProjectId || !projectsList) return;
  const activeItem = projectsList.querySelector(`.project-item[data-project-id="${activeProjectId}"]`);
  if (activeItem) {
    const metaSpan = activeItem.querySelector('.project-item-meta');
    if (metaSpan) metaSpan.textContent = 'Just now';
  }
}

/**
 * Loads a project from the server and restores its full state and messages
 * @param {string} id 
 */
async function loadProject(id) {
  if (!id) return;

  // Handle edge case: Cancel pending debounced sync & abort in-flight sync on project switch
  debouncedSync.cancel();
  if (syncAbortController) {
    syncAbortController.abort();
    syncAbortController = null;
  }

  activeProjectId = id;
  highlightActiveSidebarItem(id);

  try {
    setSaveStatus('saving');
    const res = await fetch(`/api/projects/${encodeURIComponent(id)}`);
    if (!res.ok) {
      throw new Error(`Failed to load project (${res.status})`);
    }

    const project = await res.json();
    isLoadingProject = true; // Guard against event listeners triggering auto-save during restore

    // 1. Project Title
    const name = project.name || 'Untitled Project';
    if (activeProjectNameDisplay) {
      activeProjectNameDisplay.textContent = name;
    }

    // 2. Settings Restoration
    const s = project.settings || {};
    if (s.currentRatio) {
      setStudioRatio(s.currentRatio);
    }
    if (s.currentQuality) {
      setStudioQuality(s.currentQuality);
    }
    if (s.currentSenderColor) {
      setSenderTheme(s.currentSenderColor === COLOR_PURPLE ? 'purple' : 'blue');
    }
    if (s.currentWidthPreset) {
      setStudioWidth(s.currentWidthPreset);
    }
    if (s.currentVAlign) {
      setStudioVAlign(s.currentVAlign);
    }
    if (s.currentPacing) {
      setStudioPacing(s.currentPacing);
    }
    if (s.currentBgType) {
      let bgCol = s.currentBgColor;
      if (!bgCol || bgCol === '#00B140') {
        bgCol = (s.currentBgType === 'green' ? DIGITAL_GREEN : '#000000');
      }
      setStudioBackground(s.currentBgType, bgCol);
    }

    // Switches
    isBounceEnabled = s.isBounceEnabled !== undefined ? Boolean(s.isBounceEnabled) : true;
    if (toggleBounceBtn) toggleBounceBtn.classList.toggle('active', isBounceEnabled);
    if (bounceStatusText) bounceStatusText.textContent = isBounceEnabled ? 'Active' : 'Off';

    isSoundEnabled = s.isSoundEnabled !== undefined ? Boolean(s.isSoundEnabled) : true;
    if (toggleSoundBtn) toggleSoundBtn.classList.toggle('active', isSoundEnabled);
    if (soundStatusText) soundStatusText.textContent = isSoundEnabled ? 'Active' : 'Off';

    isShadowEnabled = s.isShadowEnabled !== undefined ? Boolean(s.isShadowEnabled) : true;
    if (toggleShadowBtn) toggleShadowBtn.classList.toggle('active', isShadowEnabled);
    if (shadowStatusText) shadowStatusText.textContent = isShadowEnabled ? 'Active' : 'Off';
    if (stageFrame) stageFrame.classList.toggle('has-shadow', isShadowEnabled);

    // 3. Drafts Restoration
    if (senderInput) {
      senderInput.value = project.draft_sender || '';
      if (senderCharCount) senderCharCount.textContent = `${senderInput.value.length} chars`;
    }
    if (receiverInput) {
      receiverInput.value = project.draft_receiver || '';
      if (receiverCharCount) receiverCharCount.textContent = `${receiverInput.value.length} chars`;
    }

    // 4. Messages Restoration
    messages.length = 0;
    if (displayContainer) {
      displayContainer.querySelectorAll('.message, .typing-bubble, .message-insert-slot').forEach(el => el.remove());
    }

    if (Array.isArray(project.messages)) {
      project.messages.forEach(msg => {
        appendMessage(msg.type, msg.text, {
          playSound: false,
          triggerSave: false,
          color: msg.color
        });
      });
    }

    updateUIState();
    setSaveStatus('saved');
  } catch (err) {
    console.error('Error loading project:', err);
    setSaveStatus('error');
  } finally {
    isLoadingProject = false;
    refreshInsertRails();
  }
}

/**
 * Pre-configured Starter Script Templates for New Projects
 */
const STARTER_TEMPLATES = {
  blank: [],
  lunch: [
    { type: 'receiver', text: 'Hey Alex! Are we still meeting for lunch today?' },
    { type: 'sender', text: 'Hey! Yes, definitely. How about that new Italian place on 5th?' },
    { type: 'receiver', text: 'Sounds delicious! Around 12:30 PM?' },
    { type: 'sender', text: 'Perfect. See you there! 🍕' }
  ],
  plot_twist: [
    { type: 'receiver', text: 'Bro, check your bank account RIGHT NOW.' },
    { type: 'sender', text: 'Why what happened?? 😳' },
    { type: 'receiver', text: 'Someone just wired $50,000 to our startup account!' },
    { type: 'sender', text: 'OMG IT WAS THE INVESTOR FROM YESTERDAY! 🎉🚀' }
  ],
  suspense: [
    { type: 'receiver', text: 'We need to talk about what happened last night.' },
    { type: 'sender', text: 'What do you mean? Everything seemed fine.' },
    { type: 'receiver', text: 'I saw who you were with at the diner.' },
    { type: 'sender', text: 'Wait... you were there?!' },
    { type: 'receiver', text: 'Check outside your window right now.' }
  ]
};

/**
 * Opens Google Material 3 "Create New Project" modal
 */
function openNewProjectModal() {
  if (isExporting) return;
  if (!newProjectModal) return;

  const count = (cachedProjects ? cachedProjects.length : 0) + 1;
  if (newProjectNameInput) {
    newProjectNameInput.value = `Project ${count}`;
  }

  // Reset ratio selection to 16:9
  if (newProjectRatioGrid) {
    newProjectRatioGrid.querySelectorAll('.m3-choice-card').forEach(card => {
      card.classList.toggle('active', card.dataset.ratio === '16:9');
    });
  }

  // Reset color selection to blue
  if (newProjectColorRow) {
    newProjectColorRow.querySelectorAll('.color-select-card').forEach(card => {
      card.classList.toggle('active', card.dataset.color === 'blue');
    });
  }

  // Reset template selection to blank
  if (newProjectTemplateGrid) {
    newProjectTemplateGrid.querySelectorAll('.m3-template-card').forEach(card => {
      card.classList.toggle('active', card.dataset.template === 'blank');
    });
  }

  newProjectModal.classList.remove('hidden');
  setTimeout(() => {
    if (newProjectNameInput) {
      newProjectNameInput.focus();
      newProjectNameInput.select();
    }
  }, 60);
}

/**
 * Closes Google Material 3 "Create New Project" modal
 */
function closeNewProjectModal() {
  if (newProjectModal) {
    newProjectModal.classList.add('hidden');
  }
}

/**
 * Handles creation of a new project from modal inputs and switches to it
 */
async function submitNewProjectModal() {
  const name = newProjectNameInput ? (newProjectNameInput.value.trim() || 'Untitled Project') : 'Untitled Project';

  const activeRatioCard = newProjectRatioGrid ? newProjectRatioGrid.querySelector('.m3-choice-card.active') : null;
  const chosenRatio = activeRatioCard ? activeRatioCard.dataset.ratio : '16:9';

  const activeColorCard = newProjectColorRow ? newProjectColorRow.querySelector('.color-select-card.active') : null;
  const chosenColorName = activeColorCard ? activeColorCard.dataset.color : 'blue';
  const chosenColor = chosenColorName === 'purple' ? COLOR_PURPLE : COLOR_BLUE;

  const activeTemplateCard = newProjectTemplateGrid ? newProjectTemplateGrid.querySelector('.m3-template-card.active') : null;
  const chosenTemplateKey = activeTemplateCard ? activeTemplateCard.dataset.template : 'blank';
  const rawTemplateMessages = STARTER_TEMPLATES[chosenTemplateKey] || [];
  const templateMessages = rawTemplateMessages.map((m, idx) => ({
    order_index: idx,
    type: m.type,
    text: m.text,
    color: m.type === 'sender' ? chosenColor : '#e5e5ea'
  }));

  closeNewProjectModal();

  try {
    setSaveStatus('saving');
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        settings: {
          currentRatio: chosenRatio,
          currentQuality: '1080p',
          currentSenderColor: chosenColor,
          currentWidthPreset: 'narrow',
          currentVAlign: 'top',
          currentPacing: 'cinematic',
          isBounceEnabled: true,
          isSoundEnabled: true,
          isShadowEnabled: true,
          currentBgType: 'green',
          currentBgColor: '#00FF00'
        },
        draft_sender: '',
        draft_receiver: '',
        messages: templateMessages
      })
    });

    if (!res.ok) throw new Error('Create failed');
    const newProject = await res.json();
    await fetchProjectsList();
    await loadProject(newProject.id);
  } catch (err) {
    console.error('Error creating new project:', err);
    setSaveStatus('error');
    alert('Failed to create new project.');
  }
}

/**
 * Opens Google Material 3 Delete Project Confirmation modal
 * @param {string} id 
 */
function openDeleteModal(id) {
  if (isExporting) return;
  const project = cachedProjects.find(p => p.id === id);
  deleteTargetProjectId = id;

  if (deleteTargetProjectName) {
    deleteTargetProjectName.textContent = project ? (project.name || 'Untitled Project') : 'Untitled Project';
  }

  if (deleteModal) {
    deleteModal.classList.remove('hidden');
  }
}

/**
 * Closes Google Material 3 Delete Project Confirmation modal
 */
function closeDeleteModal() {
  deleteTargetProjectId = null;
  if (deleteModal) {
    deleteModal.classList.add('hidden');
  }
}

/**
 * Confirms deletion of project and cascades UI switch
 */
async function confirmDeleteProject() {
  if (!deleteTargetProjectId) return;
  const idToDelete = deleteTargetProjectId;
  closeDeleteModal();

  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(idToDelete)}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Delete failed');

    cachedProjects = cachedProjects.filter(p => p.id !== idToDelete);

    if (idToDelete === activeProjectId) {
      if (cachedProjects.length > 0) {
        await loadProject(cachedProjects[0].id);
      } else {
        openNewProjectModal();
      }
    }
    await fetchProjectsList();
  } catch (err) {
    console.error('Error deleting project:', err);
    alert('Failed to delete project.');
  }
}

/**
 * Opens Google Material 3 Rename Project modal
 * @param {string} id 
 */
function openRenameModal(id) {
  if (isExporting) return;
  const project = cachedProjects.find(p => p.id === id);
  const currentName = project ? (project.name || 'Untitled Project') : (id === activeProjectId && activeProjectNameDisplay ? activeProjectNameDisplay.textContent.trim() : 'Untitled Project');

  renameTargetProjectId = id;

  if (renameCurrentDisplay) {
    renameCurrentDisplay.textContent = currentName;
  }

  if (renameProjectInput) {
    renameProjectInput.value = currentName;
    if (renameCharCounter) {
      renameCharCounter.textContent = `${currentName.length} / 60`;
    }
    if (renameClearBtn) {
      renameClearBtn.classList.toggle('hidden', currentName.length === 0);
    }
  }

  if (renameModal) {
    renameModal.classList.remove('hidden');
    setTimeout(() => {
      if (renameProjectInput) {
        renameProjectInput.focus();
        renameProjectInput.select();
      }
    }, 50);
  }
}

/**
 * Closes Google Material 3 Rename Project modal
 */
function closeRenameModal() {
  renameTargetProjectId = null;
  if (renameModal) {
    renameModal.classList.add('hidden');
  }
}

/**
 * Submits the Rename Project form and updates SQLite database
 */
async function submitRenameModal() {
  if (!renameTargetProjectId || !renameProjectInput) return;
  const idToRename = renameTargetProjectId;
  const newName = renameProjectInput.value.trim() || 'Untitled Project';

  closeRenameModal();

  // Optimistic UI updates
  if (idToRename === activeProjectId && activeProjectNameDisplay) {
    activeProjectNameDisplay.textContent = newName;
  }

  const sidebarNameSpan = projectsList ? projectsList.querySelector(`.project-item[data-project-id="${idToRename}"] .project-item-name`) : null;
  if (sidebarNameSpan) {
    sidebarNameSpan.textContent = newName;
  }

  const p = cachedProjects.find(item => item.id === idToRename);
  if (p) {
    p.name = newName;
  }

  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(idToRename)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName })
    });
    if (!res.ok) throw new Error('Rename failed on server');
  } catch (err) {
    console.error('Failed to rename project:', err);
  }
}

// Sidebar Event Listeners
if (collapseSidebarBtn) {
  collapseSidebarBtn.addEventListener('click', () => {
    if (projectSidebar) projectSidebar.classList.add('collapsed');
  });
}

if (toggleSidebarHeaderBtn) {
  toggleSidebarHeaderBtn.addEventListener('click', () => {
    if (projectSidebar) projectSidebar.classList.toggle('collapsed');
  });
}

/**
 * Sets visibility of the message controls panel on the side
 * When hidden, the display screen expands to full widescreen size for editing
 * @param {boolean} visible 
 */
function setMessageControlsVisible(visible) {
  const isVisible = !!visible;
  if (!mainLayout) return;

  if (isVisible) {
    mainLayout.classList.remove('controls-hidden');
    if (toggleControlsNavBtn) {
      toggleControlsNavBtn.classList.add('active');
      toggleControlsNavBtn.setAttribute('aria-pressed', 'true');
      toggleControlsNavBtn.setAttribute('title', 'Hide Message Controls (Expand Screen)');
    }
    if (navToggleLabel) {
      navToggleLabel.textContent = 'Hide Controls';
    }
    if (stageToggleControlsBtn) {
      stageToggleControlsBtn.classList.add('active');
      stageToggleControlsBtn.setAttribute('title', 'Hide Message Controls (Expand Screen)');
    }
    if (stageToggleControlsText) {
      stageToggleControlsText.textContent = 'Hide Controls';
    }
  } else {
    mainLayout.classList.add('controls-hidden');
    if (toggleControlsNavBtn) {
      toggleControlsNavBtn.classList.remove('active');
      toggleControlsNavBtn.setAttribute('aria-pressed', 'false');
      toggleControlsNavBtn.setAttribute('title', 'Show Message Controls');
    }
    if (navToggleLabel) {
      navToggleLabel.textContent = 'Message Controls';
    }
    if (stageToggleControlsBtn) {
      stageToggleControlsBtn.classList.remove('active');
      stageToggleControlsBtn.setAttribute('title', 'Show Message Controls');
    }
    if (stageToggleControlsText) {
      stageToggleControlsText.textContent = 'Controls';
    }
  }

  try {
    localStorage.setItem('chatgame_controls_visible', isVisible ? 'true' : 'false');
  } catch (e) {}
}

function initMessageControlsToggle() {
  let savedPref = null;
  try {
    savedPref = localStorage.getItem('chatgame_controls_visible');
  } catch (e) {}

  // Defaults to false (controls hidden, big display screen for editing)
  const shouldBeVisible = (savedPref === 'true');
  setMessageControlsVisible(shouldBeVisible);

  if (toggleControlsNavBtn) {
    toggleControlsNavBtn.addEventListener('click', () => {
      const isCurrentlyVisible = !mainLayout.classList.contains('controls-hidden');
      setMessageControlsVisible(!isCurrentlyVisible);
    });
  }

  if (stageToggleControlsBtn) {
    stageToggleControlsBtn.addEventListener('click', () => {
      const isCurrentlyVisible = !mainLayout.classList.contains('controls-hidden');
      setMessageControlsVisible(!isCurrentlyVisible);
    });
  }

  if (closeControlsBtn) {
    closeControlsBtn.addEventListener('click', () => {
      setMessageControlsVisible(false);
    });
  }

  // Keyboard shortcut: Alt + C or Cmd/Ctrl + \ to toggle message controls
  window.addEventListener('keydown', (e) => {
    if (((e.metaKey || e.ctrlKey) && e.key === '\\') || (e.altKey && e.key.toLowerCase() === 'c')) {
      e.preventDefault();
      const isCurrentlyVisible = !mainLayout.classList.contains('controls-hidden');
      setMessageControlsVisible(!isCurrentlyVisible);
    }
  });
}

if (newProjectBtn) {
  newProjectBtn.addEventListener('click', openNewProjectModal);
}

// New Project Modal Listeners
if (closeNewProjectModalBtn) {
  closeNewProjectModalBtn.addEventListener('click', closeNewProjectModal);
}

if (cancelNewProjectBtn) {
  cancelNewProjectBtn.addEventListener('click', closeNewProjectModal);
}

if (submitNewProjectBtn) {
  submitNewProjectBtn.addEventListener('click', (e) => {
    e.preventDefault();
    submitNewProjectModal();
  });
}

if (newProjectForm) {
  newProjectForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitNewProjectModal();
  });
}

if (newProjectRatioGrid) {
  newProjectRatioGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.m3-choice-card');
    if (!card) return;
    newProjectRatioGrid.querySelectorAll('.m3-choice-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
  });
}

if (newProjectColorRow) {
  newProjectColorRow.addEventListener('click', (e) => {
    const card = e.target.closest('.color-select-card');
    if (!card) return;
    newProjectColorRow.querySelectorAll('.color-select-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
  });
}

if (newProjectTemplateGrid) {
  newProjectTemplateGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.m3-template-card');
    if (!card) return;
    newProjectTemplateGrid.querySelectorAll('.m3-template-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
  });
}

// Delete Confirmation Modal Listeners
if (closeDeleteModalBtn) {
  closeDeleteModalBtn.addEventListener('click', closeDeleteModal);
}

if (cancelDeleteBtn) {
  cancelDeleteBtn.addEventListener('click', closeDeleteModal);
}

if (confirmDeleteBtn) {
  confirmDeleteBtn.addEventListener('click', confirmDeleteProject);
}

// Rename Project Modal Listeners
if (closeRenameModalBtn) {
  closeRenameModalBtn.addEventListener('click', closeRenameModal);
}

if (cancelRenameBtn) {
  cancelRenameBtn.addEventListener('click', closeRenameModal);
}

if (confirmRenameBtn) {
  confirmRenameBtn.addEventListener('click', submitRenameModal);
}

if (renameProjectForm) {
  renameProjectForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitRenameModal();
  });
}

if (renameProjectInput) {
  renameProjectInput.addEventListener('input', () => {
    const val = renameProjectInput.value;
    if (renameCharCounter) {
      renameCharCounter.textContent = `${val.length} / 60`;
    }
    if (renameClearBtn) {
      renameClearBtn.classList.toggle('hidden', val.length === 0);
    }
  });
}

if (renameClearBtn) {
  renameClearBtn.addEventListener('click', () => {
    if (renameProjectInput) {
      renameProjectInput.value = '';
      renameProjectInput.focus();
      if (renameCharCounter) {
        renameCharCounter.textContent = '0 / 60';
      }
      renameClearBtn.classList.add('hidden');
    }
  });
}

if (renameSuggestionsRow) {
  renameSuggestionsRow.addEventListener('click', (e) => {
    const chip = e.target.closest('.m3-suggestion-chip');
    if (!chip || !renameProjectInput) return;
    const suffix = chip.dataset.suffix || '';
    let currentVal = renameProjectInput.value.trim();
    if (!currentVal.endsWith(suffix.trim())) {
      renameProjectInput.value = (currentVal + suffix).slice(0, 60);
    }
    const val = renameProjectInput.value;
    if (renameCharCounter) {
      renameCharCounter.textContent = `${val.length} / 60`;
    }
    if (renameClearBtn) {
      renameClearBtn.classList.toggle('hidden', val.length === 0);
    }
    renameProjectInput.focus();
  });
}

// Close dialogs on outside backdrop click
window.addEventListener('click', (e) => {
  if (e.target === newProjectModal) {
    closeNewProjectModal();
  }
  if (e.target === deleteModal) {
    closeDeleteModal();
  }
  if (e.target === renameModal) {
    closeRenameModal();
  }
});

// Close dialogs on Escape key
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (newProjectModal && !newProjectModal.classList.contains('hidden')) {
      closeNewProjectModal();
    }
    if (deleteModal && !deleteModal.classList.contains('hidden')) {
      closeDeleteModal();
    }
    if (renameModal && !renameModal.classList.contains('hidden')) {
      closeRenameModal();
    }
  }
});

if (activeProjectBadge) {
  activeProjectBadge.addEventListener('click', () => {
    if (!activeProjectId) return;
    openRenameModal(activeProjectId);
  });
}


// ==========================================================================
// 2. Theme Management & Audio Synthesis
// ==========================================================================

/**
 * Switches between Dark Mode (Default) and Light Mode
 * @param {'dark' | 'light'} mode 
 */
function setAppTheme(mode) {
  const isDark = mode === 'dark';
  document.body.classList.toggle('dark-mode', isDark);

  if (themeMoonIcon && themeSunIcon && themeToggleText) {
    if (isDark) {
      themeMoonIcon.classList.add('hidden');
      themeSunIcon.classList.remove('hidden');
      themeToggleText.textContent = 'Light Mode';
      if (themeToggleBtn) themeToggleBtn.setAttribute('title', 'Switch to Light Mode');
    } else {
      themeSunIcon.classList.add('hidden');
      themeMoonIcon.classList.remove('hidden');
      themeToggleText.textContent = 'Dark Mode';
      if (themeToggleBtn) themeToggleBtn.setAttribute('title', 'Switch to Dark Mode');
    }
  }

  try {
    localStorage.setItem('chatgame_theme', mode);
  } catch (e) {}
}

if (themeToggleBtn) {
  themeToggleBtn.addEventListener('click', () => {
    const isCurrentlyDark = document.body.classList.contains('dark-mode');
    setAppTheme(isCurrentlyDark ? 'light' : 'dark');
  });
}

// ==========================================================================
// 2. Audio Effects Engine (Apple iMessage Soundtracks)
// ==========================================================================

const AUDIO_SEND_URL = '/audio/send.mp3';
const AUDIO_RECEIVE_URL = '/audio/receive.mp3';

let sharedAudioContext = null;
const audioBuffers = {
  sender: null,
  receiver: null
};
let isAudioPreloading = false;

/**
 * Preloads and decodes send.mp3 and receive.mp3 into memory buffers for 0ms latency polyphonic audio
 */
async function preloadAudioBuffers() {
  if (isAudioPreloading) return;
  isAudioPreloading = true;

  try {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtxClass) return;
    if (!sharedAudioContext) {
      sharedAudioContext = new AudioCtxClass();
    }

    const loadBuffer = async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} loading ${url}`);
      const arrayBuf = await res.arrayBuffer();
      return await sharedAudioContext.decodeAudioData(arrayBuf);
    };

    const [sendBuf, recvBuf] = await Promise.all([
      loadBuffer(AUDIO_SEND_URL).catch(e => { console.warn('Failed to load send.mp3 buffer:', e); return null; }),
      loadBuffer(AUDIO_RECEIVE_URL).catch(e => { console.warn('Failed to load receive.mp3 buffer:', e); return null; })
    ]);

    audioBuffers.sender = sendBuf;
    audioBuffers.receiver = recvBuf;
  } catch (err) {
    console.warn('Audio preloading error:', err);
  }
}

// Fallback HTML5 audio pool
const fallbackAudioElements = {
  sender: new Audio(AUDIO_SEND_URL),
  receiver: new Audio(AUDIO_RECEIVE_URL)
};
fallbackAudioElements.sender.preload = 'auto';
fallbackAudioElements.receiver.preload = 'auto';

/**
 * Plays authentic iMessage sound effects using audio/send.mp3 and audio/receive.mp3
 * @param {'sender' | 'receiver'} type 
 * @param {AudioNode | null} audioDestination Optional MediaStreamDestination node
 */
function playPopSound(type, audioDestination = null) {
  if (!isSoundEnabled) return;
  const isSender = (type === 'sender');
  const targetBuffer = isSender ? audioBuffers.sender : audioBuffers.receiver;
  const targetUrl = isSender ? AUDIO_SEND_URL : AUDIO_RECEIVE_URL;

  // 1. Try Web Audio API if buffer is decoded (enables 0-latency, polyphonic playback, and recording destination)
  try {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (AudioCtxClass) {
      if (!sharedAudioContext) {
        sharedAudioContext = (audioDestination && audioDestination.context) ? audioDestination.context : new AudioCtxClass();
      }
      if (sharedAudioContext.state === 'suspended') {
        sharedAudioContext.resume().catch(() => {});
      }

      if (targetBuffer) {
        const source = sharedAudioContext.createBufferSource();
        source.buffer = targetBuffer;

        const gain = sharedAudioContext.createGain();
        gain.gain.value = 0.9;

        source.connect(gain);
        gain.connect(sharedAudioContext.destination);

        if (audioDestination) {
          gain.connect(audioDestination);
        }

        source.start(0);
        return;
      }
    }
  } catch (webAudioErr) {
    console.warn('WebAudio playback notice:', webAudioErr);
  }

  // 2. Fallback to HTML5 Audio element
  try {
    const audioEl = new Audio(targetUrl);
    audioEl.volume = 0.9;
    const playPromise = audioEl.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        // May be prevented by browser autoplay policy before user interaction
        console.warn('Audio play prevented:', err);
      });
    }
  } catch (e) {
    console.warn('HTML5 Audio playback error:', e);
  }
}

// Unlock audio context and preload on first user interaction
['click', 'keydown', 'touchstart'].forEach(evt => {
  window.addEventListener(evt, () => {
    if (sharedAudioContext && sharedAudioContext.state === 'suspended') {
      sharedAudioContext.resume().catch(() => {});
    }
    if (!audioBuffers.sender || !audioBuffers.receiver) {
      preloadAudioBuffers();
    }
  }, { once: false, passive: true });
});

// Kick off buffer preloading immediately
preloadAudioBuffers();

/**
 * Updates message counter badge and empty state visibility
 */
function updateUIState() {
  const count = messages.length;
  
  if (recordBtnText && !isExporting) {
    const qTag = currentQuality === '4k' ? '4K' : '1080p';
    recordBtnText.textContent = `Download ${currentRatio} Video (${qTag})`;
  }

  if (downloadBtnText && !isExporting) {
    downloadBtnText.innerHTML = `Save Transparent Images (<span id="messageCountBadge">${count}</span>)`;
  }
  
  if (emptyStateNotice) {
    if (count > 0) {
      emptyStateNotice.classList.add('hidden');
    } else {
      emptyStateNotice.classList.remove('hidden');
    }
  }

  // Update button enabled state if not currently exporting
  if (!isExporting) {
    if (downloadChatBtn) downloadChatBtn.disabled = (count === 0);
    if (recordVideoBtn) recordVideoBtn.disabled = (count === 0);
  }
}

/**
 * Switches the sender bubble theme color between Blue and Purple.
 * Updates all existing and future sender message bubbles.
 * @param {'blue' | 'purple'} colorName 
 */
function setSenderTheme(colorName) {
  const isPurple = colorName === 'purple';
  currentSenderColor = isPurple ? COLOR_PURPLE : COLOR_BLUE;
  const hoverColor = isPurple ? COLOR_PURPLE_HOVER : COLOR_BLUE_HOVER;

  document.documentElement.style.setProperty('--sender-color', currentSenderColor);
  document.documentElement.style.setProperty('--sender-color-hover', hoverColor);

  if (colorBlueBtn && colorPurpleBtn) {
    colorBlueBtn.classList.toggle('active', !isPurple);
    colorPurpleBtn.classList.toggle('active', isPurple);
  }

  const senderMessageDivs = displayContainer.querySelectorAll('.message.sender');
  senderMessageDivs.forEach(div => {
    div.style.backgroundColor = currentSenderColor;
  });

  messages.forEach(msg => {
    if (msg.type === 'sender') {
      msg.color = currentSenderColor;
    }
  });

  if (!isLoadingProject) {
    triggerAutoSave();
  }
}

/**
 * Closes all open inline message editors
 */
function closeAllMessageEditors() {
  document.querySelectorAll('.message.is-editing').forEach(msgDiv => {
    msgDiv.classList.remove('is-editing');
    const panel = msgDiv.querySelector('.message-edit-panel');
    if (panel) panel.remove();
  });
}

/**
 * Opens an inline editor for a specific message bubble
 * @param {HTMLElement} messageDiv 
 * @param {Object} messageObj 
 */
function openMessageEditor(messageDiv, messageObj) {
  if (isExporting) return;
  if (messageDiv.classList.contains('is-editing')) return;

  // Close any other open editors or insert composers first
  closeAllMessageEditors();
  if (typeof closeAllInsertComposers === 'function') {
    closeAllInsertComposers();
  }

  messageDiv.classList.add('is-editing');

  const editPanel = document.createElement('div');
  editPanel.className = 'message-edit-panel';

  const textarea = document.createElement('textarea');
  textarea.className = 'message-edit-textarea';
  textarea.value = messageObj.text;
  textarea.rows = Math.min(5, Math.max(1, messageObj.text.split('\n').length));

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'message-edit-actions';

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn-edit-action btn-edit-delete';
  deleteBtn.title = 'Delete message';
  deleteBtn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
    <span>Delete</span>
  `;

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-edit-action btn-edit-cancel';
  cancelBtn.innerHTML = `<span>Cancel</span>`;

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn-edit-action btn-edit-save';
  saveBtn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><polyline points="20 6 9 17 4 12"></polyline></svg>
    <span>Save</span>
  `;

  actionsDiv.appendChild(deleteBtn);
  actionsDiv.appendChild(cancelBtn);
  actionsDiv.appendChild(saveBtn);

  editPanel.appendChild(textarea);
  editPanel.appendChild(actionsDiv);
  messageDiv.appendChild(editPanel);

  // Auto-focus and place cursor at end
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = textarea.value.length;

  const adjustHeight = () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.max(34, textarea.scrollHeight) + 'px';
  };
  adjustHeight();
  textarea.addEventListener('input', adjustHeight);

  const cleanup = () => {
    messageDiv.classList.remove('is-editing');
    editPanel.remove();
  };

  const handleSave = () => {
    const newText = textarea.value.trim();
    if (newText) {
      messageObj.text = newText;
      const textSpan = messageDiv.querySelector('.message-text');
      if (textSpan) textSpan.textContent = newText;
      triggerAutoSave();
    }
    cleanup();
    updateUIState();
  };

  const handleCancel = () => {
    cleanup();
  };

  const handleDelete = () => {
    const idx = messages.indexOf(messageObj);
    if (idx !== -1) {
      messages.splice(idx, 1);
    }
    messageDiv.remove();
    updateUIState();
    if (typeof refreshInsertRails === 'function') {
      refreshInsertRails();
    }
    triggerAutoSave();
  };

  saveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleSave();
  });

  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleCancel();
  });

  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleDelete();
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  });

  editPanel.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

/**
 * Creates a message bubble DOM element with text, edit pen, and selection events
 * @param {Object} messageObj 
 * @returns {HTMLElement} messageDiv
 */
function createMessageElement(messageObj) {
  const { type, text, color } = messageObj;
  const assignedColor = color || (type === 'sender' ? currentSenderColor : '#e5e5ea');

  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message', type);
  
  if (type === 'sender') {
    messageDiv.style.backgroundColor = assignedColor;
  }

  // Text content span
  const textSpan = document.createElement('span');
  textSpan.className = 'message-text';
  textSpan.textContent = text;
  messageDiv.appendChild(textSpan);

  // Edit Pen floating button
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'message-edit-btn';
  editBtn.setAttribute('title', 'Correct this message (Edit)');
  editBtn.setAttribute('aria-label', 'Edit message');
  editBtn.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 20h9"></path>
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
    </svg>
  `;
  messageDiv.appendChild(editBtn);

  // Clicking on message selects it and highlights adjacent insert rails
  messageDiv.addEventListener('click', (e) => {
    if (isExporting) return;
    if (e.target.closest('.message-edit-btn')) {
      openMessageEditor(messageDiv, messageObj);
      return;
    }

    // Select this message bubble
    document.querySelectorAll('.message.is-selected').forEach(m => {
      if (m !== messageDiv) m.classList.remove('is-selected');
    });
    messageDiv.classList.add('is-selected');
    highlightAdjacentInsertSlots(messageDiv);
  });

  return messageDiv;
}

/**
 * Inserts a message at a specific index in the conversation.
 * Handles DOM insertion, audio chime, UI updates, and backend auto-save.
 * @param {number} index 
 * @param {'sender' | 'receiver'} type 
 * @param {string} rawText 
 * @param {Object} options 
 * @returns {boolean}
 */
function insertMessageAt(index, type, rawText, options = {}) {
  const text = rawText.trim();
  if (!text) {
    return false; // Prevent empty submissions
  }

  const { playSound = true, triggerSave = true, color = null } = options;
  const assignedColor = color || (type === 'sender' ? currentSenderColor : '#e5e5ea');

  const messageObj = {
    type,
    text,
    color: assignedColor,
    timestamp: new Date()
  };

  const insertIdx = Math.max(0, Math.min(index, messages.length));
  messages.splice(insertIdx, 0, messageObj);

  const messageDiv = createMessageElement(messageObj);

  // Determine DOM insertion point based on existing .message elements
  const currentMsgElements = Array.from(displayContainer.querySelectorAll('.message'));
  if (insertIdx < currentMsgElements.length) {
    displayContainer.insertBefore(messageDiv, currentMsgElements[insertIdx]);
  } else {
    displayContainer.appendChild(messageDiv);
  }

  if (isSoundEnabled && playSound && !isLoadingProject) {
    playPopSound(type);
  }

  updateUIState();
  refreshInsertRails();

  if (insertIdx === messages.length - 1) {
    displayContainer.scrollTop = displayContainer.scrollHeight;
  } else {
    messageDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  if (triggerSave && !isLoadingProject) {
    triggerAutoSave();
  }
  return true;
}

/**
 * Appends a message to the end of the conversation
 * @param {'sender' | 'receiver'} type 
 * @param {string} rawText 
 * @param {Object} options
 * @returns {boolean} Success status
 */
function appendMessage(type, rawText, options = {}) {
  return insertMessageAt(messages.length, type, rawText, options);
}

/**
 * Creates an interactive insertion slot with Left (Receiver) and Right (Sender) buttons
 * @param {number} insertIndex 
 * @returns {HTMLElement} slot element
 */
function createInsertSlotElement(insertIndex) {
  const slot = document.createElement('div');
  slot.className = 'message-insert-slot';
  slot.dataset.insertIndex = insertIndex;

  const track = document.createElement('div');
  track.className = 'insert-slot-track';

  // Left Button: Receiver
  const receiverBtn = document.createElement('button');
  receiverBtn.type = 'button';
  receiverBtn.className = 'btn-insert-side btn-insert-receiver';
  receiverBtn.title = 'Add Receiver message here (Left)';
  receiverBtn.setAttribute('aria-label', `Insert Receiver message at position ${insertIndex + 1}`);
  receiverBtn.innerHTML = `
    <span class="insert-icon-circle">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
    </span>
    <span class="insert-side-label">Receiver</span>
  `;

  // Center Divider Line
  const dividerLine = document.createElement('div');
  dividerLine.className = 'insert-divider-line';
  dividerLine.title = 'Click to insert message in middle';
  dividerLine.innerHTML = `
    <span class="insert-divider-dash"></span>
    <span class="insert-divider-badge">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      <span>Insert here</span>
    </span>
    <span class="insert-divider-dash"></span>
  `;

  // Right Button: Sender
  const senderBtn = document.createElement('button');
  senderBtn.type = 'button';
  senderBtn.className = 'btn-insert-side btn-insert-sender';
  senderBtn.title = 'Add Sender message here (Right)';
  senderBtn.setAttribute('aria-label', `Insert Sender message at position ${insertIndex + 1}`);
  senderBtn.innerHTML = `
    <span class="insert-side-label">Sender</span>
    <span class="insert-icon-circle">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
    </span>
  `;

  track.appendChild(receiverBtn);
  track.appendChild(dividerLine);
  track.appendChild(senderBtn);
  slot.appendChild(track);

  receiverBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openInlineInsertComposer(slot, insertIndex, 'receiver');
  });

  senderBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openInlineInsertComposer(slot, insertIndex, 'sender');
  });

  dividerLine.addEventListener('click', (e) => {
    e.stopPropagation();
    openInlineInsertComposer(slot, insertIndex, 'sender');
  });

  return slot;
}

/**
 * Opens an authentic inline message composer at the given slot
 * @param {HTMLElement} slot 
 * @param {number} insertIndex 
 * @param {'sender' | 'receiver'} initialType 
 */
function openInlineInsertComposer(slot, insertIndex, initialType) {
  if (isExporting) return;

  closeAllInsertComposers();
  closeAllMessageEditors();

  slot.classList.add('has-composer');

  let activeType = initialType;

  const composer = document.createElement('div');
  composer.className = `inline-insert-composer ${activeType}`;
  if (activeType === 'sender') {
    composer.style.backgroundColor = currentSenderColor;
  }

  // Header with role badge and role switcher button
  const header = document.createElement('div');
  header.className = 'composer-header';

  const roleBadge = document.createElement('span');
  roleBadge.className = 'composer-role-badge';
  roleBadge.textContent = activeType === 'sender' ? 'Sender (Right Side)' : 'Receiver (Left Side)';

  const switchBtn = document.createElement('button');
  switchBtn.type = 'button';
  switchBtn.className = 'composer-switch-btn';
  switchBtn.innerHTML = activeType === 'sender' 
    ? `<span>Switch to Receiver (Left)</span> <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>`
    : `<span>Switch to Sender (Right)</span> <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

  header.appendChild(roleBadge);
  header.appendChild(switchBtn);

  // Textarea input
  const textarea = document.createElement('textarea');
  textarea.className = 'composer-textarea';
  textarea.placeholder = activeType === 'sender' 
    ? 'Type message to insert from Sender...' 
    : 'Type message to insert from Receiver...';
  textarea.rows = 2;

  // Actions footer
  const actions = document.createElement('div');
  actions.className = 'composer-actions';

  const hint = document.createElement('span');
  hint.className = 'composer-hint';
  hint.innerHTML = '<kbd>↵ Enter</kbd> to insert • <kbd>Esc</kbd> to cancel';

  const btnGroup = document.createElement('div');
  btnGroup.className = 'composer-btn-group';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'composer-btn composer-btn-cancel';
  cancelBtn.textContent = 'Cancel';

  const insertBtn = document.createElement('button');
  insertBtn.type = 'button';
  insertBtn.className = 'composer-btn composer-btn-submit';
  insertBtn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
    <span>Insert Message</span>
  `;

  btnGroup.appendChild(cancelBtn);
  btnGroup.appendChild(insertBtn);

  actions.appendChild(hint);
  actions.appendChild(btnGroup);

  composer.appendChild(header);
  composer.appendChild(textarea);
  composer.appendChild(actions);

  const track = slot.querySelector('.insert-slot-track');
  if (track) track.style.display = 'none';

  slot.appendChild(composer);

  const updateComposerRole = (newType) => {
    activeType = newType;
    composer.className = `inline-insert-composer ${activeType}`;
    if (activeType === 'sender') {
      composer.style.backgroundColor = currentSenderColor;
    } else {
      composer.style.backgroundColor = '';
    }
    roleBadge.textContent = activeType === 'sender' ? 'Sender (Right Side)' : 'Receiver (Left Side)';
    switchBtn.innerHTML = activeType === 'sender'
      ? `<span>Switch to Receiver (Left)</span> <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>`
      : `<span>Switch to Sender (Right)</span> <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
    textarea.placeholder = activeType === 'sender'
      ? 'Type message to insert from Sender...'
      : 'Type message to insert from Receiver...';
    textarea.focus();
  };

  switchBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    updateComposerRole(activeType === 'sender' ? 'receiver' : 'sender');
  });

  const cleanup = () => {
    slot.classList.remove('has-composer');
    composer.remove();
    if (track) track.style.display = '';
    if (messages.length === 0) {
      slot.remove();
      updateUIState();
    }
  };

  const handleInsert = () => {
    const text = textarea.value.trim();
    if (!text) {
      textarea.focus();
      return;
    }
    cleanup();
    insertMessageAt(insertIndex, activeType, text);
  };

  insertBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleInsert();
  });

  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    cleanup();
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleInsert();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cleanup();
    }
  });

  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.max(38, textarea.scrollHeight) + 'px';
  });

  setTimeout(() => {
    textarea.focus();
  }, 20);
}

/**
 * Reverts all open inline insert composer slots to default rail state
 */
function closeAllInsertComposers() {
  document.querySelectorAll('.message-insert-slot.has-composer').forEach(slot => {
    slot.classList.remove('has-composer');
    const comp = slot.querySelector('.inline-insert-composer');
    if (comp) comp.remove();
    const track = slot.querySelector('.insert-slot-track');
    if (track) track.style.display = '';
  });
}

/**
 * Highlights adjacent insert slots above and below a selected message
 * @param {HTMLElement} messageDiv 
 */
function highlightAdjacentInsertSlots(messageDiv) {
  document.querySelectorAll('.message-insert-slot.is-active-adjacent').forEach(s => s.classList.remove('is-active-adjacent'));
  let prev = messageDiv.previousElementSibling;
  while (prev && !prev.classList.contains('message-insert-slot')) {
    prev = prev.previousElementSibling;
  }
  if (prev && prev.classList.contains('message-insert-slot')) {
    prev.classList.add('is-active-adjacent');
  }

  let next = messageDiv.nextElementSibling;
  while (next && !next.classList.contains('message-insert-slot')) {
    next = next.nextElementSibling;
  }
  if (next && next.classList.contains('message-insert-slot')) {
    next.classList.add('is-active-adjacent');
  }
}

/**
 * Rebuilds the insertion rails across displayContainer matching messages array indices
 */
function refreshInsertRails() {
  if (isExporting || isLoadingProject || !displayContainer) return;

  // Don't disturb active in-progress composing
  if (displayContainer.querySelector('.message-insert-slot.has-composer')) return;

  displayContainer.querySelectorAll('.message-insert-slot').forEach(s => s.remove());

  const messageElements = Array.from(displayContainer.querySelectorAll('.message'));
  if (messageElements.length === 0) return;

  // Top slot (index 0)
  const slot0 = createInsertSlotElement(0);
  displayContainer.insertBefore(slot0, messageElements[0]);

  // Subsequent slots after each message
  messageElements.forEach((msgEl, idx) => {
    const slot = createInsertSlotElement(idx + 1);
    if (msgEl.nextSibling) {
      displayContainer.insertBefore(slot, msgEl.nextSibling);
    } else {
      displayContainer.appendChild(slot);
    }
  });
}

// Global click outside messages and insert slots to clear active highlights
document.addEventListener('click', (e) => {
  if (!e.target.closest('.message') && !e.target.closest('.message-insert-slot')) {
    document.querySelectorAll('.message.is-selected').forEach(m => m.classList.remove('is-selected'));
    document.querySelectorAll('.message-insert-slot.is-active-adjacent').forEach(s => s.classList.remove('is-active-adjacent'));
    closeAllInsertComposers();
  }
});

/**
 * Controls form controls interactive state during export or recording
 * @param {boolean} disabled 
 * @param {'video' | null} activeProcess
 */
function setControlsDisabled(disabled, activeProcess = null) {
  isExporting = disabled;
  senderInput.disabled = disabled;
  receiverInput.disabled = disabled;
  sendSenderBtn.disabled = disabled;
  sendReceiverBtn.disabled = disabled;
  if (downloadChatBtn) downloadChatBtn.disabled = disabled;
  recordVideoBtn.disabled = disabled;
  if (colorBlueBtn) colorBlueBtn.disabled = disabled;
  if (colorPurpleBtn) colorPurpleBtn.disabled = disabled;
  if (toggleBgBtn) toggleBgBtn.disabled = disabled;
  if (loadSampleBtn) loadSampleBtn.disabled = disabled;
  if (clearChatBtn) clearChatBtn.disabled = disabled;
  if (newProjectBtn) newProjectBtn.disabled = disabled;
  if (collapseSidebarBtn) collapseSidebarBtn.disabled = disabled;
  if (projectsList) {
    projectsList.querySelectorAll('button').forEach(btn => btn.disabled = disabled);
  }

  if (displayContainer) {
    displayContainer.querySelectorAll('.message-insert-slot').forEach(s => {
      s.style.display = disabled ? 'none' : '';
    });
  }

  if (disabled) {
    if (activeProcess === 'png') {
      if (downloadSpinner) downloadSpinner.classList.remove('hidden');
      if (downloadIcon) downloadIcon.classList.add('hidden');
    } else if (activeProcess === 'video') {
      if (recordSpinner) recordSpinner.classList.remove('hidden');
      if (recordIcon) recordIcon.classList.add('hidden');
    }
  } else {
    if (downloadSpinner) downloadSpinner.classList.add('hidden');
    if (downloadIcon) downloadIcon.classList.remove('hidden');
    if (recordSpinner) recordSpinner.classList.add('hidden');
    if (recordIcon) recordIcon.classList.remove('hidden');
  }
}
/**
 * Robust cross-browser blob file downloader
 * @param {Blob} blob 
 * @param {string} filename 
 */
function downloadBlob(blob, filename) {
  try {
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
      window.URL.revokeObjectURL(blobUrl);
    }, 2000);
    return true;
  } catch (err) {
    console.error('Download failed:', err);
    return false;
  }
}

// ==========================================================================
// 3. Event Listeners for Color Switching, Typing & Sending
// ==========================================================================

// Color switcher: Blue button
if (colorBlueBtn) {
  colorBlueBtn.addEventListener('click', () => {
    if (isExporting) return;
    setSenderTheme('blue');
  });
}

// Color switcher: Purple button
if (colorPurpleBtn) {
  colorPurpleBtn.addEventListener('click', () => {
    if (isExporting) return;
    setSenderTheme('purple');
  });
}

function updateRatioBadge() {
  if (!ratioBadgeText) return;
  const is4K = currentQuality === '4k';
  const tag = is4K ? '4K UHD 60FPS' : '1080p Retina 60FPS';
  if (currentRatio === '16:9') ratioBadgeText.textContent = `16:9 Widescreen (${tag})`;
  else if (currentRatio === '9:16') ratioBadgeText.textContent = `9:16 Shorts/Reels (${tag})`;
  else ratioBadgeText.textContent = `1:1 Square (${tag})`;
}

// Studio Aspect Ratio Selector (16:9, 9:16, 1:1)
function setStudioRatio(ratio) {
  if (isExporting) return;
  currentRatio = ratio;
  
  if (ratioOptions) {
    ratioOptions.querySelectorAll('.studio-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.ratio === ratio);
    });
  }

  stageFrame.classList.remove('ratio-16-9', 'ratio-9-16', 'ratio-1-1');
  stageFrame.classList.add(`ratio-${ratio.replace(':', '-')}`);

  updateRatioBadge();
  updateUIState();
  if (!isLoadingProject) {
    triggerAutoSave();
  }
}

if (ratioOptions) {
  ratioOptions.querySelectorAll('.studio-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      setStudioRatio(btn.dataset.ratio);
    });
  });
}

// Studio Resolution & Quality Selector (1080p Retina vs 4K Ultra HD)
function setStudioQuality(quality) {
  if (isExporting) return;
  currentQuality = quality;

  if (qualityOptions) {
    qualityOptions.querySelectorAll('.studio-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.quality === quality);
    });
  }

  updateRatioBadge();
  updateUIState();
  if (!isLoadingProject) {
    triggerAutoSave();
  }
}

if (qualityOptions) {
  qualityOptions.querySelectorAll('.studio-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      setStudioQuality(btn.dataset.quality);
    });
  });
}

// Studio Background Selector (Green, Blue, Black, Dark, White)
function setStudioBackground(bgType, color) {
  if (isExporting) return;
  if (bgType === 'green' && (!color || color === '#00B140')) {
    color = DIGITAL_GREEN;
  }
  currentBgType = bgType;
  currentBgColor = color;

  if (bgOptions) {
    bgOptions.querySelectorAll('.studio-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.bg === bgType);
    });
  }

  stageFrame.classList.remove('bg-green', 'bg-blue', 'bg-black', 'bg-dark', 'bg-white');
  stageFrame.classList.add(`bg-${bgType}`);

  if (bgIndicator && bgToggleText) {
    if (bgType === 'green') {
      bgIndicator.className = 'bg-indicator green';
      bgToggleText.textContent = 'Digital Green (#00FF00)';
    } else if (bgType === 'blue') {
      bgIndicator.className = 'bg-indicator blue';
      bgToggleText.textContent = 'Chroma Blue (#0047BB)';
    } else if (bgType === 'black') {
      bgIndicator.className = 'bg-indicator black';
      bgToggleText.textContent = 'Pure Black (Screen Blend)';
    } else if (bgType === 'dark') {
      bgIndicator.className = 'bg-indicator dark';
      bgToggleText.textContent = 'Dark Mode';
    } else {
      bgIndicator.className = 'bg-indicator white';
      bgToggleText.textContent = 'Clean White';
    }
  }

  const exportBadge = document.getElementById('exportModeBadge');
  const exportText = document.getElementById('exportModeBadgeText');
  const exportDot = document.getElementById('exportModeDot');
  if (exportText && exportDot) {
    if (bgType === 'green') {
      exportText.textContent = 'Export: Green Screen (#00FF00)';
      exportDot.style.backgroundColor = '#00FF00';
      exportDot.style.boxShadow = '0 0 6px #00FF00';
      if (exportBadge) {
        exportBadge.style.display = 'inline-flex';
        exportBadge.style.color = '#a7f3d0';
        exportBadge.style.background = 'rgba(0, 255, 0, 0.08)';
        exportBadge.style.borderColor = 'rgba(0, 255, 0, 0.25)';
      }
    } else {
      exportText.textContent = `Export: ${bgType.charAt(0).toUpperCase() + bgType.slice(1)}`;
      exportDot.style.backgroundColor = color || '#ffffff';
      exportDot.style.boxShadow = 'none';
      if (exportBadge) {
        exportBadge.style.display = 'inline-flex';
        exportBadge.style.color = '#e2e8f0';
        exportBadge.style.background = 'rgba(255, 255, 255, 0.06)';
        exportBadge.style.borderColor = 'rgba(255, 255, 255, 0.15)';
      }
    }
  }

  if (!isLoadingProject) {
    triggerAutoSave();
  }
}

if (bgOptions) {
  bgOptions.querySelectorAll('.studio-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      setStudioBackground(btn.dataset.bg, btn.dataset.color);
    });
  });
}

// Studio Framing Width Selector (Narrow / Split-Screen, Standard, Wide)
function setStudioWidth(preset) {
  if (isExporting) return;
  currentWidthPreset = preset;

  if (widthOptions) {
    widthOptions.querySelectorAll('.studio-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.width === preset);
    });
  }

  stageFrame.classList.remove('width-narrow', 'width-standard', 'width-wide');
  stageFrame.classList.add(`width-${preset}`);

  if (!isLoadingProject) {
    triggerAutoSave();
  }
}

if (widthOptions) {
  widthOptions.querySelectorAll('.studio-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      setStudioWidth(btn.dataset.width);
    });
  });
}

// Studio Vertical Placement Selector (Upper Third, Center, Lower Third)
function setStudioVAlign(valign) {
  if (isExporting) return;
  currentVAlign = valign;

  if (valignOptions) {
    valignOptions.querySelectorAll('.studio-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.valign === valign);
    });
  }

  stageFrame.classList.remove('valign-top', 'valign-center', 'valign-bottom');
  stageFrame.classList.add(`valign-${valign}`);

  if (!isLoadingProject) {
    triggerAutoSave();
  }
}

if (valignOptions) {
  valignOptions.querySelectorAll('.studio-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      setStudioVAlign(btn.dataset.valign);
    });
  });
}

// Studio Animation Pacing Selector (Fast, Cinematic, Slow)
function setStudioPacing(pacing) {
  if (isExporting) return;
  currentPacing = pacing;

  if (pacingOptions) {
    pacingOptions.querySelectorAll('.studio-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.pacing === pacing);
    });
  }

  if (!isLoadingProject) {
    triggerAutoSave();
  }
}

if (pacingOptions) {
  pacingOptions.querySelectorAll('.studio-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      setStudioPacing(btn.dataset.pacing);
    });
  });
}

// Studio Toggle: Bouncy Apple Spring Animation
if (toggleBounceBtn) {
  toggleBounceBtn.addEventListener('click', () => {
    isBounceEnabled = !isBounceEnabled;
    toggleBounceBtn.classList.toggle('active', isBounceEnabled);
    if (bounceStatusText) {
      bounceStatusText.textContent = isBounceEnabled ? 'Active' : 'Off';
    }
    triggerAutoSave();
  });
}

// Studio Toggle: iMessage Audio Sound Effects
if (toggleSoundBtn) {
  toggleSoundBtn.addEventListener('click', () => {
    isSoundEnabled = !isSoundEnabled;
    toggleSoundBtn.classList.toggle('active', isSoundEnabled);
    if (soundStatusText) {
      soundStatusText.textContent = isSoundEnabled ? 'Active' : 'Off';
    }
    if (isSoundEnabled) {
      playPopSound('sender'); // subtle confirmation chime
    }
    triggerAutoSave();
  });
}

// Studio Toggle: Cinematic Drop Shadow for Floating Bubbles
if (toggleShadowBtn) {
  toggleShadowBtn.addEventListener('click', () => {
    isShadowEnabled = !isShadowEnabled;
    toggleShadowBtn.classList.toggle('active', isShadowEnabled);
    if (shadowStatusText) {
      shadowStatusText.textContent = isShadowEnabled ? 'Active' : 'Off';
    }
    stageFrame.classList.toggle('has-shadow', isShadowEnabled);
    triggerAutoSave();
  });
}

// Studio Scene Backdrop Reference Matcher (Upload Screenshot of Footage)
if (uploadBackdropBtn && backdropFileInput) {
  uploadBackdropBtn.addEventListener('click', () => {
    if (!customBackdropDataUrl) {
      backdropFileInput.click();
    } else {
      // Toggle visibility if already uploaded
      isBackdropVisible = !isBackdropVisible;
      if (stageBackdrop) {
        stageBackdrop.classList.toggle('active', isBackdropVisible);
      }
      uploadBackdropBtn.classList.toggle('active', isBackdropVisible);
      if (backdropStatusText) {
        backdropStatusText.textContent = isBackdropVisible ? 'Showing' : 'Hidden';
      }
      if (backdropBtnTitle) {
        backdropBtnTitle.textContent = isBackdropVisible ? 'Hide Scene Still' : 'Show Scene Still';
      }
    }
  });

  backdropFileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      customBackdropDataUrl = event.target.result;
      isBackdropVisible = true;
      if (stageBackdrop) {
        stageBackdrop.style.backgroundImage = `url("${customBackdropDataUrl}")`;
        stageBackdrop.classList.add('active');
      }
      uploadBackdropBtn.classList.add('active');
      if (backdropStatusText) {
        backdropStatusText.textContent = 'Showing';
      }
      if (backdropBtnTitle) {
        backdropBtnTitle.textContent = 'Hide Scene Still';
      }
    };
    reader.readAsDataURL(file);
  });
}

// Stage background preview toggle button in top bar
if (toggleBgBtn) {
  toggleBgBtn.addEventListener('click', () => {
    let nextBg = 'white';
    let nextColor = '#ffffff';
    if (currentBgType === 'green') {
      nextBg = 'black';
      nextColor = '#000000';
    } else if (currentBgType === 'black') {
      nextBg = 'white';
      nextColor = '#ffffff';
    } else {
      nextBg = 'green';
      nextColor = DIGITAL_GREEN;
    }
    setStudioBackground(nextBg, nextColor);
  });
}

// Handle Sender Send button
sendSenderBtn.addEventListener('click', () => {
  if (isExporting) return;
  const success = appendMessage('sender', senderInput.value);
  if (success) {
    senderInput.value = '';
    senderCharCount.textContent = '0 chars';
    triggerAutoSave();
    senderInput.focus();
  }
});

// Handle Receiver Send button
sendReceiverBtn.addEventListener('click', () => {
  if (isExporting) return;
  const success = appendMessage('receiver', receiverInput.value);
  if (success) {
    receiverInput.value = '';
    receiverCharCount.textContent = '0 chars';
    triggerAutoSave();
    receiverInput.focus();
  }
});

// Real-time character count and debounced draft auto-save
senderInput.addEventListener('input', () => {
  senderCharCount.textContent = `${senderInput.value.length} chars`;
  triggerAutoSave();
});

receiverInput.addEventListener('input', () => {
  receiverCharCount.textContent = `${receiverInput.value.length} chars`;
  triggerAutoSave();
});

// Enter key sends, Shift+Enter creates a new line
senderInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendSenderBtn.click();
  }
});

receiverInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendReceiverBtn.click();
  }
});

// Clear Chat button (Safeguarded if element exists)
if (clearChatBtn) {
  clearChatBtn.addEventListener('click', () => {
    if (isExporting) return;
    closeAllInsertComposers();
    messages.length = 0;
    const messageElements = displayContainer.querySelectorAll('.message, .typing-bubble, .message-insert-slot');
    messageElements.forEach(el => el.remove());
    updateUIState();
    refreshInsertRails();
    triggerAutoSave();
  });
}

// Load Demo Conversation function
window.loadDemoConversation = function loadDemoConversation() {
  if (isExporting) return;
  closeAllInsertComposers();
  messages.length = 0;
  displayContainer.querySelectorAll('.message, .typing-bubble, .message-insert-slot').forEach(el => el.remove());

  const sampleData = [
    { type: 'receiver', text: 'Hey Alex! Are we still meeting for lunch today?' },
    { type: 'sender', text: 'Hey! Yes, definitely. How about that new Italian place on 5th?' },
    { type: 'receiver', text: 'Sounds delicious! Around 12:30 PM?' },
    { type: 'sender', text: 'Perfect. See you there! 🍕' }
  ];

  sampleData.forEach(item => {
    appendMessage(item.type, item.text, { playSound: false, triggerSave: false });
  });
  refreshInsertRails();
  triggerAutoSave();
};

if (loadSampleBtn) {
  loadSampleBtn.addEventListener('click', window.loadDemoConversation);
}

// Empty State Quick-Start Buttons (Display Screen)
const emptyAddReceiverBtn = document.getElementById('emptyAddReceiverBtn');
const emptyAddSenderBtn = document.getElementById('emptyAddSenderBtn');

if (emptyAddReceiverBtn) {
  emptyAddReceiverBtn.addEventListener('click', () => {
    if (isExporting) return;
    if (emptyStateNotice) emptyStateNotice.classList.add('hidden');
    const slot = createInsertSlotElement(0);
    displayContainer.appendChild(slot);
    openInlineInsertComposer(slot, 0, 'receiver');
  });
}

if (emptyAddSenderBtn) {
  emptyAddSenderBtn.addEventListener('click', () => {
    if (isExporting) return;
    if (emptyStateNotice) emptyStateNotice.classList.add('hidden');
    const slot = createInsertSlotElement(0);
    displayContainer.appendChild(slot);
    openInlineInsertComposer(slot, 0, 'sender');
  });
}

// ==========================================================================
// 4. Server-Side Export: Transparent PNGs in ZIP Archive (/api/export/png)
// ==========================================================================

/**
 * Gathers message state and requests server-side transparent PNG generation
 * matching all studio settings 1-to-1 (aspect ratio, scene width, Apple tails,
 * gradients, typography, and drop shadows) in high resolution, packaged in a ZIP archive.
 */
downloadChatBtn.addEventListener('click', async () => {
  if (messages.length === 0) {
    alert('Please add at least one message before exporting.');
    return;
  }

  // Close any active inline editors or composers before capturing
  closeAllMessageEditors();
  closeAllInsertComposers();
  document.querySelectorAll('.message.is-selected').forEach(m => m.classList.remove('is-selected'));
  document.querySelectorAll('.message-insert-slot.is-active-adjacent').forEach(s => s.classList.remove('is-active-adjacent'));

  setControlsDisabled(true, 'png');
  downloadBtnText.textContent = 'Rendering High-Res PNGs...';

  try {
    const payload = {
      messages: messages.map(m => ({
        type: m.type,
        text: m.text,
        color: m.color || (m.type === 'sender' ? currentSenderColor : '#e5e5ea')
      })),
      currentRatio,
      currentQuality,
      currentBgType,
      currentBgColor,
      currentWidthPreset,
      currentVAlign,
      currentPacing,
      isBounceEnabled,
      isShadowEnabled,
      currentSenderColor,
      projectName: (activeProjectNameDisplay && activeProjectNameDisplay.textContent.trim()) || 'imessage'
    };

    const response = await fetch('/api/export/png', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server responded with HTTP ${response.status}`);
    }

    downloadBtnText.textContent = 'Streaming ZIP...';

    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition');
    let filename = 'imessage_transparent_pngs.zip';
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="?([^";]+)"?/);
      if (match && match[1]) filename = match[1];
    }

    downloadBlob(blob, filename);

    downloadBtnText.textContent = 'Saved! ✓';
    await new Promise(resolve => setTimeout(resolve, 1200));

  } catch (error) {
    console.error('Error generating transparent PNG export:', error);
    alert('An error occurred during transparent PNG export: ' + (error.message || error));
  } finally {
    setControlsDisabled(false);
    updateUIState();
  }
});

// ==========================================================================
// 5. Server-Side 1080p Video Generation with Real-Time Progress Tracking
// ==========================================================================

/**
 * Gathers message state and initiates server-side 1080p 60fps video generation.
 * Streams real-time progress events from the server to accurately update the progress bar,
 * percentage counter, current frame, and ETA before downloading the master video.
 */
recordVideoBtn.addEventListener('click', async () => {
  if (messages.length === 0) {
    alert('Please add at least one message before recording a video.');
    return;
  }

  // Close any active inline editors or insert composers before recording
  closeAllMessageEditors();
  closeAllInsertComposers();
  document.querySelectorAll('.message.is-selected').forEach(m => m.classList.remove('is-selected'));
  document.querySelectorAll('.message-insert-slot.is-active-adjacent').forEach(s => s.classList.remove('is-active-adjacent'));

  setControlsDisabled(true, 'video');

  // Reset & reveal progress container
  if (videoProgressContainer) {
    videoProgressContainer.classList.remove('hidden');
  }
  if (progressBar) progressBar.style.width = '0%';
  if (progressPercentage) progressPercentage.textContent = '0%';
    const qLabel = currentQuality === '4k' ? '4K Master' : '1080p Retina';
    if (progressStatusText) progressStatusText.textContent = `Initializing ${currentRatio} (${qLabel}) Render...`;
    if (progressDetailText) progressDetailText.textContent = 'Connecting to high-fidelity server engine...';
    if (progressEtaText) progressEtaText.textContent = 'Calculating ETA...';
    if (progressSpinner) progressSpinner.classList.remove('hidden');

    recordBtnText.textContent = `Rendering ${currentRatio} (${qLabel})...`;

    let eventSource = null;
    let pollInterval = null;

    try {
      const payload = {
        messages: messages.map(m => ({
          type: m.type,
          text: m.text,
          color: m.color || (m.type === 'sender' ? currentSenderColor : '#e5e5ea')
        })),
        currentRatio,
        currentQuality,
        currentBgType,
        currentBgColor,
        currentWidthPreset,
        currentVAlign,
        currentPacing,
        isBounceEnabled,
        isShadowEnabled,
        isSoundEnabled,
        currentSenderColor,
        format: 'mp4',
        fps: 60
      };

    // 1. Initiate job on server
    const startRes = await fetch('/api/export/video/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!startRes.ok) {
      const err = await startRes.json().catch(() => ({}));
      throw new Error(err.error || `Server responded with HTTP ${startRes.status}`);
    }

    const { jobId, totalFrames, filename } = await startRes.json();

    if (progressDetailText) {
      progressDetailText.textContent = `Master 1080p 60fps • 0 / ${totalFrames} frames`;
    }

    // 2. Track progress with Server-Sent Events (SSE) and polling fallback
    await new Promise((resolve, reject) => {
      let isDone = false;

      function handleProgressUpdate(data) {
        if (isDone) return;

        const percent = Math.min(100, Math.max(0, data.percent || 0));
        if (progressBar) progressBar.style.width = `${percent}%`;
        if (progressPercentage) progressPercentage.textContent = `${percent}%`;

        if (data.status === 'starting') {
          if (progressStatusText) progressStatusText.textContent = 'Initializing canvas pipeline...';
        } else if (data.status === 'rendering') {
          if (progressStatusText) {
            progressStatusText.textContent = `Rendering frame ${data.currentFrame || 0} of ${data.totalFrames || totalFrames}`;
          }
          if (progressDetailText) {
            progressDetailText.textContent = `Master 1080p 60fps • Apple Spring Physics`;
          }
          if (progressEtaText) {
            if (typeof data.etaSeconds === 'number' && data.etaSeconds > 0) {
              const mins = Math.floor(data.etaSeconds / 60);
              const secs = data.etaSeconds % 60;
              progressEtaText.textContent = mins > 0 ? `~${mins}m ${secs}s remaining` : `~${secs}s remaining`;
            } else {
              progressEtaText.textContent = 'Calculating ETA...';
            }
          }
        } else if (data.status === 'ready') {
          isDone = true;
          if (progressBar) progressBar.style.width = '100%';
          if (progressPercentage) progressPercentage.textContent = '100%';
          if (progressStatusText) progressStatusText.textContent = 'Render Complete! Finalizing download...';
          if (progressDetailText) progressDetailText.textContent = 'Streaming MP4 file from server...';
          if (progressEtaText) progressEtaText.textContent = 'Done!';
          cleanup();
          resolve(data);
        } else if (data.status === 'error') {
          isDone = true;
          cleanup();
          reject(new Error(data.error || 'Server reported render failure'));
        }
      }

      function cleanup() {
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      }

      // Open SSE connection
      try {
        eventSource = new EventSource(`/api/export/video/events/${jobId}`);
        eventSource.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            handleProgressUpdate(data);
          } catch (err) {
            console.warn('Error parsing SSE event data:', err);
          }
        };
        eventSource.onerror = () => {
          // SSE dropped or unsupported, fallback to polling
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
        };
      } catch (e) {
        console.warn('EventSource not available, falling back to polling:', e);
      }

      // Polling fallback every 750ms
      pollInterval = setInterval(async () => {
        if (isDone) return;
        try {
          const pollRes = await fetch(`/api/export/video/progress/${jobId}`);
          if (pollRes.ok) {
            const pollData = await pollRes.json();
            handleProgressUpdate(pollData);
          }
        } catch (e) {}
      }, 750);
    });

    // 3. Download the finished master video file
    if (progressBar) progressBar.style.width = '100%';
    if (progressPercentage) progressPercentage.textContent = '100%';
    if (progressStatusText) progressStatusText.textContent = 'Finalizing & Downloading Video...';
    if (progressDetailText) progressDetailText.textContent = 'Streaming MP4 file from server...';
    if (progressEtaText) progressEtaText.textContent = 'Finishing up...';

    recordBtnText.textContent = 'Downloading Video...';

    const downloadRes = await fetch(`/api/export/video/download/${jobId}`);
    if (!downloadRes.ok) {
      const errJson = await downloadRes.json().catch(() => ({}));
      throw new Error(errJson.error || `Download failed with HTTP ${downloadRes.status}`);
    }

    const blob = await downloadRes.blob();
    const finalFilename = filename || `imessage_${currentRatio.replace(':', 'x')}_${currentBgType}.mp4`;
    downloadBlob(blob, finalFilename);

    recordBtnText.textContent = `Saved ${currentRatio} Video! ✓`;
    if (progressStatusText) progressStatusText.textContent = 'Render & Download Complete! ✓';
    if (progressDetailText) progressDetailText.textContent = `${finalFilename} saved to Downloads.`;
    if (progressSpinner) progressSpinner.classList.add('hidden');

    checkRecentCompletedRender();

    // Fade out progress panel after 3.5s
    setTimeout(() => {
      if (videoProgressContainer) {
        videoProgressContainer.classList.add('hidden');
      }
      recordBtnText.textContent = `Download ${currentRatio} Video`;
    }, 3500);

  } catch (error) {
    console.error('Error generating video:', error);
    if (progressStatusText) progressStatusText.textContent = 'Rendering Error';
    if (progressDetailText) progressDetailText.textContent = error.message || String(error);
    if (progressSpinner) progressSpinner.classList.add('hidden');
    checkRecentCompletedRender();
    await new Promise(r => setTimeout(r, 60));
    alert('An error occurred during video generation: ' + (error.message || error));
  } finally {
    if (eventSource) eventSource.close();
    if (pollInterval) clearInterval(pollInterval);
    setControlsDisabled(false);
    updateUIState();
  }
});

/**
 * Checks server for recent finished video renders to allow instant download / recovery
 */
async function checkRecentCompletedRender() {
  const banner = document.getElementById('recentRenderBanner');
  const subtitle = document.getElementById('recentRenderSubtitle');
  const btn = document.getElementById('downloadRecentVideoBtn');
  if (!banner || !btn) return;

  try {
    const res = await fetch('/api/export/video/latest');
    if (!res.ok) {
      banner.classList.add('hidden');
      return;
    }
    const data = await res.json();
    const ageMs = Date.now() - data.mtime;
    // Show banner if render is within the last 4 hours
    if (ageMs < 4 * 60 * 60 * 1000 && data.sizeBytes > 0) {
      const sizeMb = (data.sizeBytes / (1024 * 1024)).toFixed(1);
      const minsAgo = Math.max(1, Math.round(ageMs / 60000));
      if (subtitle) {
        subtitle.textContent = `${data.filename} (${sizeMb} MB) • rendered ${minsAgo}m ago`;
      }
      btn.onclick = () => {
        const downloadUrl = `/api/export/video/download/${data.jobId}?filename=${encodeURIComponent(data.filename)}`;
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = data.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  } catch (e) {
    banner.classList.add('hidden');
  }
}

// ==========================================================================
// 6. Initialization
// ==========================================================================

async function initApp() {
  // Initialize Default App Theme
  setAppTheme('dark');

  // Initialize Message Controls visibility & screen expansion toggle
  initMessageControlsToggle();

  // Check for any recent completed render available for instant download
  checkRecentCompletedRender();

  // Load saved projects from backend
  const projects = await fetchProjectsList();

  if (projects.length > 0) {
    // When page loads, fetch the most recently accessed project
    await loadProject(projects[0].id);
  } else {
    // Initial setup: create default project with initial sample conversation
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Untitled Project' })
      });
      if (res.ok) {
        const newProj = await res.json();
        activeProjectId = newProj.id;
        await fetchProjectsList();
        if (typeof window.loadDemoConversation === 'function') {
          window.loadDemoConversation();
        }
      }
    } catch (e) {
      console.error('Initial project setup error:', e);
    }
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

