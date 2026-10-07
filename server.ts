import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { randomUUID } from 'crypto';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Temporary upload storage for media transcoding
const uploadDir = path.join(os.tmpdir(), 'spotify-studio-renders');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Concurrency limiter to protect server resources
let activeTranscodes = 0;
const MAX_CONCURRENT_TRANSCODES = 2;

type TranscodeStatus = 'uploading' | 'processing' | 'done' | 'error';

type TranscodeTask = {
  status: TranscodeStatus;
  error?: string;
  createdAt: number;
  updatedAt: number;
  // Chunk bookkeeping so retried chunks never get appended twice.
  nextChunk: { video: number; audio: number };
  bytes: { video: number; audio: number };
};

// A session that has been idle (no upload activity / not downloaded) for this
// long is considered abandoned. Running FFmpeg jobs are never reaped.
const SESSION_TTL_MS = 15 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// In-memory state for asynchronous server-side FFmpeg jobs.
// The browser uses the sessionId as its job/receipt number and polls this map.
const transcodeTasks = new Map<string, TranscodeTask>();

// Slots already promised to clients: FFmpeg jobs that are running plus sessions
// that are still uploading. Checking this at /init avoids making a client upload
// hundreds of MB only to receive a 429 at /finish.
function reservedSlots(): number {
  let uploading = 0;
  for (const task of transcodeTasks.values()) {
    if (task.status === 'uploading') uploading++;
  }
  return activeTranscodes + uploading;
}

