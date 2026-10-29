const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { PassThrough } = require('stream');
const puppeteer = require('puppeteer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const archiver = require('archiver');

// Configure static FFmpeg binary
ffmpeg.setFfmpegPath(ffmpegStatic);

const app = express();
const PORT = process.env.PORT || 3000;

// Temporary directory for finished render jobs
const JOBS_DIR = path.join(__dirname, 'render_jobs');
if (!fs.existsSync(JOBS_DIR)) {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
}

// In-memory active video rendering jobs map
const videoJobs = new Map();

// Periodic cleanup:
// 1. Never purge jobs that are actively rendering/starting/muxing unless stalled for > 45 minutes
// 2. Finished ('ready') or errored jobs are retained for 3 hours so users can safely download & re-download
// 3. Orphaned temporary video files on disk older than 4 hours are pruned
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of videoJobs.entries()) {
    const isActive = job.status === 'rendering' || job.status === 'starting' || job.status === 'muxing';
    if (isActive) {
      const lastActive = job.lastActivityAt || job.startTime || job.createdAt || now;
      if (now - lastActive > 45 * 60 * 1000) {
        console.warn(`[Cleanup] Purging stalled render job: ${id}`);
        try { if (job.browser) job.browser.close(); } catch (e) {}
        try { if (job.outputPath && fs.existsSync(job.outputPath)) fs.unlinkSync(job.outputPath); } catch (e) {}
        const videoOnlyPath = path.join(JOBS_DIR, `${id}_video.mp4`);
        try { if (fs.existsSync(videoOnlyPath)) fs.unlinkSync(videoOnlyPath); } catch (e) {}
        videoJobs.delete(id);
      }
      continue;
    }

    // Retain finished or errored jobs for 3 hours
    const completedTime = job.completedAt || job.createdAt || now;
    if (now - completedTime > 3 * 60 * 60 * 1000) {
      if (job.outputPath && fs.existsSync(job.outputPath)) {
        try { fs.unlinkSync(job.outputPath); } catch (e) {}
      }
      const videoOnlyPath = path.join(JOBS_DIR, `${id}_video.mp4`);
      try { if (fs.existsSync(videoOnlyPath)) fs.unlinkSync(videoOnlyPath); } catch (e) {}
      videoJobs.delete(id);
    }
  }

  // Prune any orphaned files in JOBS_DIR older than 4 hours
  try {
    const files = fs.readdirSync(JOBS_DIR);
    for (const file of files) {
      if (!file.endsWith('.mp4')) continue;
      const filePath = path.join(JOBS_DIR, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > 4 * 60 * 60 * 1000) {
        try { fs.unlinkSync(filePath); } catch (e) {}
      }
    }
  } catch (e) {}
}, 5 * 60 * 1000);

// Body parsing with generous limit for large message payloads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static file hosting for existing UI with cache-busting headers
app.use(express.static(path.join(__dirname), {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  }
}));

// Dedicated static route for authentic audio assets
app.use('/audio', express.static(path.join(__dirname, 'audio')));

// Dedicated route for Notifications Studio
app.get('/notifications', (req, res) => {
  res.sendFile(path.join(__dirname, 'notifications.html'));
});

const db = require('./db');

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    node: process.version,
    ffmpeg: !!ffmpegStatic,
    archiver: typeof archiver === 'function' || !!archiver.ZipArchive,
    activeJobs: videoJobs.size
  });
});

// ==========================================================================
// Project Architecture API Endpoints (SQLite Persistent Store)
// ==========================================================================

// GET /api/projects: Return all projects, ordered by last_accessed descending, for the sidebar
app.get('/api/projects', async (req, res) => {
  try {
    const projects = await db.getAllProjects();
    res.json(projects);
  } catch (err) {
    console.error('Error fetching projects:', err);
    res.status(500).json({ error: 'Failed to retrieve projects' });
  }
});

