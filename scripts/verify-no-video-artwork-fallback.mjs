import fs from 'node:fs';

const file = 'src/utils/spotifyVideoRecorder.ts';
const source = fs.readFileSync(file, 'utf8');
const forbidden = [
  'defaultArtwork',
  'fallbackImage',
  'sculptural_painting_1791202884470.jpg',
  '/artwork.jpg',
];
const failures = forbidden.filter((token) => source.includes(token));
if (failures.length) {
  console.error('Forbidden export fallback references found:', failures.join(', '));
  process.exit(1);
}

if (!source.includes('const customVideoActive = Boolean(options.customVideoUrl || options.trackMeta.videoUrl);')) {
  throw new Error('customVideoActive guard missing');
}
if (!source.includes('else if (!customVideoActive && backgroundCanvas && backgroundCanvas.width > 0)')) {
  throw new Error('PaintingCanvas fallback guard missing');
}
if (!source.includes('currentVideoSource = lastGoodVideoSource;')) {
  throw new Error('last-good video frame fallback missing');
}
if (!source.includes("video.addEventListener('seeked', onSeeked);")) {
  throw new Error('seeked-only frame synchronization missing');
}
if (source.includes("video.addEventListener('playing', onDone)") || source.includes("video.addEventListener('timeupdate', onDone)")) {
  throw new Error('unsafe playing/timeupdate seek completion still present');
}

console.log('OK: custom video export cannot fall back to PaintingCanvas/artwork in spotifyVideoRecorder.ts');