function removeSessionFiles(sessionId: string, opts: { keepOutput?: boolean } = {}) {
  const sessionDir = path.join(uploadDir, sessionId);
  const outputPath = path.join(uploadDir, `render-${sessionId}.mp4`);
  try {
    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
    if (!opts.keepOutput && fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  } catch (err) {
    console.warn('[Session Cleanup Warning]', err);
  }
}

// Directory mtime only changes when entries are added/removed, NOT when a file
// inside is appended to. Use the newest mtime of the dir and its children.
function latestMtimeMs(fullPath: string): number {
  const stat = fs.statSync(fullPath);
  let latest = stat.mtimeMs;
  if (stat.isDirectory()) {
    for (const child of fs.readdirSync(fullPath)) {
      try {
        latest = Math.max(latest, fs.statSync(path.join(fullPath, child)).mtimeMs);
      } catch {
        // child vanished between readdir and stat
      }
    }
  }
  return latest;
}

// Export Throttling / Rate Limiting per IP
interface RateLimitRecord {
  count: number;
  resetAt: number;
}
const ipRateLimits = new Map<string, RateLimitRecord>();
const EXPORT_WINDOW_MS = 60 * 1000; // 1-minute window
const MAX_EXPORTS_PER_WINDOW = 6; // max 6 export requests per minute per IP

function exportRateLimiter(req: express.Request, res: express.Response, next: express.NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const record = ipRateLimits.get(ip);

  if (!record || now > record.resetAt) {
    ipRateLimits.set(ip, { count: 1, resetAt: now + EXPORT_WINDOW_MS });
    return next();
  }

  if (record.count >= MAX_EXPORTS_PER_WINDOW) {
    const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      error: `Throttling: Terlalu banyak permintaan ekspor video dari perangkat Anda. Harap tunggu ${retryAfterSec} detik sebelum mencoba kembali.`,
      retryAfter: retryAfterSec,
    });
  }

  record.count++;
  next();
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || (file.fieldname === 'video' ? '.webm' : '.wav');
    cb(null, `${file.fieldname}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500 MB max
  },
});

app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', '*');
  if (_req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Serve static assets from public directory with CORS support
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json());

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    ffmpegAvailable: true,
    activeTranscodes,
    maxConcurrent: MAX_CONCURRENT_TRANSCODES,
  });
});

// Periodic cleanup of abandoned sessions, orphaned files and expired rate-limit records.
setInterval(() => {
  try {
    const now = Date.now();
    for (const [key, val] of ipRateLimits.entries()) {
      if (now > val.resetAt) {
        ipRateLimits.delete(key);
      }
    }

    // Task lifecycle: never touch a job that FFmpeg is still working on.
    // 'uploading' sessions use updatedAt (bumped on every chunk), so a slow
    // but active upload is never reaped. 'done'/'error' results are kept for
    // SESSION_TTL_MS so a client that lost its connection can still retry the
    // download.
    for (const [sessionId, task] of transcodeTasks.entries()) {
      if (task.status === 'processing') continue;
      if (now - task.updatedAt > SESSION_TTL_MS) {
        removeSessionFiles(sessionId);
        transcodeTasks.delete(sessionId);
      }
    }

    // Orphans (e.g. left behind by a server restart) have no task entry.
    const items = fs.readdirSync(uploadDir);
    for (const item of items) {
      if (transcodeTasks.has(item)) continue;
      if (item.startsWith('render-') && item.endsWith('.mp4')) {
        const sessionId = item.slice('render-'.length, -'.mp4'.length);
        if (transcodeTasks.has(sessionId)) continue;
      }

      const fullPath = path.join(uploadDir, item);
      try {
        if (now - latestMtimeMs(fullPath) > SESSION_TTL_MS) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        }
      } catch {
        // file removed concurrently; ignore
      }
    }
  } catch (err) {
    console.warn('[Cleanup Warning]', err);
  }
}, CLEANUP_INTERVAL_MS);

// Helper function to run FFmpeg transcode and ffprobe validation
async function runFfmpegTranscode(
  videoPath: string,
  audioPath: string,
  outputPath: string,
  duration?: number,
  fps?: number
): Promise<void> {
  const ffmpegArgs: string[] = [
    '-nostdin',
    '-y',
  ];

  ffmpegArgs.push('-i', videoPath);
  ffmpegArgs.push('-i', audioPath);

  if (duration && duration > 0) {
    ffmpegArgs.push('-t', String(duration));
  } else {
    ffmpegArgs.push('-shortest');
  }

  ffmpegArgs.push(
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '21',
    '-profile:v', 'main',
    '-level:v', '4.1',
    '-pix_fmt', 'yuv420p',
    '-fps_mode', 'passthrough',
    '-threads', '0',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '44100',
    '-ac', '2',
    '-movflags', '+faststart',
    outputPath
  );

  await new Promise<void>((resolve, reject) => {
    // Dynamic timeout: at least 10 minutes (600 seconds), scaled with requested video duration
    const TIMEOUT_MS = Math.max(600_000, Math.ceil((duration || 60) * 20_000));
    let hasSettled = false;

    const proc = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let errorOutput = '';

    const timer = setTimeout(() => {
      if (hasSettled) return;
      hasSettled = true;
      proc.kill('SIGKILL');
      reject(new Error(`Proses FFmpeg melampaui batas waktu ${Math.round(TIMEOUT_MS / 1000)} detik (timeout).`));
    }, TIMEOUT_MS);

    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (hasSettled) return;
      hasSettled = true;
      if (code === 0) {
        resolve();
      } else {
        console.error('[FFmpeg Error Output]', errorOutput);
        reject(new Error(`FFmpeg exited with code ${code}: ${errorOutput.slice(-300)}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      if (hasSettled) return;
      hasSettled = true;
      reject(err);
    });
  });

  // Validasi Output menggunakan ffprobe sebelum dikirim
  const validationArgs = [
    '-v', 'error',
    '-show_entries', 'stream=codec_name,width,height,sample_rate,channels',
    '-show_entries', 'format=format_name,duration,size',
    '-of', 'json',
    outputPath,
  ];

  const probeResult = spawnSync('ffprobe', validationArgs);
  if (probeResult.status !== 0) {
    throw new Error(`Validasi ffprobe gagal: ${probeResult.stderr?.toString()}`);
  }

  const probeData = JSON.parse(probeResult.stdout.toString());
  const formatName = probeData.format?.format_name || '';
  const sizeBytes = Number(probeData.format?.size || 0);
  const streams = probeData.streams || [];
  const hasH264 = streams.some((s: any) => s.codec_name === 'h264');
  const hasAac = streams.some((s: any) => s.codec_name === 'aac');

  if (!formatName.includes('mp4') || sizeBytes < 1000 || !hasH264 || !hasAac) {
    throw new Error(
      `Validasi file MP4 gagal: Format bukan MP4 valid atau stream H.264/AAC tidak ditemukan (size: ${sizeBytes} bytes, format: ${formatName}, H.264: ${hasH264}, AAC: ${hasAac}).`
    );
  }
}