// POST /api/projects: Create a new project named "Untitled Project" with default settings in project_state. Return the new project ID.
app.post('/api/projects', async (req, res) => {
  try {
    const name = (req.body && req.body.name && req.body.name.trim()) || 'Untitled Project';
    const settings = req.body && req.body.settings ? req.body.settings : null;
    const draftSender = req.body && req.body.draft_sender ? req.body.draft_sender : '';
    const draftReceiver = req.body && req.body.draft_receiver ? req.body.draft_receiver : '';
    const messages = req.body && Array.isArray(req.body.messages) ? req.body.messages : [];
    const project = await db.createProject(name, settings, draftSender, draftReceiver, messages);
    res.status(201).json(project);
  } catch (err) {
    console.error('Error creating project:', err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// GET /api/projects/:id: Return a complete payload containing project details, exact state, and messages ordered by order_index
app.get('/api/projects/:id', async (req, res) => {
  try {
    const project = await db.getProjectById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (err) {
    console.error('Error fetching project by id:', err);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// DELETE /api/projects/:id: Delete a project and cascade the deletion to its state and messages
app.delete('/api/projects/:id', async (req, res) => {
  try {
    const success = await db.deleteProject(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (err) {
    console.error('Error deleting project:', err);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// PUT /api/projects/:id/sync: Upsert the current state. Accept JSON payload containing settings, draft_sender, draft_receiver, and full messages array. Overwrite existing state and replace messages in the database.
app.put('/api/projects/:id/sync', async (req, res) => {
  try {
    const { name, settings, draft_sender, draft_receiver, messages } = req.body || {};
    const result = await db.syncProject(req.params.id, {
      name,
      settings,
      draft_sender,
      draft_receiver,
      messages
    });
    if (!result) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ success: true, last_accessed: result.last_accessed });
  } catch (err) {
    console.error('Error syncing project state:', err);
    res.status(500).json({ error: 'Failed to sync project state' });
  }
});

// PATCH /api/projects/:id: Rename project
app.patch('/api/projects/:id', async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Project name is required' });
    }
    const success = await db.renameProject(req.params.id, name.trim());
    if (!success) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ success: true, name: name.trim() });
  } catch (err) {
    console.error('Error renaming project:', err);
    res.status(500).json({ error: 'Failed to rename project' });
  }
});


/**
 * Calculates typing indicator duration based on message length in characters.
 * Accurately mimics human typing rhythm, strictly clamped between 0.5s (500ms) and 3.0s (3000ms).
 * e.g., 4 chars ~ 0.5-0.6s, 30 chars ~ 1.25s, longer messages scale smoothly up to 3.0s max.
 */
function calculateTypingDuration(text, pacing = 'normal') {
  const chars = String(text || '').trim().length;
  let baseMs = 500;
  let msPerChar = 25;

  if (pacing === 'fast') {
    baseMs = 500;
    msPerChar = 18;
  } else if (pacing === 'slow') {
    baseMs = 550;
    msPerChar = 32;
  }

  const duration = baseMs + chars * msPerChar;
  return Math.min(3000, Math.max(500, Math.round(duration)));
}

/**
 * Calculates video rendering parameters from payload
 */
function computeVideoConfig(payload) {
  const {
    messages = [],
    currentRatio = '16:9',
    currentQuality = '1080p',
    currentBgType = 'green',
    currentBgColor = '#00FF00',
    currentWidthPreset = 'narrow',
    currentVAlign = 'top',
    currentPacing = 'cinematic',
    isBounceEnabled = true,
    isShadowEnabled = true,
    isSoundEnabled = true,
    currentSenderColor = '#007aff',
    format = 'mp4',
    fps = 60
  } = payload;

  const is4K = currentQuality === '4k';
  const scale = is4K ? 2 : 1;

  let baseWidth = 1920;
  let baseHeight = 1080;
  let baseChatColumnWidth = 1060;
  let baseFontSize = 38;
  let baseLineHeight = 52;
  let basePaddingX = 36;
  let basePaddingY = 22;

  if (currentRatio === '16:9') {
    baseWidth = 1920;
    baseHeight = 1080;
    baseFontSize = 38;
    baseLineHeight = 52;
    basePaddingX = 36;
    basePaddingY = 22;
    if (currentWidthPreset === 'narrow') {
      baseChatColumnWidth = 740;
      baseFontSize = 33;
      baseLineHeight = 46;
      basePaddingX = 30;
      basePaddingY = 19;
    } else if (currentWidthPreset === 'wide') {
      baseChatColumnWidth = 1300;
    } else {
      baseChatColumnWidth = 1060;
    }
  } else if (currentRatio === '9:16') {
    baseWidth = 1080;
    baseHeight = 1920;
    baseFontSize = 38;
    baseLineHeight = 52;
    basePaddingX = 34;
    basePaddingY = 22;
    if (currentWidthPreset === 'narrow') {
      baseChatColumnWidth = 780;
      baseFontSize = 33;
      baseLineHeight = 46;
      basePaddingX = 30;
      basePaddingY = 19;
    } else if (currentWidthPreset === 'wide') {
      baseChatColumnWidth = 980;
    } else {
      baseChatColumnWidth = 900;
    }
  } else if (currentRatio === '1:1') {
    baseWidth = 1080;
    baseHeight = 1080;
    baseFontSize = 36;
    baseLineHeight = 48;
    basePaddingX = 32;
    basePaddingY = 20;
    if (currentWidthPreset === 'narrow') {
      baseChatColumnWidth = 720;
      baseFontSize = 32;
      baseLineHeight = 45;
      basePaddingX = 28;
      basePaddingY = 18;
    } else if (currentWidthPreset === 'wide') {
      baseChatColumnWidth = 980;
    } else {
      baseChatColumnWidth = 860;
    }
  }

  const width = baseWidth * scale;
  const height = baseHeight * scale;
  const chatColumnWidth = baseChatColumnWidth * scale;
  const fontSize = baseFontSize * scale;
  const lineHeight = baseLineHeight * scale;
  const paddingX = basePaddingX * scale;
  const paddingY = basePaddingY * scale;

  const bgMap = {
    green: '#00FF00',
    blue: '#0047BB',
    black: '#000000',
    dark: '#121217',
    white: '#FFFFFF'
  };
  let effectiveBgColor = currentBgColor || bgMap[currentBgType] || '#00FF00';
  if (effectiveBgColor === '#00B140') {
    effectiveBgColor = '#00FF00';
  }

  // Pacing timing parameters for reading hold duration
  let minHold = 1000;
  let maxHold = 1900;
  let holdPerChar = 36;
  let finalHold = 1500;

  if (currentPacing === 'fast') {
    minHold = 700;
    maxHold = 1300;
    holdPerChar = 24;
    finalHold = 1100;
  } else if (currentPacing === 'slow') {
    minHold = 1400;
    maxHold = 2600;
    holdPerChar = 50;
    finalHold = 2000;
  }

  // Pre-calculate approximate total duration and sound cues with dynamic typing bubble durations
  let cursor = 500;
  const audioCues = [];
  const processedMessages = messages.map(m => {
    const itemTypingDuration = calculateTypingDuration(m.text, currentPacing);
    cursor += itemTypingDuration;
    audioCues.push({
      type: m.type,
      timeMs: cursor
    });
    const textLen = (m.text || '').length;
    cursor += Math.min(maxHold, Math.max(minHold, textLen * holdPerChar));

    return {
      ...m,
      typingDuration: itemTypingDuration
    };
  });

  const totalDurationMs = cursor + finalHold;
  const targetFps = Math.min(60, Math.max(15, parseInt(fps, 10) || 60));
  const totalFrames = Math.max(1, Math.ceil((totalDurationMs / 1000) * targetFps));

  const isWebm = format === 'webm';
  const ratioTag = currentRatio.replace(':', 'x');
  const qualityTag = is4K ? '4k' : '1080p';
  const filename = `imessage_${ratioTag}_${qualityTag}_${currentBgType}.${isWebm ? 'webm' : 'mp4'}`;

  return {
    messages: processedMessages,
    currentRatio,
    currentQuality,
    scale,
    is4K,
    currentBgType,
    effectiveBgColor,
    currentWidthPreset,
    currentVAlign,
    currentPacing,
    isBounceEnabled,
    isShadowEnabled,
    isSoundEnabled,
    audioCues,
    currentSenderColor,
    format: isWebm ? 'webm' : 'mp4',
    fps: targetFps,
    width,
    height,
    chatColumnWidth,
    fontSize,
    lineHeight,
    paddingX,
    paddingY,
    bubbleRadius: Math.round(34 * scale),
    typingRadius: Math.round(26 * scale),
    gap: Math.round(26 * scale),
    typingBubbleW: Math.round(132 * scale),
    typingBubbleH: Math.round(68 * scale),
    minHold,
    maxHold,
    holdPerChar,
    finalHold,
    totalDurationMs,
    totalFrames,
    filename
  };
}

/**
 * Builds HTML page with Canvas rendering pipeline featuring:
 * 1. Apple CoreAnimation damped harmonic spring physics (zeta ~ 0.58, omega_0 = 17.5)
 * 2. Continuous camera scroll tracking with smooth cubic interpolation (no jerks/snaps)
 * 3. Tack-sharp Inter / Apple SF typography with subpixel anti-aliasing and pixel-aligned coordinates
 * 4. Authentic curved iMessage speech tails and iOS vibrant gradients
 * 5. Clean chroma shadows preventing dark green fringing on keying
 */
function buildCanvasHtml(config) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background: ${config.effectiveBgColor};
          overflow: hidden;
          width: ${config.width}px;
          height: ${config.height}px;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", "Helvetica Neue", sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        canvas {
          width: ${config.width}px;
          height: ${config.height}px;
          display: block;
        }
      </style>
    </head>
    <body>
      <canvas id="renderCanvas" width="${config.width}" height="${config.height}"></canvas>
      <script>
        const canvas = document.getElementById('renderCanvas');
        const ctx = canvas.getContext('2d', { alpha: false });

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.textRendering = 'optimizeLegibility';

        const config = ${JSON.stringify(config)};
        const isDarkBg = (config.currentBgType === 'dark' || config.currentBgType === 'black');
        const isChromaBg = (config.currentBgType === 'green' || config.currentBgType === 'blue');

        // Font specification matching Apple SF / Inter
        const fontSpec = '500 ' + config.fontSize + 'px -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", "Helvetica Neue", sans-serif';
        ctx.font = fontSpec;

        /**
         * Authentic iOS 17/18 Apple iMessage Sender Bubble with curved speech tail
         */
        function drawAppleSenderBubble(ctx, x, y, w, h, radius) {
          const r = Math.min(radius, Math.floor(h / 2));
          const tailW = Math.round(14 * (config.scale || 1));
          const tailH = Math.round(18 * (config.scale || 1));
          const bodyW = w - tailW;

          ctx.beginPath();
          ctx.moveTo(x + r, y);
          ctx.lineTo(x + bodyW - r, y);
          ctx.arcTo(x + bodyW, y, x + bodyW, y + r, r);
          ctx.lineTo(x + bodyW, y + h - tailH);
          ctx.bezierCurveTo(
            x + bodyW, y + h - Math.round(6 * (config.scale || 1)),
            x + bodyW + Math.round(4 * (config.scale || 1)), y + h - Math.round(1 * (config.scale || 1)),
            x + w, y + h
          );
          ctx.bezierCurveTo(
            x + bodyW + Math.round(2 * (config.scale || 1)), y + h,
            x + bodyW - Math.round(8 * (config.scale || 1)), y + h - 0.5,
            x + bodyW - Math.round(14 * (config.scale || 1)), y + h
          );
          ctx.lineTo(x + r, y + h);
          ctx.arcTo(x, y + h, x, y + h - r, r);
          ctx.lineTo(x, y + r);
          ctx.arcTo(x, y, x + r, y, r);
          ctx.closePath();
        }

        /**
         * Authentic iOS 17/18 Apple iMessage Receiver Bubble with curved speech tail
         */
        function drawAppleReceiverBubble(ctx, x, y, w, h, radius) {
          const r = Math.min(radius, Math.floor(h / 2));
          const tailW = Math.round(14 * (config.scale || 1));
          const tailH = Math.round(18 * (config.scale || 1));
          const bodyX = x + tailW;
          const bodyW = w - tailW;

          ctx.beginPath();
          ctx.moveTo(bodyX + r, y);
          ctx.lineTo(bodyX + bodyW - r, y);
          ctx.arcTo(bodyX + bodyW, y, bodyX + bodyW, y + r, r);
          ctx.lineTo(bodyX + bodyW, y + h - r);
          ctx.arcTo(bodyX + bodyW, y + h, bodyX + bodyW - r, y + h, r);
          ctx.lineTo(bodyX + Math.round(14 * (config.scale || 1)), y + h);
          ctx.bezierCurveTo(
            bodyX + Math.round(8 * (config.scale || 1)), y + h - 0.5,
            bodyX - Math.round(2 * (config.scale || 1)), y + h,
            x, y + h
          );
          ctx.bezierCurveTo(
            bodyX - Math.round(4 * (config.scale || 1)), y + h - Math.round(1 * (config.scale || 1)),
            bodyX, y + h - Math.round(6 * (config.scale || 1)),
            bodyX, y + h - tailH
          );
          ctx.lineTo(bodyX, y + r);
          ctx.arcTo(bodyX, y, bodyX + r, y, r);
          ctx.closePath();
        }

        function wrapCanvasText(text, maxWidth) {
          const rawParagraphs = String(text || '').split(/\\r?\\n/);
          const lines = [];

          for (const para of rawParagraphs) {
            if (!para.trim()) {
              lines.push('');
              continue;
            }

            const words = para.split(/\\s+/).filter(Boolean);
            let currentLine = '';

            for (let i = 0; i < words.length; i++) {
              const word = words[i];

              if (ctx.measureText(word).width > maxWidth) {
                if (currentLine) {
                  lines.push(currentLine);
                  currentLine = '';
                }
                let charChunk = '';
                for (const char of word) {
                  if (ctx.measureText(charChunk + char).width > maxWidth) {
                    if (charChunk) lines.push(charChunk);
                    charChunk = char;
                  } else {
                    charChunk += char;
                  }
                }
                if (charChunk) {
                  currentLine = charChunk;
                }
              } else {
                const testLine = currentLine ? currentLine + ' ' + word : word;
                if (ctx.measureText(testLine).width <= maxWidth) {
                  currentLine = testLine;
                } else {
                  lines.push(currentLine);
                  currentLine = word;
                }
              }
            }

            if (currentLine) {
              lines.push(currentLine);
            }
          }

          // Smart typographic line balancing (prevents awkward single-word orphan lines)
          if (lines.length >= 2) {
            const last = lines[lines.length - 1].trim();
            const lastWords = last.split(/\\s+/);
            if (lastWords.length === 1) {
              const prev = lines[lines.length - 2].trim();
              const prevWords = prev.split(/\\s+/);
              if (prevWords.length >= 3) {
                const movedWord = prevWords.pop();
                const candidatePrev = prevWords.join(' ');
                const candidateLast = movedWord + ' ' + last;
                if (ctx.measureText(candidateLast).width <= maxWidth) {
                  lines[lines.length - 2] = candidatePrev;
                  lines[lines.length - 1] = candidateLast;
                }
              }
            }
          }

          return lines.length > 0 ? lines : [''];
        }

        const startX = (config.width - config.chatColumnWidth) / 2;
        const gap = config.gap;
        const typingBubbleW = config.typingBubbleW;
        const typingBubbleH = config.typingBubbleH;
        const sampleDt = 16.666;
        const viewBottom = config.height - Math.round(90 * (config.scale || 1));

        let layoutItems = [];
        let totalDurationMs = 0;
        let initialYOffset = Math.round(55 * (config.scale || 1));
        let numSamples = 10;
        let smoothedScroll = new Float32Array(10);

        function getAppleSpring(tSec) {
          if (tSec <= 0) return 0;
          if (tSec >= 0.42) return 1;
          const gamma = 11.5;
          const omega = 17.5;
          const decay = Math.exp(-gamma * tSec);
          return 1 - decay * (Math.cos(omega * tSec) + (gamma / omega) * Math.sin(omega * tSec));
        }

        function calculateCameraScrollAt(virtualTime) {
          let accumulatedH = initialYOffset;
          let targetScroll = 0;

          for (let i = 0; i < layoutItems.length; i++) {
            const it = layoutItems[i];
            if (virtualTime >= it.appearTime) {
              accumulatedH += it.bubbleHeight + gap;
              const bottom = accumulatedH;
              if (bottom > viewBottom) {
                targetScroll = bottom - viewBottom;
              }
            } else if (virtualTime >= it.typingStart) {
              const typingBottom = accumulatedH + typingBubbleH + gap;
              if (typingBottom > viewBottom) {
                targetScroll = typingBottom - viewBottom;
              }
              break;
            } else {
              break;
            }
          }

          return targetScroll;
        }

        function getCameraScrollY(virtualTime) {
          const sampleIdx = Math.max(0, Math.min(numSamples - 2, Math.floor(virtualTime / sampleDt)));
          const frac = (virtualTime % sampleDt) / sampleDt;
          return smoothedScroll[sampleIdx] + (smoothedScroll[sampleIdx + 1] - smoothedScroll[sampleIdx]) * frac;
        }

        window.initLayout = function() {
          ctx.font = fontSpec;

          const bubbleWidthRatio = (config.currentWidthPreset === 'narrow') 
            ? 0.88 
            : (config.currentWidthPreset === 'wide' ? 0.72 : 0.78);
          const maxAllowedBubbleWidth = Math.floor(config.chatColumnWidth * bubbleWidthRatio);
          const tailExtra = Math.round(18 * (config.scale || 1));
          const maxTextWidth = Math.max(80 * (config.scale || 1), maxAllowedBubbleWidth - (config.paddingX * 2 + tailExtra));

          layoutItems = config.messages.map(item => {
            const lines = wrapCanvasText(item.text, maxTextWidth);
            let maxLineWidth = 0;
            lines.forEach(l => {
              const w = ctx.measureText(l).width;
              if (w > maxLineWidth) maxLineWidth = w;
            });

            const tailExtra = Math.round(18 * (config.scale || 1));
            const bubbleWidth = Math.max(140 * (config.scale || 1), Math.round(maxLineWidth + config.paddingX * 2 + tailExtra));
            const bubbleHeight = Math.round(lines.length * config.lineHeight + config.paddingY * 2);

            return {
              type: item.type,
              text: item.text,
              lines,
              bubbleWidth,
              bubbleHeight,
              color: item.color || (item.type === 'sender' ? config.currentSenderColor : '#e5e5ea'),
              typingDuration: item.typingDuration || 700,
              typingStart: 0,
              appearTime: 0
            };
          });

          let timelineCursor = 500;
          layoutItems.forEach(item => {
            item.typingStart = timelineCursor;
            timelineCursor += item.typingDuration;
            item.appearTime = timelineCursor;
            const hold = Math.min(config.maxHold, Math.max(config.minHold, item.text.length * config.holdPerChar));
            timelineCursor += hold;
          });
          totalDurationMs = timelineCursor + config.finalHold;
          window.__totalDurationMs = totalDurationMs;

          const totalContentHeight = layoutItems.reduce((acc, it) => acc + it.bubbleHeight + gap, 0);
          if (config.currentVAlign === 'top') {
            initialYOffset = (config.currentRatio === '9:16' ? Math.round(95 * config.scale) : Math.round(60 * config.scale));
          } else if (config.currentVAlign === 'center') {
            const freeSpace = config.height - totalContentHeight;
            initialYOffset = Math.max(60 * config.scale, Math.floor(freeSpace / 2));
          } else if (config.currentVAlign === 'bottom') {
            const freeSpace = config.height - totalContentHeight - 85 * config.scale;
            initialYOffset = Math.max(60 * config.scale, Math.floor(freeSpace));
          }

          numSamples = Math.ceil(totalDurationMs / sampleDt) + 10;
          const rawScrollTargets = [];
          for (let s = 0; s < numSamples; s++) {
            rawScrollTargets.push(calculateCameraScrollAt(s * sampleDt));
          }

          smoothedScroll = new Float32Array(numSamples);
          let curr = 0;
          for (let s = 0; s < numSamples; s++) {
            const target = rawScrollTargets[s];
            curr += (target - curr) * 0.12;
            smoothedScroll[s] = curr;
          }
        };

        window.initLayout();

        window.renderAtVirtualTime = function(virtualTime) {
          ctx.fillStyle = config.effectiveBgColor;
          ctx.fillRect(0, 0, config.width, config.height);

          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 25 * (config.scale || 1), config.width, config.height - 50 * (config.scale || 1));
          ctx.clip();

          const cameraScrollY = getCameraScrollY(virtualTime);
          let yOffset = initialYOffset - cameraScrollY;

          let visibleCount = 0;
          let activeTypingItem = null;

          for (let i = 0; i < layoutItems.length; i++) {
            const it = layoutItems[i];
            if (virtualTime >= it.appearTime) {
              visibleCount = i + 1;
            } else if (virtualTime >= it.typingStart && virtualTime < it.appearTime) {
              activeTypingItem = it;
              break;
            } else {
              break;
            }
          }

          for (let i = 0; i < visibleCount; i++) {
            const item = layoutItems[i];
            const isSender = item.type === 'sender';
            const x = isSender ? (startX + config.chatColumnWidth - item.bubbleWidth) : startX;
            const y = yOffset;

            let scale = 1;
            let opacity = 1;
            let translateY = 0;
            const elapsed = virtualTime - item.appearTime;

            if (config.isBounceEnabled && elapsed < 420) {
              const spr = getAppleSpring(elapsed / 1000);
              scale = 0.38 + 0.62 * spr;
              translateY = (1 - Math.min(1, elapsed / 280)) * 18 * (config.scale || 1);
              opacity = Math.min(1, elapsed / 45);
            }

            ctx.save();
            const pivotX = isSender ? (x + item.bubbleWidth) : x;
            const pivotY = y + item.bubbleHeight;

            if (scale !== 1 || translateY !== 0) {
              ctx.translate(pivotX, pivotY - translateY);
              ctx.scale(scale, scale);
              ctx.translate(-pivotX, -pivotY);
            }
            ctx.globalAlpha = opacity;

            if (config.isShadowEnabled) {
              ctx.shadowColor = isChromaBg ? 'rgba(0, 0, 0, 0.12)' : 'rgba(0, 0, 0, 0.22)';
              ctx.shadowBlur = (isChromaBg ? 10 : 18) * (config.scale || 1);
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = 4 * (config.scale || 1);
            }

            const drawX = Math.round(x);
            const drawY = Math.round(y);
            const drawW = Math.round(item.bubbleWidth);
            const drawH = Math.round(item.bubbleHeight);

            // Draw authentic Apple iMessage bubble with curved speech tail and rich gradient
            if (isSender) {
              const grad = ctx.createLinearGradient(drawX, drawY, drawX, drawY + drawH);
              if (item.color === '#007aff') {
                grad.addColorStop(0, '#1c8aff');
                grad.addColorStop(1, '#006ee6');
              } else if (item.color === '#af52de') {
                grad.addColorStop(0, '#be63e6');
                grad.addColorStop(1, '#9935cc');
              } else {
                grad.addColorStop(0, item.color);
                grad.addColorStop(1, item.color);
              }
              ctx.fillStyle = grad;
              drawAppleSenderBubble(ctx, drawX, drawY, drawW, drawH, config.bubbleRadius);
              ctx.fill();
            } else {
              ctx.fillStyle = isDarkBg ? '#26262b' : '#e9e9eb';
              drawAppleReceiverBubble(ctx, drawX, drawY, drawW, drawH, config.bubbleRadius);
              ctx.fill();
            }

            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;

            ctx.fillStyle = isSender ? '#FFFFFF' : (isDarkBg ? '#FFFFFF' : '#000000');
            ctx.font = fontSpec;
            ctx.textBaseline = 'top';

            const textStartX = isSender 
              ? drawX + config.paddingX 
              : drawX + config.paddingX + Math.round(12 * (config.scale || 1));

            for (let l = 0; l < item.lines.length; l++) {
              const textY = Math.round(drawY + config.paddingY + l * config.lineHeight);
              ctx.fillText(item.lines[l], textStartX, textY);
            }

            ctx.restore();
            yOffset += item.bubbleHeight + gap;
          }

          if (activeTypingItem) {
            const isSender = activeTypingItem.type === 'sender';
            const x = isSender ? (startX + config.chatColumnWidth - typingBubbleW) : startX;
            const y = yOffset;

            let typeScale = 1;
            let typeOpacity = 1;

            if (config.isBounceEnabled) {
              const elapsed = virtualTime - activeTypingItem.typingStart;
              const remain = activeTypingItem.appearTime - virtualTime;

              if (elapsed < 280) {
                const spr = getAppleSpring(elapsed / 700);
                typeScale = 0.35 + 0.65 * spr;
                typeOpacity = Math.min(1, elapsed / 50);
              }

              if (remain < 100) {
                const p = Math.max(0, remain / 100);
                typeScale = 0.7 + 0.3 * p;
                typeOpacity = p;
              }
            }

            ctx.save();
            const anchorX = isSender ? (x + typingBubbleW) : x;
            const anchorY = y + typingBubbleH;
            ctx.translate(anchorX, anchorY);
            ctx.scale(typeScale, typeScale);
            ctx.translate(-anchorX, -anchorY);
            ctx.globalAlpha = typeOpacity;

            if (config.isShadowEnabled) {
              ctx.shadowColor = isChromaBg ? 'rgba(0, 0, 0, 0.12)' : 'rgba(0, 0, 0, 0.20)';
              ctx.shadowBlur = 10 * (config.scale || 1);
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = 4 * (config.scale || 1);
            }

            ctx.fillStyle = isSender ? (activeTypingItem.color || '#007aff') : (isDarkBg ? '#26262b' : '#e5e5ea');
            ctx.beginPath();
            ctx.roundRect(x, y, typingBubbleW, typingBubbleH, config.typingRadius);
            ctx.fill();

            // Authentic Apple trailing mini-dots for typing indicator
            if (isSender) {
              ctx.beginPath();
              ctx.arc(x + typingBubbleW - 2, y + typingBubbleH + 2 * (config.scale || 1), 5 * (config.scale || 1), 0, Math.PI * 2);
              ctx.fill();
              ctx.beginPath();
              ctx.arc(x + typingBubbleW + 6 * (config.scale || 1), y + typingBubbleH + 7 * (config.scale || 1), 2.8 * (config.scale || 1), 0, Math.PI * 2);
              ctx.fill();
            } else {
              ctx.beginPath();
              ctx.arc(x + 2, y + typingBubbleH + 2 * (config.scale || 1), 5 * (config.scale || 1), 0, Math.PI * 2);
              ctx.fill();
              ctx.beginPath();
              ctx.arc(x - 6 * (config.scale || 1), y + typingBubbleH + 7 * (config.scale || 1), 2.8 * (config.scale || 1), 0, Math.PI * 2);
              ctx.fill();
            }

            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;

            const dotColorBase = isSender ? '255, 255, 255' : (isDarkBg ? '255, 255, 255' : '142, 142, 147');
            const dotCenterX = x + typingBubbleW / 2;
            const dotCenterY = y + typingBubbleH / 2;
            const dotSpacing = Math.round(28 * (config.scale || 1));

            for (let d = 0; d < 3; d++) {
              const dotX = dotCenterX + (d - 1) * dotSpacing;
              const phase = (virtualTime / 220) - d * 0.68;
              const wave = Math.sin(phase);
              const lift = Math.max(0, wave) * 5 * (config.scale || 1);
              const dotAlpha = 0.36 + 0.64 * Math.max(0, wave);
              const dotRadius = (5.2 + 0.8 * Math.max(0, wave)) * (config.scale || 1);

              ctx.fillStyle = 'rgba(' + dotColorBase + ', ' + dotAlpha.toFixed(2) + ')';
              ctx.beginPath();
              ctx.arc(dotX, dotCenterY - lift, dotRadius, 0, Math.PI * 2);
              ctx.fill();
            }

            ctx.restore();
          }

          ctx.restore();
        };
      </script>
    </body>
    </html>
  `;
}

/**
 * Worker execution for video render jobs
 */
async function runVideoJob(jobId, config) {
  const job = videoJobs.get(jobId);
  if (!job) return;

  job.status = 'rendering';
  job.startTime = Date.now();
  job.lastActivityAt = Date.now();
  notifyJobListeners(job);

  const outputPath = path.join(JOBS_DIR, `${jobId}.mp4`);
  job.outputPath = outputPath;

  let imageStream = null;

  try {
    job.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--enable-font-antialiasing',
        '--font-render-hinting=max',
        '--force-color-profile=srgb',
        `--window-size=${config.width},${config.height}`
      ]
    });

    const page = await job.browser.newPage();
    await page.setViewport({ 
      width: config.width, 
      height: config.height, 
      deviceScaleFactor: 1 
    });

    const htmlContent = buildCanvasHtml(config);
    await page.setContent(htmlContent, { waitUntil: 'load' });

    // Explicitly load fonts and recalculate layout with 100% true glyph metrics
    await page.evaluate(async (fontSize) => {
      try {
        await Promise.race([
          Promise.all([
            document.fonts.load(`500 ${fontSize}px "Inter"`),
            document.fonts.load(`500 ${fontSize}px "Roboto"`)
          ]),
          new Promise(r => setTimeout(r, 2000))
        ]);
        await document.fonts.ready;
      } catch (e) {}
      if (typeof window.initLayout === 'function') {
        window.initLayout();
      }
    }, config.fontSize);

    imageStream = new PassThrough();

    const hasAudio = Boolean(config.isSoundEnabled && config.audioCues && config.audioCues.length > 0);
    const sendAudioPath = path.join(__dirname, 'audio', 'send.mp3');
    const recvAudioPath = path.join(__dirname, 'audio', 'receive.mp3');
    const canMuxAudio = hasAudio && fs.existsSync(sendAudioPath) && fs.existsSync(recvAudioPath);

    const videoOnlyPath = canMuxAudio ? path.join(JOBS_DIR, `${jobId}_video.mp4`) : outputPath;

    // Configure FFmpeg to read PNG sequence from stream and write directly to seekable output file
    await new Promise((resolve, reject) => {
      job.ffmpegCmd = ffmpeg()
        .input(imageStream)
        .inputFormat('image2pipe')
        .inputOptions([
          '-c:v png',
          `-framerate ${config.fps}`
        ])
        .output(videoOnlyPath)
        .outputOptions([
          '-c:v libx264',
          '-preset slow',            // Master grade subpixel motion vectors
          '-crf 12',                 // Visually lossless creator-grade quality
          '-profile:v high',
          '-level 5.1',
          '-pix_fmt yuv420p',
          '-b:v 35M',                // High bitrate for razor-sharp edges and zero chroma fringing
          '-maxrate 50M',
          '-bufsize 70M',
          '-x264opts keyint=30:min-keyint=30:no-scenecut',
          '-color_primaries bt709',
          '-color_trc bt709',
          '-colorspace bt709',
          '-movflags +faststart'
        ])
        .on('end', () => {
          resolve();
        })
        .on('error', (err) => {
          if (job.cancelled) resolve();
          else reject(err);
        });

      job.ffmpegCmd.run();

      // Launch frame feeding loop
      (async () => {
        try {
          const client = await page.target().createCDPSession();
          const dt = 1000 / config.fps;
          let lastPercent = -1;

          for (let f = 0; f < config.totalFrames; f++) {
            if (job.cancelled) break;

            const virtualTime = f * dt;
            await page.evaluate((t) => window.renderAtVirtualTime(t), virtualTime);

            const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
            const frameBuffer = Buffer.from(data, 'base64');

            if (!imageStream.write(frameBuffer)) {
              await new Promise((res) => imageStream.once('drain', res));
            }

            job.currentFrame = f + 1;
            job.lastActivityAt = Date.now();
            job.percent = Math.min(canMuxAudio ? 94 : 99, Math.round((job.currentFrame / job.totalFrames) * 100));

            const elapsedSec = (Date.now() - job.startTime) / 1000;
            if (elapsedSec > 0.4) {
              const actualFps = job.currentFrame / elapsedSec;
              job.etaSeconds = Math.max(0, Math.round((job.totalFrames - job.currentFrame) / actualFps));
            }

            if (f % 2 === 0 || job.percent !== lastPercent || f === config.totalFrames - 1) {
              lastPercent = job.percent;
              notifyJobListeners(job);
            }
          }

          if (imageStream && !imageStream.destroyed) {
            imageStream.end();
          }
        } catch (feedErr) {
          if (imageStream && !imageStream.destroyed) {
            try { imageStream.destroy(feedErr); } catch (e) {}
          }
          reject(feedErr);
        }
      })();
    });

    if (!job.cancelled) {
      if (canMuxAudio) {
        job.status = 'muxing';
        job.percent = 96;
        job.lastActivityAt = Date.now();
        notifyJobListeners(job);

        await new Promise((resolveMux) => {
          const muxCmd = ffmpeg().input(videoOnlyPath);
          config.audioCues.forEach(cue => {
            muxCmd.input(cue.type === 'sender' ? sendAudioPath : recvAudioPath);
          });

          const filterEntries = [];
          const filterInputs = [];
          config.audioCues.forEach((cue, idx) => {
            const delay = Math.max(1, Math.round(cue.timeMs));
            filterEntries.push(`[${idx + 1}:a]adelay=${delay}|${delay}[a${idx}]`);
            filterInputs.push(`[a${idx}]`);
          });
          filterEntries.push(`${filterInputs.join('')}amix=inputs=${config.audioCues.length}:normalize=0[outa]`);

          muxCmd
            .complexFilter(filterEntries)
            .outputOptions([
              '-map 0:v',
              '-map [outa]',
              '-c:v copy',
              '-c:a aac',
              '-b:a 192k',
              '-shortest'
            ])
            .output(outputPath)
            .on('end', () => {
              try { fs.unlinkSync(videoOnlyPath); } catch (e) {}
              resolveMux();
            })
            .on('error', (muxErr) => {
              console.warn('Audio mux notice, falling back to clean video:', muxErr);
              try {
                if (fs.existsSync(videoOnlyPath)) {
                  fs.renameSync(videoOnlyPath, outputPath);
                }
              } catch (e) {}
              resolveMux();
            })
            .run();
        });
      }

      job.status = 'ready';
      job.percent = 100;
      job.etaSeconds = 0;
      job.completedAt = Date.now();
      job.lastActivityAt = Date.now();
      notifyJobListeners(job);
    }
  } catch (err) {
    console.error('Error in video render job:', err);
    job.status = 'error';
    job.error = err.message || String(err);
    notifyJobListeners(job);
  } finally {
    if (job.browser) {
      try { await job.browser.close(); } catch (e) {}
      job.browser = null;
    }
  }
}

function notifyJobListeners(job) {
  const data = JSON.stringify({
    jobId: job.id,
    status: job.status,
    currentFrame: job.currentFrame,
    totalFrames: job.totalFrames,
    percent: job.percent,
    etaSeconds: job.etaSeconds,
    error: job.error
  });

  for (const res of job.listeners) {
    try {
      res.write(`data: ${data}\n\n`);
    } catch (e) {}
  }
}

/**
 * ==========================================================================
 * Notification Video Render Engine (4K MP4 @ 60 FPS)
 * ==========================================================================
 */

function buildNotificationHtml(config) {
  const isPortrait = config.height > config.width;
  const baseW = isPortrait ? 480 : 860;
  const s = config.width / baseW;
  const offscreenY = Math.round(140 * s);

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const cardsHtml = config.items.map((item, idx) => {
    return `
      <div class="ios-banner-card theme-${item.theme || 'black'}" id="card-${idx}">
        <div class="banner-avatar-wrap">
          ${item.avatarDataUrl
            ? `<img src="${item.avatarDataUrl}" class="banner-avatar-img" alt="${escapeHtml(item.senderName)}">`
            : `<div class="banner-avatar-img banner-avatar-initials">${escapeHtml((item.senderName || 'U').charAt(0).toUpperCase())}</div>`
          }
        </div>
        <div class="banner-content-body">
          <div class="banner-top-meta">
            <span class="banner-title">${escapeHtml(item.senderName)}</span>
            <span class="banner-time">${escapeHtml(item.timeText || 'now')}</span>
          </div>
          <div class="banner-message-text">${escapeHtml(item.message)}</div>
        </div>
      </div>
    `;
  }).join('\n');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body, html {
          background: #00FF00;
          overflow: hidden;
          width: ${config.width}px;
          height: ${config.height}px;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Roboto", "Inter", sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        .video-stage {
          width: ${config.width}px;
          height: ${config.height}px;
          position: relative;
          background: #00FF00;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: ${Math.round(20 * s)}px ${Math.round(14 * s)}px;
          gap: ${Math.round(12 * s)}px;
        }
        .ios-banner-card {
          width: fit-content;
          min-width: ${Math.round(220 * s)}px;
          max-width: ${Math.round(740 * s)}px;
          background: rgba(24, 24, 27, 0.95);
          backdrop-filter: blur(${Math.round(28 * s)}px) saturate(190%);
          -webkit-backdrop-filter: blur(${Math.round(28 * s)}px) saturate(190%);
          border: ${Math.max(1, Math.round(1 * s))}px solid rgba(255, 255, 255, 0.22);
          border-radius: ${Math.round(20 * s)}px;
          padding: ${Math.round(13 * s)}px ${Math.round(18 * s)}px;
          display: flex;
          gap: ${Math.round(14 * s)}px;
          align-items: flex-start;
          box-shadow: none !important;
          position: relative;
          margin: 0 auto;
          will-change: transform, opacity;
          transform: translateY(0) scale(1);
          opacity: 1;
        }
        .ios-banner-card.theme-white {
          background: rgba(255, 255, 255, 0.96);
          border: ${Math.max(1, Math.round(1 * s))}px solid rgba(0, 0, 0, 0.12);
        }
        .banner-avatar-wrap {
          flex-shrink: 0;
        }
        .banner-avatar-img {
          width: ${Math.round(44 * s)}px;
          height: ${Math.round(44 * s)}px;
          border-radius: 50%;
          object-fit: cover;
          border: ${Math.max(1, Math.round(1.5 * s))}px solid rgba(255, 255, 255, 0.28);
          display: block;
        }
        .ios-banner-card.theme-white .banner-avatar-img {
          border: ${Math.max(1, Math.round(1.5 * s))}px solid rgba(0, 0, 0, 0.12);
        }
        .banner-avatar-initials {
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0b57d0;
          color: #ffffff;
          font-weight: 700;
          font-size: ${Math.round(22 * s)}px;
        }
        .banner-content-body {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: ${Math.round(2 * s)}px;
        }
        .banner-top-meta {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: ${Math.round(12 * s)}px;
        }
        .banner-title {
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Roboto", "Inter", sans-serif;
          font-size: ${Math.round(14.5 * s)}px;
          font-weight: 600;
          color: #ffffff;
          letter-spacing: -0.2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ios-banner-card.theme-white .banner-title {
          color: #000000;
          font-weight: 700;
        }
        .banner-time {
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Roboto", "Inter", sans-serif;
          font-size: ${Math.round(11.5 * s)}px;
          color: rgba(255, 255, 255, 0.55);
          font-weight: 400;
          white-space: nowrap;
        }
        .ios-banner-card.theme-white .banner-time {
          color: rgba(0, 0, 0, 0.48);
        }
        .banner-message-text {
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Roboto", "Inter", sans-serif;
          font-size: ${Math.round(13.5 * s)}px;
          color: rgba(255, 255, 255, 0.94);
          line-height: 1.35;
          letter-spacing: -0.15px;
          word-break: break-word;
          width: max-content;
          max-width: 100%;
        }
        .ios-banner-card.theme-white .banner-message-text {
          color: rgba(0, 0, 0, 0.88);
        }
      </style>
    </head>
    <body>
      <div class="video-stage">
        ${cardsHtml}
      </div>
      <script>
        const items = ${JSON.stringify(config.items)};
        const offscreenY = ${offscreenY};

        function easeOutBack(x) {
          const c1 = 1.70158;
          const c3 = c1 + 1;
          return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
        }

        window.renderAtVirtualTime = function(tMs) {
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const el = document.getElementById('card-' + i);
            if (!el) continue;

            const enterStart = item.enterStartMs;
            const enterEnd = enterStart + item.enterMs;
            const exitStart = item.exitStartMs;
            const exitEnd = exitStart + item.exitMs;

            if (tMs < enterStart) {
              el.style.transform = 'translateY(-' + offscreenY + 'px) scale(0.95)';
              el.style.opacity = '0';
            } else if (tMs < enterEnd) {
              const p = (tMs - enterStart) / item.enterMs;
              const ease = easeOutBack(p);
              const y = -offscreenY * (1 - ease);
              const scaleVal = 0.95 + 0.05 * Math.min(1, ease);
              const alpha = Math.min(1, p * 2.5);
              el.style.transform = 'translateY(' + y + 'px) scale(' + scaleVal + ')';
              el.style.opacity = alpha;
            } else if (tMs < exitStart) {
              el.style.transform = 'translateY(0px) scale(1)';
              el.style.opacity = '1';
            } else if (tMs < exitEnd) {
              const p = (tMs - exitStart) / item.exitMs;
              const ease = p * p * p;
              const y = -offscreenY * 0.7 * ease;
              const scaleVal = 1 - 0.05 * p;
              const alpha = Math.max(0, 1 - p);
              el.style.transform = 'translateY(' + y + 'px) scale(' + scaleVal + ')';
              el.style.opacity = alpha;
            } else {
              el.style.opacity = '0';
            }
          }
        };
      </script>
    </body>
    </html>
  `;
}

async function runNotificationVideoJob(jobId, config) {
  const job = videoJobs.get(jobId);
  if (!job) return;

  job.status = 'rendering';
  job.startTime = Date.now();
  job.lastActivityAt = Date.now();
  notifyJobListeners(job);

  const outputPath = path.join(JOBS_DIR, `${jobId}.mp4`);
  job.outputPath = outputPath;

  let imageStream = null;

  try {
    job.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--enable-font-antialiasing',
        '--font-render-hinting=max',
        '--force-color-profile=srgb',
        `--window-size=${config.width},${config.height}`
      ]
    });

    const page = await job.browser.newPage();
    await page.setViewport({
      width: config.width,
      height: config.height,
      deviceScaleFactor: 1
    });

    const htmlContent = buildNotificationHtml(config);
    await page.setContent(htmlContent, { waitUntil: 'load' });

    // Ensure fonts and images loaded
    await page.evaluate(async () => {
      try {
        await document.fonts.ready;
      } catch (e) {}
    });

    imageStream = new PassThrough();

    // Spawn FFmpeg to encode 4K MP4
    await new Promise((resolve, reject) => {
      job.ffmpegCmd = ffmpeg()
        .input(imageStream)
        .inputFormat('image2pipe')
        .inputOptions([
          '-c:v png',
          `-framerate ${config.fps}`
        ])
        .output(outputPath)
        .outputOptions([
          '-c:v libx264',
          '-preset slow',
          '-crf 12',
          '-profile:v high',
          '-level 5.1',
          '-pix_fmt yuv420p',
          '-b:v 35M',
          '-maxrate 50M',
          '-bufsize 70M',
          '-x264opts keyint=30:min-keyint=30:no-scenecut',
          '-movflags +faststart'
        ])
        .on('start', () => {
          (async () => {
            try {
              const client = await page.target().createCDPSession();
              const dt = 1000 / config.fps;
              let lastPercent = -1;

              for (let f = 0; f < config.totalFrames; f++) {
                if (job.cancelled) break;

                const virtualTime = f * dt;
                await page.evaluate((t) => window.renderAtVirtualTime(t), virtualTime);

                const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
                const frameBuffer = Buffer.from(data, 'base64');

                if (!imageStream.write(frameBuffer)) {
                  await new Promise((res) => imageStream.once('drain', res));
                }

                job.currentFrame = f + 1;
                job.lastActivityAt = Date.now();
                job.percent = Math.min(99, Math.round((job.currentFrame / job.totalFrames) * 100));

                const elapsedSec = (Date.now() - job.startTime) / 1000;
                if (elapsedSec > 0.4) {
                  const actualFps = job.currentFrame / elapsedSec;
                  job.etaSeconds = Math.max(0, Math.round((job.totalFrames - job.currentFrame) / actualFps));
                }

                if (f % 2 === 0 || job.percent !== lastPercent || f === config.totalFrames - 1) {
                  lastPercent = job.percent;
                  notifyJobListeners(job);
                }
              }

              if (imageStream && !imageStream.destroyed) {
                imageStream.end();
              }
            } catch (feedErr) {
              if (imageStream && !imageStream.destroyed) {
                try { imageStream.destroy(feedErr); } catch (e) {}
              }
              reject(feedErr);
            }
          })();
        })
        .on('error', (err) => {
          if (!job.cancelled) {
            console.error(`[Job ${jobId}] Notification FFmpeg error:`, err);
            reject(err);
          } else {
            resolve();
          }
        })
        .on('end', () => {
          resolve();
        });

      job.ffmpegCmd.run();
    });

    job.status = 'ready';
    job.percent = 100;
    job.etaSeconds = 0;
    job.completedAt = Date.now();
    notifyJobListeners(job);
  } catch (err) {
    console.error(`[Job ${jobId}] Notification Render failed:`, err);
    job.status = 'error';
    job.error = err.message || 'Video generation failed';
    notifyJobListeners(job);
  } finally {
    try {
      if (job.browser) {
        await job.browser.close();
        job.browser = null;
      }
    } catch (e) {}
  }
}

