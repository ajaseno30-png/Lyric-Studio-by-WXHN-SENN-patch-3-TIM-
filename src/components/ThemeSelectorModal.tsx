import React from 'react';
import { Palette, X, Check } from 'lucide-react';
import { SpotifyTheme } from '../types/lyrics';

export interface ThemeOption {
  id: SpotifyTheme;
  name: string;
  color: string;
  desc: string;
  badge?: string;
}

export const SPOTIFY_THEME_OPTIONS: ThemeOption[] = [
  { id: 'emerald', name: 'Spotify Emerald', color: '#1DB954', desc: 'Hijau Spotify signature klasik' },
  { id: 'cool_gray', name: 'Abu-Abu Keren', color: '#cbd5e1', desc: 'Titanium slate minimalis & modern', badge: 'BARU' },
  { id: 'purple_orchid', name: 'Dark Purple Orchid', color: '#c084fc', desc: 'Anggrek ungu gelap sinematik', badge: 'BARU' },
  { id: 'gold_kamboja', name: 'Gold Dark Kamboja', color: '#fbbf24', desc: 'Emas kamboja gelap & hangat', badge: 'BARU' },
  { id: 'pink_sakura', name: 'Pink Blossom Sakura', color: '#f472b6', desc: 'Kelopak merah muda mekar sakura', badge: 'BARU' },
  { id: 'red_amaranth', name: 'Red Amaranth', color: '#f43f5e', desc: 'Merah amaranth ruby pekat', badge: 'BARU' },
  { id: 'green_poison', name: 'Green Poison', color: '#22c55e', desc: 'Hijau racun neon elektrik menyala', badge: 'BARU' },
  { id: 'dark_tree_brown', name: 'Dark Tree Brown', color: '#b45309', desc: 'Cokelat batang pohon & kayu rimba', badge: 'BARU' },
  { id: 'charcoal', name: 'Midnight Charcoal', color: '#a1a1aa', desc: 'Abu arang graphite gelap' },
  { id: 'midnight', name: 'Onyx Black', color: '#71717a', desc: 'Hitam malam onyx mendalam' },
  { id: 'indigo', name: 'Deep Indigo', color: '#818cf8', desc: 'Biru malam misterius' },
  { id: 'amber', name: 'Chiaroscuro Amber', color: '#d97706', desc: 'Cahaya keemasan lilin' },
];

interface ThemeSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTheme: SpotifyTheme;
  onSelectTheme: (theme: SpotifyTheme) => void;
}

export const ThemeSelectorModal: React.FC<ThemeSelectorModalProps> = ({
  isOpen,
  onClose,
  selectedTheme,
  onSelectTheme,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl p-4 sm:p-6 space-y-5 text-neutral-100 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                Aksen Warna Tema Spotify
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-300 font-mono">
                  12 Pilihan
                </span>
              </h3>
              <p className="text-xs text-neutral-400">
                Pilih aksen warna untuk player, kartu lirik, progress bar, & suasana visual
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Theme List / Grid */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 no-scrollbar">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {SPOTIFY_THEME_OPTIONS.map((th) => {
              const isSelected = selectedTheme === th.id;

              return (
                <button
                  key={th.id}
                  onClick={() => {
                    onSelectTheme(th.id);
                  }}
                  className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'border-white bg-neutral-800/90 shadow-lg scale-[1.01]'
                      : 'border-neutral-800 bg-neutral-950/70 hover:border-neutral-700 hover:bg-neutral-900/60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-5 h-5 rounded-full shadow-md shrink-0 flex items-center justify-center border border-white/20"
                      style={{ backgroundColor: th.color }}
                    >
                      {isSelected && <Check className="w-3 h-3 text-black stroke-[3]" />}
                    </div>

                    <div className="truncate">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-neutral-200'}`}>
                          {th.name}
                        </span>
                        {th.badge && (
                          <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-amber-400/20 text-amber-300 shrink-0">
                            {th.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-neutral-400 truncate">
                        {th.desc}
                      </p>
                    </div>
                  </div>

                  <div
                    className="w-2.5 h-8 rounded-full opacity-40 shrink-0"
                    style={{ backgroundColor: th.color }}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-neutral-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-400">Tema aktif:</span>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-neutral-800 text-xs font-semibold text-white">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{
                  backgroundColor:
                    SPOTIFY_THEME_OPTIONS.find((t) => t.id === selectedTheme)?.color || '#1DB954',
                }}
              />
              <span>{SPOTIFY_THEME_OPTIONS.find((t) => t.id === selectedTheme)?.name}</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-white text-black font-bold text-xs rounded-xl shadow-lg hover:bg-neutral-200 transition-transform active:scale-95"
          >
            Terapkan & Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