const chunkStorage = multer.memoryStorage();
const chunkUpload = multer({
  storage: chunkStorage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB chunk max, well within 32MB proxy limits
  },
});

const SESSION_ID_RE = /^[a-zA-Z0-9_-]+$/;

/**
 * 1. Chunked Upload: Inisialisasi Session dengan Throttling Rate Limiter
 *
 * The session is registered immediately (status 'uploading') so it reserves a
 * slot and so the cleanup sweep can tell "slow upload" apart from "abandoned".
 */
app.post('/api/transcode/init', exportRateLimiter, (req: express.Request, res: express.Response) => {
  if (reservedSlots() >= MAX_CONCURRENT_TRANSCODES) {
    return res.status(429).json({
      error: 'Server sedang memproses ekspor video lain. Silakan coba kembali dalam beberapa detik.',
    });
  }
  // Unguessable id: anyone holding it can poll/download the render.
  const sessionId = `session-${randomUUID()}`;
  const sessionDir = path.join(uploadDir, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });
  const now = Date.now();
  transcodeTasks.set(sessionId, {
    status: 'uploading',
    createdAt: now,
    updatedAt: now,
    nextChunk: { video: 0, audio: 0 },
    bytes: { video: 0, audio: 0 },
  });
  res.json({
    sessionId,
    chunkSize: 3 * 1024 * 1024,
  });
});

/**
 * 2. Chunked Upload: Terima potongan (chunk) binary
 *
 * Idempotent: a chunk index that was already stored is acknowledged without
 * being appended again, so the client can safely retry after a network error.
 * Chunks must arrive in order per track; a gap is rejected with 409.
 */