/**
 * Endpoint: Start Notification 4K MP4 Render Job (Supports Single or Multi-Notification)
 */
app.post('/api/export/notification/video/start', (req, res) => {
  const {
    notifications = [],
    senderName = 'Linda',
    message = '',
    timeText = 'now',
    duration = 3.0,
    avatar = '',
    theme = 'black',
    currentQuality = '4k',
    currentRatio = '16:9',
    fps = 60
  } = req.body;

  const rawList = (Array.isArray(notifications) && notifications.length > 0)
    ? notifications
    : [{ senderName, message, timeText, duration, avatar, theme }];

  const validList = rawList.filter(n => n && n.message && n.message.trim());
  if (validList.length === 0) {
    return res.status(400).json({ error: 'Message text is required.' });
  }

  const is4K = currentQuality === '4k';
  const scale = is4K ? 2 : 1;

  let width = 1920 * scale;
  let height = 1080 * scale;

  if (currentRatio === '9:16') {
    width = 1080 * scale;
    height = 1920 * scale;
  }

  const enterMs = 500;
  const exitMs = 500;
  const padStartMs = 150;
  const padEndMs = 250;
  const staggerMs = 1200;

  const items = validList.map((item, idx) => {
    let avatarDataUrl = null;
    const av = item.avatar || '';
    if (av) {
      if (av.startsWith('data:')) {
        avatarDataUrl = av;
      } else {
        const localFile = path.join(__dirname, av.startsWith('/') ? av.slice(1) : av);
        if (fs.existsSync(localFile)) {
          const ext = path.extname(localFile).toLowerCase();
          const mime = (ext === '.png') ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'image/jpeg');
          avatarDataUrl = `data:${mime};base64,` + fs.readFileSync(localFile).toString('base64');
        }
      }
    }

    const holdMs = Math.round((parseFloat(item.duration) || 3.0) * 1000);
    const enterStartMs = padStartMs + (idx * staggerMs);

    return {
      senderName: item.senderName || 'Notification',
      message: (item.message || '').trim(),
      timeText: (item.timeText || 'now').trim(),
      duration: parseFloat(item.duration) || 3.0,
      holdMs,
      avatarDataUrl,
      theme: (item.theme === 'white') ? 'white' : 'black',
      enterStartMs,
      enterMs,
      exitMs
    };
  });

  // Calculate timeline
  let totalDurationMs;
  if (items.length === 1) {
    items[0].exitStartMs = items[0].enterStartMs + enterMs + items[0].holdMs;
    totalDurationMs = items[0].exitStartMs + exitMs + padEndMs;
  } else {
    const lastItem = items[items.length - 1];
    const exitStartMs = lastItem.enterStartMs + enterMs + lastItem.holdMs;
    items.forEach(item => {
      item.exitStartMs = exitStartMs;
    });
    totalDurationMs = exitStartMs + exitMs + padEndMs;
  }

  const totalFrames = Math.ceil((totalDurationMs / 1000) * fps);

  const cleanName = (items[0].senderName || 'Notification').replace(/[^a-zA-Z0-9]/g, '_');
  const filename = items.length === 1
    ? `Notification_${cleanName}_${items[0].theme === 'white' ? 'White' : 'Black'}_${is4K ? '4K' : '1080p'}.mp4`
    : `Notifications_${items.length}_Sequence_${is4K ? '4K' : '1080p'}.mp4`;

  const config = {
    items,
    width,
    height,
    fps,
    totalDurationMs,
    totalFrames,
    filename
  };

  const jobId = crypto.randomUUID();

  const job = {
    id: jobId,
    status: 'starting',
    currentFrame: 0,
    totalFrames,
    percent: 0,
    etaSeconds: null,
    error: null,
    filename,
    outputPath: null,
    createdAt: Date.now(),
    startTime: null,
    browser: null,
    ffmpegCmd: null,
    cancelled: false,
    listeners: new Set()
  };

  videoJobs.set(jobId, job);

  // Run in background
  runNotificationVideoJob(jobId, config);

  res.json({
    jobId,
    totalFrames,
    totalDurationMs,
    fps,
    filename
  });
});

