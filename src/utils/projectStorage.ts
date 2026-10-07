/**
 * Project Storage Service using IndexedDB
 * Menyimpan seluruh aset proyek (audio file blob, video file blob, metadata, lirik sinkron, tema, rasio)
 * secara persisten di browser pengguna sehingga tidak hilang saat browser ditutup atau di-refresh.
 */

import { ProjectData, ProjectMetadata } from '../types/project';

const DB_NAME = 'SpotifyLyricStudioDB';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('name', 'name', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Mengambil daftar ringkasan proyek untuk ditampilkan di antarmuka (ringan, tanpa memuat blob besar)
 */
export async function getAllProjectSummaries(): Promise<ProjectMetadata[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const items: ProjectData[] = request.result || [];
      const summaries: ProjectMetadata[] = items.map((item) => ({
        id: item.id,
        name: item.name,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        trackMeta: {
          title: item.trackMeta.title,
          artist: item.trackMeta.artist,
          album: item.trackMeta.album,
          duration: item.trackMeta.duration,
          audioFileName: item.trackMeta.audioFileName,
          videoFileName: item.trackMeta.videoFileName,
        },
        lyricsCount: Array.isArray(item.lyrics) ? item.lyrics.length : 0,
        hasAudio: !!item.audioBlob || !!item.trackMeta.audioFileName,
        hasVideo: !!item.videoBlob || !!item.trackMeta.videoFileName,
        aspectRatio: item.aspectRatio,
        displayMode: item.displayMode,
        theme: item.theme,
        showTranslation: item.showTranslation,
        thumbnailUrl: item.thumbnailUrl,
      }));

      // Urutkan dari yang paling baru diperbarui
      summaries.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(summaries);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Mengambil satu proyek lengkap beserta audioBlob dan videoBlob
 */
export async function getProject(id: string): Promise<ProjectData | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Menyimpan atau memperbarui proyek di IndexedDB
 */
export async function saveProject(project: ProjectData): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const dataToSave: ProjectData = {
      ...project,
      updatedAt: Date.now(),
    };

    const request = store.put(dataToSave);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Menghapus proyek berdasarkan ID
 */
export async function deleteProject(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Menduplikasi proyek yang sudah ada
 */
export async function duplicateProject(id: string): Promise<ProjectData> {
  const original = await getProject(id);
  if (!original) {
    throw new Error('Proyek tidak ditemukan');
  }

  const newId = 'proj_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const copy: ProjectData = {
    ...original,
    id: newId,
    name: `${original.name} (Salinan)`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await saveProject(copy);
  return copy;
}

/**
 * Helper untuk mengonversi Blob ke format Base64 (untuk backup file eksternal)
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Helper untuk mengonversi Base64 string kembali ke Blob
 */
function base64ToBlob(base64: string): Blob {
  const parts = base64.split(';base64,');
  const contentType = parts[0].replace('data:', '') || 'application/octet-stream';
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);

  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }

  return new Blob([uInt8Array], { type: contentType });
}

/**
 * Ekspor proyek ke file JSON (.spotifyproj) yang bisa disimpan di komputer / HP
 */
export async function exportProjectToFile(project: ProjectData): Promise<void> {
  const exportPayload: Record<string, unknown> = {
    version: 1,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    trackMeta: {
      title: project.trackMeta.title,
      artist: project.trackMeta.artist,
      album: project.trackMeta.album,
      duration: project.trackMeta.duration,
      audioFileName: project.trackMeta.audioFileName,
      videoFileName: project.trackMeta.videoFileName,
    },
    lyrics: project.lyrics,
    aspectRatio: project.aspectRatio,
    displayMode: project.displayMode,
    theme: project.theme,
    showTranslation: project.showTranslation,
  };

  if (project.audioBlob) {
    try {
      exportPayload.audioBase64 = await blobToBase64(project.audioBlob);
    } catch (e) {
      console.warn('Gagal mengekspor audio blob ke base64:', e);
    }
  }

  if (project.videoBlob) {
    try {
      exportPayload.videoBase64 = await blobToBase64(project.videoBlob);
    } catch (e) {
      console.warn('Gagal mengekspor video blob ke base64:', e);
    }
  }

  const jsonStr = JSON.stringify(exportPayload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = (project.name || 'proyek')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  a.download = `${safeName}.spotifyproj`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Impor proyek dari file .spotifyproj atau JSON
 */
export async function importProjectFromFile(file: File): Promise<ProjectData> {
  const text = await file.text();
  const parsed = JSON.parse(text);

  const newId = 'proj_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

  let audioBlob: Blob | null = null;
  if (parsed.audioBase64) {
    try {
      audioBlob = base64ToBlob(parsed.audioBase64);
    } catch (e) {
      console.warn('Gagal mengurai audioBase64:', e);
    }
  }

  let videoBlob: Blob | null = null;
  if (parsed.videoBase64) {
    try {
      videoBlob = base64ToBlob(parsed.videoBase64);
    } catch (e) {
      console.warn('Gagal mengurai videoBase64:', e);
    }
  }

  const project: ProjectData = {
    id: newId,
    name: parsed.name || file.name.replace(/\.[^/.]+$/, ''),
    createdAt: parsed.createdAt || Date.now(),
    updatedAt: Date.now(),
    trackMeta: {
      title: parsed.trackMeta?.title || 'Judul Lagu',
      artist: parsed.trackMeta?.artist || 'Artis',
      album: parsed.trackMeta?.album || 'Album',
      duration: parsed.trackMeta?.duration || 38.0,
      audioFileName: parsed.trackMeta?.audioFileName,
      videoFileName: parsed.trackMeta?.videoFileName,
      audioUrl: null,
      videoUrl: null,
      audioFile: audioBlob,
      videoFile: videoBlob,
    },
    lyrics: Array.isArray(parsed.lyrics) ? parsed.lyrics : [],
    aspectRatio: parsed.aspectRatio || '9:16',
    displayMode: parsed.displayMode || 'now_playing',
    theme: parsed.theme || 'emerald',
    showTranslation: parsed.showTranslation ?? true,
    audioBlob,
    videoBlob,
  };

  await saveProject(project);
  return project;
}