app.post(
  '/api/transcode/chunk',
  chunkUpload.single('chunk') as any,
  (req: express.Request, res: express.Response) => {
    const { sessionId, type, chunkIndex } = req.body;
    if (!sessionId || !SESSION_ID_RE.test(sessionId)) {
      return res.status(400).json({ error: 'Session ID tidak valid' });
    }
    if (type !== 'video' && type !== 'audio') {
      return res.status(400).json({ error: 'Tipe chunk tidak valid (wajib video atau audio)' });
    }
    const idx = Number(chunkIndex);
    if (!Number.isInteger(idx) || idx < 0) {
      return res.status(400).json({ error: 'chunkIndex tidak valid' });
    }

    const task = transcodeTasks.get(sessionId);
    const sessionDir = path.join(uploadDir, sessionId);
    if (!task || !fs.existsSync(sessionDir)) {
      return res.status(404).json({
        code: 'SESSION_NOT_FOUND',
        error: 'Session upload tidak ditemukan atau kedaluwarsa',
      });
    }
    if (task.status !== 'uploading') {
      return res.status(409).json({ error: 'Session ini sudah tidak menerima chunk baru' });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'Data chunk tidak ditemukan' });
    }

    const expected = task.nextChunk[type as 'video' | 'audio'];
    if (idx < expected) {
      // Retry of a chunk we already have.
      task.updatedAt = Date.now();
      return res.json({ success: true, chunkIndex: idx, duplicate: true });
    }
    if (idx > expected) {
      return res.status(409).json({
        error: `Chunk ${type} tidak berurutan (diharapkan ${expected}, diterima ${idx})`,
        expectedChunk: expected,
      });
    }

    const targetFile = path.join(sessionDir, type === 'video' ? 'video.webm' : 'audio.wav');
    try {
      // A previous attempt may have been cut off mid-write; trim back to the
      // last fully committed size before appending.
      const committed = task.bytes[type as 'video' | 'audio'];
      if (fs.existsSync(targetFile)) {
        const onDisk = fs.statSync(targetFile).size;
        if (onDisk > committed) {
          fs.truncateSync(targetFile, committed);
        } else if (onDisk < committed) {
          throw new Error(`File ${type} di server lebih kecil dari yang diharapkan (${onDisk} < ${committed})`);
        }
      } else if (committed !== 0) {
        throw new Error(`File ${type} di server hilang`);
      }

      fs.appendFileSync(targetFile, req.file.buffer);
      task.bytes[type as 'video' | 'audio'] = committed + req.file.buffer.length;
      task.nextChunk[type as 'video' | 'audio'] = idx + 1;
      task.updatedAt = Date.now();
      res.json({ success: true, chunkIndex: idx });
    } catch (err: any) {
      console.error('[Chunk Append Error]', err);
      res.status(500).json({ error: 'Gagal menulis chunk file' });
    }
  }
);

/**
 * 3. Chunked Upload: Finalisasi -> create asynchronous FFmpeg job
 *
 * The request returns immediately with the sessionId (the client's
 * "receipt number"). FFmpeg continues in the background and the client
 * polls /api/transcode/status/:sessionId before downloading the result.
 */
app.post('/api/transcode/finish', (req: express.Request, res: express.Response) => {
  const { sessionId, duration, fps, videoChunks, audioChunks } = req.body;
  if (!sessionId || !SESSION_ID_RE.test(sessionId)) {
    return res.status(400).json({ error: 'Session ID tidak valid' });
  }

  const task = transcodeTasks.get(sessionId);
  if (!task) {
    return res.status(404).json({ code: 'SESSION_NOT_FOUND', error: 'Session upload tidak ditemukan' });
  }

  // Idempotency guard: if the client retries /finish, do not start a second
  // FFmpeg process for the same session.
  if (task.status !== 'uploading') {
    return res.json({
      success: true,
      sessionId,
      status: task.status,
      message: task.status === 'processing'
        ? 'Proses render untuk sesi ini sudah berjalan.'
        : 'Sesi render ini sudah terdaftar.',
    });
  }

  const sessionDir = path.join(uploadDir, sessionId);
  if (!fs.existsSync(sessionDir)) {
    return res.status(404).json({ code: 'SESSION_NOT_FOUND', error: 'Session upload tidak ditemukan' });
  }

  // Integrity check: the client states how many chunks it sent per track.
  if (videoChunks !== undefined && Number(videoChunks) !== task.nextChunk.video) {
    return res.status(400).json({
      error: `Jumlah chunk video tidak cocok (server: ${task.nextChunk.video}, klien: ${videoChunks}).`,
    });
  }
  if (audioChunks !== undefined && Number(audioChunks) !== task.nextChunk.audio) {
    return res.status(400).json({
      error: `Jumlah chunk audio tidak cocok (server: ${task.nextChunk.audio}, klien: ${audioChunks}).`,
    });
  }

  const videoPath = path.join(sessionDir, 'video.webm');
  const audioPath = path.join(sessionDir, 'audio.wav');

  if (!fs.existsSync(videoPath) || fs.statSync(videoPath).size === 0) {
    return res.status(400).json({ error: 'Video track stream kosong atau belum selesai diunggah' });
  }
  if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size === 0) {
    return res.status(400).json({ error: 'Audio track stream kosong atau belum selesai diunggah' });
  }

  // No capacity check here: this session already reserved its slot at /init.
  // Switching uploading -> processing keeps the reserved total unchanged.
  activeTranscodes++;
  const outputFileName = `render-${sessionId}.mp4`;
  const outputPath = path.join(uploadDir, outputFileName);
  task.status = 'processing';
  task.updatedAt = Date.now();

  // Deliberately do not await this promise: the HTTP request must finish
  // immediately so proxies/browser timeouts cannot kill a long FFmpeg job.
  void runFfmpegTranscode(
    videoPath,
    audioPath,
    outputPath,
    duration ? Number(duration) : undefined,
    fps ? Number(fps) : undefined
  )
    .then(() => {
      task.status = 'done';
      task.updatedAt = Date.now();
    })
    .catch((err: any) => {
      console.error('[Background Transcode Error]', err);
      task.status = 'error';
      task.error = err?.message || 'Gagal merender video';
      task.updatedAt = Date.now();

      // A failed job should not leave a partial MP4 behind. Keep the task
      // state briefly so the client can receive the actual error via polling.
      try {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch {
        // ignore cleanup errors
      }
    })
    .finally(() => {
      activeTranscodes = Math.max(0, activeTranscodes - 1);
      // The raw WebM/WAV inputs are no longer needed once FFmpeg has exited
      // (success or failure). Free the disk right away instead of waiting for
      // the TTL; only the finished MP4 has to stay around for the download.
      removeSessionFiles(sessionId, { keepOutput: true });
    });

  return res.json({
    success: true,
    sessionId,
    status: 'processing',
    message: 'Proses render di server dimulai.',
  });
});