/**
 * Step 4: Initiate Video Render Job (with Server Progress)
 */
app.post('/api/export/video/start', (req, res) => {
  const { messages = [] } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'At least one message is required to generate a video.' });
  }

  const config = computeVideoConfig(req.body);
  const jobId = crypto.randomUUID();

  const job = {
    id: jobId,
    status: 'starting',
    currentFrame: 0,
    totalFrames: config.totalFrames,
    percent: 0,
    etaSeconds: null,
    error: null,
    filename: config.filename,
    outputPath: null,
    createdAt: Date.now(),
    startTime: null,
    browser: null,
    ffmpegCmd: null,
    cancelled: false,
    listeners: new Set()
  };

  videoJobs.set(jobId, job);

  // Execute rendering asynchronously
  runVideoJob(jobId, config);

  res.json({
    jobId,
    totalFrames: config.totalFrames,
    totalDurationMs: config.totalDurationMs,
    fps: config.fps,
    filename: config.filename
  });
});

/**
 * Real-time SSE progress stream for a video job
 */
app.get('/api/export/video/events/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = videoJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  job.listeners.add(res);

  // Keep-alive heartbeat every 15s to keep connections alive on long renders
  const keepAliveTimer = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch (e) {
      clearInterval(keepAliveTimer);
    }
  }, 15000);

  // Immediately push initial status
  notifyJobListeners(job);

  res.on('close', () => {
    clearInterval(keepAliveTimer);
    job.listeners.delete(res);
  });
});

