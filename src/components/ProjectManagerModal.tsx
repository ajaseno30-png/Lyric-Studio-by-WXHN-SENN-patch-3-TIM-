import React, { useState, useEffect, useRef } from 'react';
import { ProjectMetadata, ProjectData } from '../types/project';
import {
  getAllProjectSummaries,
  getProject,
  saveProject,
  deleteProject,
  duplicateProject,
  exportProjectToFile,
  importProjectFromFile
} from '../utils/projectStorage';
import { SPOTIFY_THEME_OPTIONS } from './ThemeSelectorModal';
import {
  FolderKanban,
  X,
  Plus,
  Save,
  Download,
  Upload,
  Trash2,
  Copy,
  Play,
  Clock,
  Music,
  Video,
  FileText,
  Search,
  CheckCircle,
  AlertCircle,
  Smartphone,
  Square,
  Tv,
  Check
} from 'lucide-react';

interface ProjectManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProjectId: string | null;
  onLoadProject: (project: ProjectData) => void;
  onSaveCurrentProject: (customName?: string) => Promise<void>;
  currentProjectName: string;
  hasUnsavedChanges?: boolean;
}

export const ProjectManagerModal: React.FC<ProjectManagerModalProps> = ({
  isOpen,
  onClose,
  currentProjectId,
  onLoadProject,
  onSaveCurrentProject,
  currentProjectName,
  hasUnsavedChanges = false,
}) => {
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [saveNameInput, setSaveNameInput] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadProjectList();
      setSaveNameInput(currentProjectName || 'Proyek Spotify Lirik');
      setFeedbackMessage(null);
      setConfirmDeleteId(null);
    }
  }, [isOpen, currentProjectName]);

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMessage({ text, type });
    setTimeout(() => {
      setFeedbackMessage(null);
    }, 3500);
  };

  const loadProjectList = async () => {
    setIsLoading(true);
    try {
      const list = await getAllProjectSummaries();
      setProjects(list);
    } catch (err) {
      console.error('Gagal memuat daftar proyek:', err);
      showFeedback('Gagal memuat daftar proyek', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveCurrent = async () => {
    if (!saveNameInput.trim()) {
      showFeedback('Nama proyek tidak boleh kosong', 'error');
      return;
    }
    setIsSaving(true);
    try {
      await onSaveCurrentProject(saveNameInput.trim());
      await loadProjectList();
      showFeedback(`Proyek "${saveNameInput.trim()}" berhasil disimpan!`);
    } catch (err) {
      console.error('Gagal menyimpan proyek:', err);
      showFeedback('Gagal menyimpan proyek', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoad = async (id: string) => {
    try {
      const fullProj = await getProject(id);
      if (!fullProj) {
        showFeedback('Proyek tidak ditemukan', 'error');
        return;
      }
      onLoadProject(fullProj);
      showFeedback(`Proyek "${fullProj.name}" berhasil dimuat!`);
      setTimeout(() => {
        onClose();
      }, 400);
    } catch (err) {
      console.error('Gagal memuat proyek:', err);
      showFeedback('Gagal memuat file proyek', 'error');
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const copy = await duplicateProject(id);
      await loadProjectList();
      showFeedback(`Proyek diduplikasi menjadi "${copy.name}"`);
    } catch (err) {
      console.error('Gagal duplikasi:', err);
      showFeedback('Gagal menduplikasi proyek', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProject(id);
      setConfirmDeleteId(null);
      await loadProjectList();
      showFeedback('Proyek berhasil dihapus');
    } catch (err) {
      console.error('Gagal menghapus proyek:', err);
      showFeedback('Gagal menghapus proyek', 'error');
    }
  };

  const handleExport = async (id: string) => {
    try {
      const fullProj = await getProject(id);
      if (!fullProj) return;
      await exportProjectToFile(fullProj);
      showFeedback(`File backup untuk "${fullProj.name}" telah diunduh`);
    } catch (err) {
      console.error('Gagal ekspor proyek:', err);
      showFeedback('Gagal mengunduh file backup proyek', 'error');
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importProjectFromFile(file);
      await loadProjectList();
      showFeedback(`Proyek "${imported.name}" berhasil diimpor!`);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      console.error('Gagal impor file proyek:', err);
      showFeedback('Format file proyek tidak valid atau korup', 'error');
    }
  };

  const formatRelativeTime = (timestamp: number) => {
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return 'Baru saja';
    if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} hari lalu`;
    const d = new Date(timestamp);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  };

  const filteredProjects = projects.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.trackMeta.title.toLowerCase().includes(q) ||
      p.trackMeta.artist.toLowerCase().includes(q) ||
      p.trackMeta.album.toLowerCase().includes(q)
    );
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-neutral-100">
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-800/80 flex items-center justify-between bg-neutral-950/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1db954]/20 text-[#1db954] flex items-center justify-center font-bold">
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>Daftar Proyek Anda</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 font-mono">
                  {projects.length} Tersimpan
                </span>
              </h2>
              <p className="text-xs text-neutral-400">
                Pekerjaan tersimpan aman di browser. Tinggal pilih proyek mana yang mau dilanjutkan tanpa perlu upload ulang.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alert Banner */}
        {feedbackMessage && (
          <div
            className={`px-4 py-2.5 text-xs font-medium flex items-center gap-2 border-b animate-in slide-in-from-top-2 duration-150 ${
              feedbackMessage.type === 'success'
                ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800/60'
                : 'bg-red-950/70 text-red-300 border-red-800/60'
            }`}
          >
            {feedbackMessage.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
        )}

        {/* Quick Current Project Save Bar */}
        <div className="px-5 py-3 bg-neutral-950/40 border-b border-neutral-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex-1 flex items-center gap-2">
            <span className="text-xs text-neutral-400 font-medium whitespace-nowrap">
              Proyek Aktif:
            </span>
            <input
              type="text"
              value={saveNameInput}
              onChange={(e) => setSaveNameInput(e.target.value)}
              placeholder="Beri nama proyek..."
              className="flex-1 bg-neutral-900 border border-neutral-700/80 rounded-xl px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#1db954]"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleSaveCurrent}
              disabled={isSaving}
              className="px-3.5 py-1.5 rounded-xl bg-[#1db954] hover:bg-[#1ed760] disabled:bg-neutral-800 disabled:text-neutral-500 text-black text-xs font-bold flex items-center gap-1.5 transition-colors shadow active:scale-95"
            >
              {isSaving ? (
                <div className="w-3.5 h-3.5 rounded-full border-2 border-black border-t-transparent animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{currentProjectId ? 'Simpan Perubahan' : 'Simpan Proyek Ini'}</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              title="Impor file proyek (.spotifyproj) dari komputer/HP"
              className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Impor File</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".spotifyproj,application/json"
              onChange={handleImportFile}
              className="hidden"
            />
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="px-5 py-2.5 border-b border-neutral-800/60 bg-neutral-900/50 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari berdasarkan nama proyek, judul lagu, atau artis..."
              className="w-full bg-neutral-950/80 border border-neutral-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-[#1db954]"
            />
          </div>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-xs text-neutral-400 hover:text-white px-2 py-1"
            >
              Reset
            </button>
          )}
        </div>

        {/* Project List Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-neutral-400">
              <div className="w-8 h-8 rounded-full border-2 border-[#1db954] border-t-transparent animate-spin" />
              <p className="text-xs">Memuat daftar proyek tersimpan...</p>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="py-14 flex flex-col items-center justify-center text-center px-4">
              <div className="w-12 h-12 rounded-2xl bg-neutral-800/80 border border-neutral-700/60 flex items-center justify-center text-neutral-500 mb-3">
                <FolderKanban className="w-6 h-6" />
              </div>
              {searchQuery ? (
                <>
                  <p className="text-sm font-semibold text-white">Tidak ada proyek yang cocok</p>
                  <p className="text-xs text-neutral-400 mt-1 max-w-sm">
                    Tidak ditemukan proyek dengan kata kunci &quot;{searchQuery}&quot;. Coba cari kata kunci lain.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-white">Belum Ada Proyek Tersimpan</p>
                  <p className="text-xs text-neutral-400 mt-1 max-w-sm">
                    Ketik nama pada kolom &quot;Proyek Aktif&quot; di atas lalu klik &quot;Simpan Proyek Ini&quot; agar audio, video, dan lirikmu tidak hilang.
                  </p>
                </>
              )}
            </div>
          ) : (
            filteredProjects.map((p) => {
              const themeConfig = SPOTIFY_THEME_OPTIONS.find((t) => t.id === p.theme) || SPOTIFY_THEME_OPTIONS[0];
              const isCurrent = currentProjectId === p.id;

              return (
                <div
                  key={p.id}
                  className={`group relative p-3.5 sm:p-4 rounded-xl border transition-all ${
                    isCurrent
                      ? 'bg-neutral-900/90 border-[#1db954]/50 shadow-md shadow-[#1db954]/5'
                      : 'bg-neutral-900/50 hover:bg-neutral-900 border-neutral-800/80 hover:border-neutral-700'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Left: Project Details */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Theme color indicator square */}
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-black font-bold shrink-0 shadow mt-0.5"
                        style={{ backgroundColor: themeConfig.color }}
                      >
                        <Music className="w-4 h-4 fill-black" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-white truncate max-w-[280px] sm:max-w-md">
                            {p.name}
                          </h4>
                          {isCurrent && (
                            <span className="px-2 py-0.5 rounded-full bg-[#1db954]/20 border border-[#1db954]/40 text-[#1db954] text-[10px] font-bold tracking-wider">
                              SEDANG DIBUKA
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-neutral-300 truncate mt-0.5">
                          <span className="text-neutral-100 font-medium">{p.trackMeta.title}</span>
                          <span className="text-neutral-500 mx-1.5">&bull;</span>
                          <span className="text-neutral-400">{p.trackMeta.artist}</span>
                          {p.trackMeta.album && (
                            <>
                              <span className="text-neutral-500 mx-1.5">&bull;</span>
                              <span className="text-neutral-400">{p.trackMeta.album}</span>
                            </>
                          )}
                        </p>

                        {/* Badges / Metadata chips */}
                        <div className="flex items-center gap-1.5 flex-wrap mt-2 text-[11px] text-neutral-400">
                          {/* Audio tag */}
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-neutral-800/80 border border-neutral-700/60 text-neutral-300">
                            <Music className="w-3 h-3 text-[#1db954]" />
                            <span className="max-w-[120px] truncate">
                              {p.trackMeta.audioFileName || 'Demo Lofi'}
                            </span>
                          </span>

                          {/* Video tag */}
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-neutral-800/80 border border-neutral-700/60 text-neutral-300">
                            <Video className="w-3 h-3 text-blue-400" />
                            <span className="max-w-[120px] truncate">
                              {p.trackMeta.videoFileName || 'Canvas Default'}
                            </span>
                          </span>

                          {/* Lyrics count */}
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-neutral-800/80 border border-neutral-700/60 text-neutral-300">
                            <FileText className="w-3 h-3 text-amber-400" />
                            <span>{p.lyricsCount} Baris</span>
                          </span>

                          {/* Aspect Ratio */}
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-neutral-800/80 border border-neutral-700/60 text-neutral-300">
                            {p.aspectRatio === '9:16' && <Smartphone className="w-3 h-3 text-[#1db954]" />}
                            {p.aspectRatio === '1:1' && <Square className="w-3 h-3 text-blue-400" />}
                            {p.aspectRatio === '16:9' && <Tv className="w-3 h-3 text-amber-400" />}
                            <span>{p.aspectRatio}</span>
                          </span>

                          {/* Last modified */}
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-neutral-500">
                            <Clock className="w-3 h-3" />
                            <span>{formatRelativeTime(p.updatedAt)}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                      {/* Load / Resume Button */}
                      <button
                        onClick={() => handleLoad(p.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow ${
                          isCurrent
                            ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200'
                            : 'bg-[#1db954] hover:bg-[#1ed760] text-black active:scale-95'
                        }`}
                        title="Muat & Lanjutkan Pekerjaan Proyek Ini"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>{isCurrent ? 'Muat Ulang' : 'Lanjutkan'}</span>
                      </button>

                      {/* Duplicate */}
                      <button
                        onClick={() => handleDuplicate(p.id)}
                        className="p-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors"
                        title="Duplikat Proyek Ini"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      {/* Export backup file */}
                      <button
                        onClick={() => handleExport(p.id)}
                        className="p-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors"
                        title="Unduh File Backup (.spotifyproj)"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete */}
                      {confirmDeleteId === p.id ? (
                        <div className="flex items-center gap-1 bg-red-950/80 border border-red-800 rounded-xl px-2 py-1">
                          <span className="text-[10px] text-red-300 font-semibold">Hapus?</span>
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="text-xs text-red-400 hover:text-red-200 font-bold px-1"
                          >
                            Ya
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-xs text-neutral-400 hover:text-white px-1"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(p.id)}
                          className="p-1.5 rounded-xl bg-neutral-800 hover:bg-red-950 hover:text-red-400 text-neutral-400 transition-colors"
                          title="Hapus Proyek"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-5 py-3 border-t border-neutral-800 bg-neutral-950/70 flex items-center justify-between text-xs text-neutral-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#1db954]" />
            <span>IndexedDB Browser Storage Aktif (Tanpa Batas Kuota 5MB)</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium text-xs transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