/**
 * 4. Polling status endpoint.
 */
app.get('/api/transcode/status/:sessionId', (req: express.Request, res: express.Response) => {
  const { sessionId } = req.params;
  if (!sessionId || !SESSION_ID_RE.test(sessionId)) {
    return res.status(400).json({ error: 'Session ID tidak valid' });
  }

  const task = transcodeTasks.get(sessionId);
  if (!task) {
    return res.status(404).json({
      code: 'SESSION_NOT_FOUND',
      error: 'Sesi tidak ditemukan atau sudah kedaluwarsa',
    });
  }

  return res.json({
    status: task.status,
    ...(task.error ? { error: task.error } : {}),
  });
});

/**
 * 5. Download completed MP4.
 *
 * The task and files are removed only after the response was fully written
 * ('finish'). If the connection drops mid-download ('close' without finish)
 * the result is kept until the TTL expires so the client can simply retry.
 */
app.get('/api/transcode/download/:sessionId', (req: express.Request, res: express.Response) => {
  const { sessionId } = req.params;
  if (!sessionId || !SESSION_ID_RE.test(sessionId)) {
    return res.status(400).json({ error: 'Session ID tidak valid' });
  }

  const task = transcodeTasks.get(sessionId);
  if (!task) {
    return res.status(404).json({
      code: 'SESSION_NOT_FOUND',
      error: 'Sesi tidak ditemukan atau sudah kedaluwarsa',
    });
  }
  if (task.status === 'error') {
    return res.status(500).json({ error: task.error || 'Render gagal' });
  }
  if (task.status !== 'done') {
    return res.status(409).json({ error: 'File belum siap diunduh' });
  }

  const outputPath = path.join(uploadDir, `render-${sessionId}.mp4`);

  let fileSize: number;
  try {
    fileSize = fs.statSync(outputPath).size;
  } catch {
    return res.status(404).json({ error: 'File output tidak ditemukan di server' });
  }

  res.setHeader('Content-Type', 'video/mp4');
  // Lets the client verify it received the complete file.
  res.setHeader('Content-Length', String(fileSize));
  res.setHeader('Content-Disposition', 'attachment; filename="spotify-canvas-h264.mp4"');

  let cleaned = false;
  const cleanupAll = () => {
    if (cleaned) return;
    cleaned = true;
    transcodeTasks.delete(sessionId);
    removeSessionFiles(sessionId);
  };

  const fileStream = fs.createReadStream(outputPath);
  fileStream.on('error', (streamErr) => {
    console.error('[Download Stream Error]', streamErr);
    // Keep the result so the client can retry; the TTL will reclaim it.
    if (!res.headersSent) {
      res.removeHeader('Content-Disposition');
      res.status(500).json({ error: 'Gagal membaca file hasil render' });
    } else {
      res.destroy(streamErr);
    }
  });

  res.on('finish', cleanupAll);
  res.on('close', () => {
    if (res.writableFinished) {
      cleanupAll();
      return;
    }
    // Aborted download: pipe() does not close the source when the destination
    // goes away, so release the file descriptor and restart the TTL clock.
    fileStream.destroy();
    task.updatedAt = Date.now();
  });
  fileStream.pipe(res);
});