/**
 * Polling progress endpoint for a video job
 */
app.get('/api/export/video/progress/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = videoJobs.get(jobId);

  if (!job) {
    // If not in memory, check if output file is already rendered on disk
    const diskPath = path.join(JOBS_DIR, `${jobId}.mp4`);
    if (fs.existsSync(diskPath)) {
      try {
        const stat = fs.statSync(diskPath);
        if (stat.size > 0) {
          return res.json({
            jobId,
            status: 'ready',
            currentFrame: null,
            totalFrames: null,
            percent: 100,
            etaSeconds: 0,
            error: null
          });
        }
      } catch (e) {}
    }
    return res.status(404).json({ error: 'Job not found or expired' });
  }

  res.json({
    jobId: job.id,
    status: job.status,
    currentFrame: job.currentFrame,
    totalFrames: job.totalFrames,
    percent: job.percent,
    etaSeconds: job.etaSeconds,
    error: job.error
  });
});

/**
 * Downloads the finished video file (with fallback to disk if map entry was evicted)
 */
app.get('/api/export/video/download/:jobId', (req, res) => {
  const { jobId } = req.params;

  // Strict UUID validation to prevent directory traversal
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(jobId)) {
    return res.status(400).json({ error: 'Invalid video job ID.' });
  }

  const job = videoJobs.get(jobId);
  const diskPath = path.join(JOBS_DIR, `${jobId}.mp4`);
  const targetPath = (job && job.outputPath && fs.existsSync(job.outputPath))
    ? job.outputPath
    : (fs.existsSync(diskPath) ? diskPath : null);

  if (!targetPath) {
    return res.status(404).json({ error: 'Rendered video file not ready or expired.' });
  }

  let stat;
  try {
    stat = fs.statSync(targetPath);
  } catch (e) {
    return res.status(404).json({ error: 'Unable to read rendered video file.' });
  }

  if (stat.size === 0) {
    return res.status(404).json({ error: 'Rendered video file is incomplete or empty.' });
  }

  const filename = job?.filename || req.query.filename || `imessage_${jobId.slice(0, 8)}.mp4`;

  // Support HTTP Range requests for smoother streaming / resilient downloads
  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

    if (start >= stat.size || end >= stat.size || start > end) {
      res.setHeader('Content-Range', `bytes */${stat.size}`);
      return res.status(416).end();
    }

    const chunksize = (end - start) + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
      'Content-Disposition': `attachment; filename="${filename}"`
    });

    const fileStream = fs.createReadStream(targetPath, { start, end });
    fileStream.pipe(res);
  } else {
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-cache');

    const fileStream = fs.createReadStream(targetPath);
    fileStream.pipe(res);
  }

  if (job) {
    job.downloadedAt = Date.now();
  }
});