/**
 * Server-side FFmpeg MP4 Transcoding Endpoint (Legacy Direct Upload)
 * Menggabungkan video track dan master audio track menjadi genuine MP4 H.264 + AAC
 * divalidasi ketat dengan ffprobe sebelum dikirim ke client.
 */
app.post(
  '/api/transcode-mp4',
  exportRateLimiter,
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (reservedSlots() >= MAX_CONCURRENT_TRANSCODES) {
      return res.status(429).json({
        error: 'Server sedang memproses ekspor video lain. Silakan coba kembali dalam beberapa detik.',
      });
    }
    next();
  },
  upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'audio', maxCount: 1 },
  ]) as any,
  async (req: express.Request, res: express.Response) => {
    activeTranscodes++;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const videoFile = files?.['video']?.[0];
    const audioFile = files?.['audio']?.[0];
    const duration = req.body.duration ? Number(req.body.duration) : undefined;
    const fps = req.body.fps ? Number(req.body.fps) : undefined;

    const tempFilesToClean: string[] = [];
    if (videoFile) tempFilesToClean.push(videoFile.path);
    if (audioFile) tempFilesToClean.push(audioFile.path);

    const outputFileName = `render-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.mp4`;
    const outputPath = path.join(uploadDir, outputFileName);

    try {
      if (!videoFile) {
        return res.status(400).json({ error: 'Video file diperlukan untuk transcode.' });
      }
      if (!audioFile) {
        return res.status(400).json({
          error: 'Audio file diperlukan untuk transcode MP4 (Spotify Canvas wajib menyertakan audio track).',
        });
      }

      await runFfmpegTranscode(videoFile.path, audioFile.path, outputPath, duration, fps);

      // Stream the validated MP4 file to client
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', 'attachment; filename="spotify-canvas-h264.mp4"');

      const fileStream = fs.createReadStream(outputPath);
      fileStream.pipe(res);

      const cleanupOutput = () => {
        if (fs.existsSync(outputPath)) {
          fs.unlink(outputPath, () => {});
        }
      };

      res.on('finish', cleanupOutput);
      res.on('close', cleanupOutput);
      fileStream.on('error', (streamErr) => {
        console.error('[FileStream Error]', streamErr);
        cleanupOutput();
      });
    } catch (err: any) {
      console.error('[Transcode Error]', err);
      // Bersihkan file output jika ada kegagalan
      if (fs.existsSync(outputPath)) {
        fs.unlink(outputPath, () => {});
      }
      res.status(500).json({ error: err.message || 'Transcoding gagal dilakukan oleh server.' });
    } finally {
      activeTranscodes = Math.max(0, activeTranscodes - 1);
      // Clean up input temp files
      for (const tempPath of tempFilesToClean) {
        if (fs.existsSync(tempPath)) {
          fs.unlink(tempPath, () => {});
        }
      }
    }
  }
);

// Mount Vite or static server
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', port: PORT },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