/**
 * Returns info about the most recent completed video render on disk
 */
app.get('/api/export/video/latest', (req, res) => {
  try {
    if (!fs.existsSync(JOBS_DIR)) {
      return res.status(404).json({ error: 'No render directory' });
    }

    const files = fs.readdirSync(JOBS_DIR)
      .filter(f => f.endsWith('.mp4') && !f.endsWith('_video.mp4'))
      .map(f => {
        const fullPath = path.join(JOBS_DIR, f);
        try {
          const stat = fs.statSync(fullPath);
          return {
            jobId: f.replace('.mp4', ''),
            sizeBytes: stat.size,
            mtime: stat.mtimeMs
          };
        } catch (e) {
          return null;
        }
      })
      .filter(f => f && f.sizeBytes > 0)
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length === 0) {
      return res.status(404).json({ error: 'No recent video renders found.' });
    }

    const latest = files[0];
    const job = videoJobs.get(latest.jobId);
    res.json({
      jobId: latest.jobId,
      filename: job?.filename || `imessage_render_${latest.jobId.slice(0, 8)}.mp4`,
      sizeBytes: latest.sizeBytes,
      mtime: latest.mtime,
      downloadUrl: `/api/export/video/download/${latest.jobId}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Legacy direct streaming fallback for /api/export/video
 */
app.post('/api/export/video', async (req, res) => {
  const { messages = [] } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'At least one message is required to generate a video.' });
  }

  const config = computeVideoConfig(req.body);
  const jobId = crypto.randomUUID();

  const job = {
    id: jobId,
    status: 'starting',
    currentFrame: 0,
    totalFrames: config.totalFrames,
    percent: 0,
    etaSeconds: null,
    error: null,
    filename: config.filename,
    outputPath: null,
    createdAt: Date.now(),
    startTime: null,
    browser: null,
    ffmpegCmd: null,
    cancelled: false,
    listeners: new Set()
  };

  videoJobs.set(jobId, job);
  await runVideoJob(jobId, config);

  if (job.status === 'ready' && job.outputPath && fs.existsSync(job.outputPath)) {
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${job.filename}"`);
    const stream = fs.createReadStream(job.outputPath);
    stream.pipe(res);
    res.on('finish', () => {
      job.downloadedAt = Date.now();
    });
  } else {
    res.status(500).json({ error: job.error || 'Failed to render video.' });
  }
});

/**
 * Creates an archiver zip instance compatible across archiver versions
 */
function createZipArchive() {
  if (typeof archiver === 'function') {
    return archiver('zip', { zlib: { level: 6 } });
  }
  if (archiver.ZipArchive) {
    return new archiver.ZipArchive({ zlib: { level: 6 } });
  }
  throw new Error('Archiver library not loaded properly');
}

/**
 * Step 5: High-Resolution Transparent PNG / ZIP Export Route (/api/export/png)
 * Generates transparent PNG screenshots of each message bubble matching video settings 1-to-1:
 * - Exact aspect ratio max bubble width scaling (16:9, 9:16, 1:1)
 * - Exact scene framing preset (narrow / split-screen, standard, wide)
 * - Exact Apple curved speech tails (drawAppleSenderBubble & drawAppleReceiverBubble)
 * - Exact iOS linear gradients (Blue #007aff, Purple #af52de, or custom) and iOS gray fills
 * - Exact Inter / SF Pro typography with typographic line balancing
 * - Exact drop shadow settings (with soft alpha blending on transparent background)
 * - Creator-grade high-resolution 2x / 4x super-sampled rendering
 * - Streams individual numbered bubbles (01_receiver.png, 02_sender.png, ...) + full conversation
 */
app.post('/api/export/png', async (req, res) => {
  const { messages = [] } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'At least one message is required for PNG export.' });
  }

  // Derive all settings 1-to-1 from computeVideoConfig
  const config = computeVideoConfig(req.body);
  const projectName = (req.body.projectName || 'imessage').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_') || 'imessage';
  const ratioTag = config.currentRatio.replace(':', 'x');
  const qualityTag = config.is4K ? '4k' : '1080p';
  const zipFilename = `${projectName}_${ratioTag}_${qualityTag}_transparent_pngs.zip`;

  let browser = null;
  let archive = null;
  let isClosed = false;

  const cleanup = async () => {
    if (isClosed) return;
    isClosed = true;
    if (browser) {
      try {
        await browser.close();
      } catch (err) {
        console.error('Error closing browser in /api/export/png:', err);
      }
      browser = null;
    }
  };

  res.on('close', () => {
    if (!res.writableEnded) {
      if (archive) {
        try { archive.abort(); } catch (e) {}
      }
      cleanup();
    }
  });

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--enable-font-antialiasing',
        '--font-render-hinting=max',
        '--force-color-profile=srgb'
      ]
    });

    const page = await browser.newPage();
    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: transparent !important; overflow: hidden; }
        </style>
      </head>
      <body></body>
      </html>
    `);

    // Ensure fonts are fully loaded
    await page.evaluate(async (fontSize) => {
      try {
        await Promise.race([
          Promise.all([
            document.fonts.load(`500 ${fontSize}px "Inter"`),
            document.fonts.load(`500 ${fontSize}px "Roboto"`)
          ]),
          new Promise(r => setTimeout(r, 2000))
        ]);
        await document.fonts.ready;
      } catch (e) {}
    }, config.fontSize);

    // Evaluate in browser to render transparent bubbles using Canvas
    const exportData = await page.evaluate((cfg) => {
      function drawAppleSenderBubble(ctx, x, y, w, h, radius, scale) {
        const r = Math.min(radius, Math.floor(h / 2));
        const tailW = Math.round(14 * scale);
        const tailH = Math.round(18 * scale);
        const bodyW = w - tailW;

        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + bodyW - r, y);
        ctx.arcTo(x + bodyW, y, x + bodyW, y + r, r);
        ctx.lineTo(x + bodyW, y + h - tailH);
        ctx.bezierCurveTo(
          x + bodyW, y + h - Math.round(6 * scale),
          x + bodyW + Math.round(4 * scale), y + h - Math.round(1 * scale),
          x + w, y + h
        );
        ctx.bezierCurveTo(
          x + bodyW + Math.round(2 * scale), y + h,
          x + bodyW - Math.round(8 * scale), y + h - 0.5,
          x + bodyW - Math.round(14 * scale), y + h
        );
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
      }

      function drawAppleReceiverBubble(ctx, x, y, w, h, radius, scale) {
        const r = Math.min(radius, Math.floor(h / 2));
        const tailW = Math.round(14 * scale);
        const tailH = Math.round(18 * scale);
        const bodyX = x + tailW;
        const bodyW = w - tailW;

        ctx.beginPath();
        ctx.moveTo(bodyX + r, y);
        ctx.lineTo(bodyX + bodyW - r, y);
        ctx.arcTo(bodyX + bodyW, y, bodyX + bodyW, y + r, r);
        ctx.lineTo(bodyX + bodyW, y + h - r);
        ctx.arcTo(bodyX + bodyW, y + h, bodyX + bodyW - r, y + h, r);
        ctx.lineTo(bodyX + Math.round(14 * scale), y + h);
        ctx.bezierCurveTo(
          bodyX + Math.round(8 * scale), y + h - 0.5,
          bodyX - Math.round(2 * scale), y + h,
          x, y + h
        );
        ctx.bezierCurveTo(
          bodyX - Math.round(4 * scale), y + h - Math.round(1 * scale),
          bodyX, y + h - Math.round(6 * scale),
          bodyX, y + h - tailH
        );
        ctx.lineTo(bodyX, y + r);
        ctx.arcTo(bodyX, y, bodyX + r, y, r);
        ctx.closePath();
      }

      function wrapCanvasText(ctx, text, maxWidth) {
        const rawParagraphs = String(text || '').split(/\\r?\\n/);
        const lines = [];
        for (const para of rawParagraphs) {
          if (!para.trim()) { lines.push(''); continue; }
          const words = para.split(/\\s+/).filter(Boolean);
          let currentLine = '';
          for (let i = 0; i < words.length; i++) {
            const word = words[i];
            if (ctx.measureText(word).width > maxWidth) {
              if (currentLine) { lines.push(currentLine); currentLine = ''; }
              let charChunk = '';
              for (const char of word) {
                if (ctx.measureText(charChunk + char).width > maxWidth) {
                  if (charChunk) lines.push(charChunk);
                  charChunk = char;
                } else {
                  charChunk += char;
                }
              }
              if (charChunk) currentLine = charChunk;
            } else {
              const testLine = currentLine ? currentLine + ' ' + word : word;
              if (ctx.measureText(testLine).width <= maxWidth) {
                currentLine = testLine;
              } else {
                lines.push(currentLine);
                currentLine = word;
              }
            }
          }
          if (currentLine) lines.push(currentLine);
        }
        if (lines.length >= 2) {
          const last = lines[lines.length - 1].trim();
          const lastWords = last.split(/\\s+/);
          if (lastWords.length === 1) {
            const prev = lines[lines.length - 2].trim();
            const prevWords = prev.split(/\\s+/);
            if (prevWords.length >= 3) {
              const movedWord = prevWords.pop();
              const candidatePrev = prevWords.join(' ');
              const candidateLast = movedWord + ' ' + last;
              if (ctx.measureText(candidateLast).width <= maxWidth) {
                lines[lines.length - 2] = candidatePrev;
                lines[lines.length - 1] = candidateLast;
              }
            }
          }
        }
        return lines.length > 0 ? lines : [''];
      }

      // High-resolution export scale: 2x for 1080p (retina), 4x for 4K Master
      const pngScale = (cfg.currentQuality === '4k') ? 4 : 2;
      const fontMultiplier = pngScale / (cfg.scale || 1);

      const fontSize = Math.round(cfg.fontSize * fontMultiplier);
      const lineHeight = Math.round(cfg.lineHeight * fontMultiplier);
      const paddingX = Math.round(cfg.paddingX * fontMultiplier);
      const paddingY = Math.round(cfg.paddingY * fontMultiplier);
      const bubbleRadius = Math.round(cfg.bubbleRadius * fontMultiplier);
      const chatColumnWidth = Math.round(cfg.chatColumnWidth * fontMultiplier);
      const gap = Math.round(cfg.gap * fontMultiplier);

      const fontSpec = '500 ' + fontSize + 'px -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", "Helvetica Neue", sans-serif';

      const measureCanvas = document.createElement('canvas');
      const mCtx = measureCanvas.getContext('2d');
      mCtx.font = fontSpec;

      const bubbleWidthRatio = (cfg.currentWidthPreset === 'narrow') 
        ? 0.88 
        : (cfg.currentWidthPreset === 'wide' ? 0.72 : 0.78);
      const maxAllowedBubbleWidth = Math.floor(chatColumnWidth * bubbleWidthRatio);
      const tailExtra = Math.round(18 * pngScale);
      const maxTextWidth = Math.max(80 * pngScale, maxAllowedBubbleWidth - (paddingX * 2 + tailExtra));

      const shadowMargin = cfg.isShadowEnabled ? Math.round(36 * pngScale) : Math.round(12 * pngScale);
      const shadowBlur = cfg.isShadowEnabled ? (18 * pngScale) : 0;
      const shadowOffsetY = cfg.isShadowEnabled ? (4 * pngScale) : 0;

      const items = [];
      const padLength = Math.max(2, String(cfg.messages.length).length);

      // 1. Measure and render individual bubbles
      cfg.messages.forEach((msg, idx) => {
        const isSender = msg.type === 'sender';
        const lines = wrapCanvasText(mCtx, msg.text, maxTextWidth);
        let maxLineWidth = 0;
        lines.forEach(l => {
          const w = mCtx.measureText(l).width;
          if (w > maxLineWidth) maxLineWidth = w;
        });

        const bubbleWidth = Math.max(140 * pngScale, Math.round(maxLineWidth + paddingX * 2 + tailExtra));
        const bubbleHeight = Math.round(lines.length * lineHeight + paddingY * 2);

        const canvas = document.createElement('canvas');
        canvas.width = bubbleWidth + shadowMargin * 2;
        canvas.height = bubbleHeight + shadowMargin * 2;
        const ctx = canvas.getContext('2d', { alpha: true });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.font = fontSpec;

        const bx = shadowMargin;
        const by = shadowMargin;

        if (cfg.isShadowEnabled) {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
          ctx.shadowBlur = shadowBlur;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = shadowOffsetY;
        }

        if (isSender) {
          const color = msg.color || cfg.currentSenderColor || '#007aff';
          const grad = ctx.createLinearGradient(bx, by, bx, by + bubbleHeight);
          if (color === '#007aff') {
            grad.addColorStop(0, '#1c8aff');
            grad.addColorStop(1, '#006ee6');
          } else if (color === '#af52de') {
            grad.addColorStop(0, '#be63e6');
            grad.addColorStop(1, '#9935cc');
          } else {
            grad.addColorStop(0, color);
            grad.addColorStop(1, color);
          }
          ctx.fillStyle = grad;
          drawAppleSenderBubble(ctx, bx, by, bubbleWidth, bubbleHeight, bubbleRadius, pngScale);
          ctx.fill();
        } else {
          ctx.fillStyle = '#e9e9eb';
          drawAppleReceiverBubble(ctx, bx, by, bubbleWidth, bubbleHeight, bubbleRadius, pngScale);
          ctx.fill();
        }

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.fillStyle = isSender ? '#FFFFFF' : '#000000';
        ctx.textBaseline = 'top';

        const textStartX = isSender 
          ? bx + paddingX 
          : bx + paddingX + Math.round(12 * pngScale);

        for (let l = 0; l < lines.length; l++) {
          ctx.fillText(lines[l], textStartX, by + paddingY + l * lineHeight);
        }

        const seq = String(idx + 1).padStart(padLength, '0');
        const filename = `${seq}_${msg.type}.png`;
        items.push({
          filename,
          dataUrl: canvas.toDataURL('image/png'),
          bubbleWidth,
          bubbleHeight,
          lines,
          isSender
        });
      });

      // 2. Render Full Stacked Transparent Conversation
      let totalConversationHeight = 0;
      items.forEach((it, idx) => {
        totalConversationHeight += it.bubbleHeight;
        if (idx < items.length - 1) totalConversationHeight += gap;
      });

      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = chatColumnWidth + shadowMargin * 2;
      fullCanvas.height = totalConversationHeight + shadowMargin * 2;
      const fCtx = fullCanvas.getContext('2d', { alpha: true });
      fCtx.imageSmoothingEnabled = true;
      fCtx.imageSmoothingQuality = 'high';
      fCtx.font = fontSpec;

      let currY = shadowMargin;
      items.forEach(it => {
        const xPos = it.isSender 
          ? (shadowMargin + chatColumnWidth - it.bubbleWidth) 
          : shadowMargin;

        if (cfg.isShadowEnabled) {
          fCtx.shadowColor = 'rgba(0, 0, 0, 0.25)';
          fCtx.shadowBlur = shadowBlur;
          fCtx.shadowOffsetX = 0;
          fCtx.shadowOffsetY = shadowOffsetY;
        }

        if (it.isSender) {
          const color = cfg.currentSenderColor || '#007aff';
          const grad = fCtx.createLinearGradient(xPos, currY, xPos, currY + it.bubbleHeight);
          if (color === '#007aff') {
            grad.addColorStop(0, '#1c8aff');
            grad.addColorStop(1, '#006ee6');
          } else if (color === '#af52de') {
            grad.addColorStop(0, '#be63e6');
            grad.addColorStop(1, '#9935cc');
          } else {
            grad.addColorStop(0, color);
            grad.addColorStop(1, color);
          }
          fCtx.fillStyle = grad;
          drawAppleSenderBubble(fCtx, xPos, currY, it.bubbleWidth, it.bubbleHeight, bubbleRadius, pngScale);
          fCtx.fill();
        } else {
          fCtx.fillStyle = '#e9e9eb';
          drawAppleReceiverBubble(fCtx, xPos, currY, it.bubbleWidth, it.bubbleHeight, bubbleRadius, pngScale);
          fCtx.fill();
        }

        fCtx.shadowColor = 'transparent';
        fCtx.shadowBlur = 0;
        fCtx.fillStyle = it.isSender ? '#FFFFFF' : '#000000';
        fCtx.textBaseline = 'top';

        const textStartX = it.isSender 
          ? xPos + paddingX 
          : xPos + paddingX + Math.round(12 * pngScale);

        for (let l = 0; l < it.lines.length; l++) {
          fCtx.fillText(it.lines[l], textStartX, currY + paddingY + l * lineHeight);
        }

        currY += it.bubbleHeight + gap;
      });

      items.push({
        filename: 'full_conversation_transparent.png',
        dataUrl: fullCanvas.toDataURL('image/png')
      });

      return items;
    }, config);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
    res.setHeader('Cache-Control', 'no-cache');

    archive = createZipArchive();

    archive.on('error', (err) => {
      console.error('Archive error in /api/export/png:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'ZIP archive streaming failed: ' + err.message });
      }
    });

    archive.pipe(res);

    for (const item of exportData) {
      if (res.destroyed || res.writableEnded) break;
      const base64Data = item.dataUrl.replace(/^data:image\/png;base64,/, '');
      const pngBuffer = Buffer.from(base64Data, 'base64');
      archive.append(pngBuffer, { name: item.filename });
    }

    await archive.finalize();

    await new Promise((resolve, reject) => {
      res.on('finish', resolve);
      archive.on('error', reject);
    });

  } catch (error) {
    console.error('Error generating transparent PNG ZIP export:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate transparent PNG export: ' + (error.message || error) });
    }
  } finally {
    await cleanup();
  }
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
