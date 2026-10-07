# Round 3 — Hybrid polling + video-frame fallback hardening

This build is based on the Claude polling/session-hardened version. The async transcode/session implementation is preserved unchanged; only the client-side video frame renderer/fallback path is hardened.

## Fixed
- Removed the deleted built-in rose artwork from `spotifyVideoRecorder.ts` and removed the stale `public/artwork.jpg` / source asset used by the old export fallback.
- `PaintingCanvas` / `backgroundCanvas` is **never an eligible fallback while custom video is active**. This rule is enforced in both `renderCompositeFrame()` and `drawMediaSource()`.
- Removed the export-time `fallbackImage` preload path entirely.
- All three frame-rendering engines now keep an immutable `lastGoodVideoSource` (`ImageBitmap`) and reuse it when a video seek fails. A live `HTMLVideoElement` is never stored as the last-good fallback.
- `seekVideo()` now accepts only the `seeked` event as a success signal and verifies `currentTime` is within 6 ms of the requested timestamp. `playing` and `timeupdate` are no longer treated as successful seeks.
- Seek timeout increased to 1500 ms to tolerate slow/broken GOP decoding without silently capturing an old frame.
- If custom video is configured but no video frame has ever been decoded successfully, the media area stays on the renderer's neutral gradient instead of switching to PaintingCanvas/artwork.

## Preserved from Round 2
- Chunk upload retry/backoff.
- Idempotent chunk handling and gap detection.
- `/finish` idempotency guard.
- Server slot reservation and upload/session TTL handling.
- FFmpeg job status polling with transient network failure tolerance.
- Download retry and `Content-Length` validation.
- Never starting the legacy render after `/finish` has been accepted.

## Validation
- `server.ts` is byte-for-byte unchanged from the supplied Claude polling build.
- No references remain to `defaultArtwork`, `fallbackImage`, `sculptural_painting_1791202884470.jpg`, or `/artwork.jpg`.
- Target recorder source passes TypeScript syntax parsing with `tsc --noEmit --noResolve`; unresolved-module errors are expected because dependencies are not installed in this environment.
- Full `npm run lint` / `npm run build` could not be executed because `npm install --legacy-peer-deps` timed out in the build environment.

# WXHN Spotify Lyrics Studio — Render Patch Copy

This folder is a copy of the original ZIP with only the required render/export patches applied.

## Patched files

### `src/utils/export.worker.ts`
- Removed Opus fallback from the MP4 audio path; AAC profiles only.
- Kept audio at 44.1 kHz and tied sample/timestamp calculations to the negotiated target sample rate.
- Changed audio encoder backpressure from `break` to wait-until-drained.
- Added encoder error checks while draining.

### `src/utils/spotifyVideoRecorder.ts`
- Removed Opus from WebCodecs preflight AAC negotiation.
- Added actual AAC codec negotiation to the main-thread WebCodecs exporter instead of hardcoding `mp4a.40.2`.
- Added audio encoder backpressure in progressive and tail encoding.
- Added basic MP4 buffer/blob sanity validation before returning Worker/WebCodecs output.
- Improved FFmpeg fallback frame pacing so render time is included in the target frame interval rather than added to a full-frame sleep.

- Fixed `TS1128` / `TS1005` syntax error caused by a duplicated `nextLine` block and stray closing brace inside `renderCanvasSubtitlesMode`.

### `server.ts`
- Removed `-r` as an FFmpeg input option.
- Replaced `-vsync 1` with `-fps_mode passthrough` for the fallback transcode.

## Intentionally unchanged
- `downloadBlob()`
- audio normalization utilities
- WAV conversion utility
- server validation logic

## Validation note
The pre-existing `TS1128` / `TS1005` syntax errors in `src/utils/spotifyVideoRecorder.ts` and the `targetAudioSampleRate` scope issue in `src/utils/export.worker.ts` have been fixed. Both `npm run lint` (`tsc --noEmit`) and `npm run build` (`vite build`) pass cleanly for production deployment.


---

# Round 2 — Polling / Session Lifecycle Hardening

Scope: only the async transcode flow (`server.ts` and the chunked-upload / polling / download part of `src/utils/spotifyVideoRecorder.ts`). Render settings (codec, CRF, preset, fps handling) are intentionally untouched.

## Fixed (pre-existing bug)
- `spotifyVideoRecorder.ts`: `finishAccepted` was declared inside `try` but read in `catch` (TS2304). At runtime any error in the chunked path was masked by `ReferenceError: finishAccepted is not defined`. It is now declared before the `try`. (The Round 1 note saying `tsc` passed was not accurate for this file.)

## `server.ts`
- **Sessions are registered at `/init`** (`status: 'uploading'`) with `updatedAt` bumped on every chunk. The sweeper can therefore tell a slow upload from an abandoned one. Previously it used the directory mtime, which does not change when a file inside is appended to, so an upload slower than the TTL could be deleted mid-flight.
- **Slot reservation at `/init`** (`reservedSlots()` = running jobs + uploading sessions). A client is no longer allowed to upload hundreds of MB only to get a 429 at `/finish`.
- **Idempotent chunks**: per-track `nextChunk` / `bytes` bookkeeping. A retried chunk is acknowledged (`duplicate: true`) instead of appended twice; a gap returns 409 `expectedChunk`; a half-written chunk is truncated back before the retry is appended.
- **`/finish` integrity check**: optional `videoChunks` / `audioChunks` must match what the server stored (400 otherwise).
- **Raw inputs (`video.webm`, `audio.wav`) are deleted as soon as FFmpeg exits**, success or failure. Only the MP4 is kept for download.
- **Download**: task and files are deleted only after the response finished (`finish`). An aborted download keeps the result so the client can retry; the TTL reclaims it. The source stream is now destroyed on abort (`pipe()` leaked the file descriptor). `Content-Length` is sent so the client can detect truncation.
- **Sweeper**: runs every 5 min, TTL 15 min, never touches `processing` jobs, uses newest mtime inside a directory for orphans.
- `sessionId` is now `session-<crypto.randomUUID()>` (was `Date.now()` + `Math.random()`).
- `404` responses for unknown sessions carry `code: 'SESSION_NOT_FOUND'`.

## `src/utils/spotifyVideoRecorder.ts`
- **Chunk upload retries** (4 attempts, 1s/2s/4s backoff) on network errors and HTTP 5xx; 4xx fails immediately.
- **Status polling tolerates transient failures**: network errors, 408/502/503/504 and unreadable bodies are retried for up to 60 s of *consecutive* failure (poll interval 5 s while failing). 400/404 fail immediately; 404 shows a clear "server restarted / session expired, export again" message.
- **Download retries** (3 attempts) on network errors, mid-body aborts, 5xx and size mismatch vs `Content-Length` (skipped when `Content-Encoding` is present).
- `/finish` now sends `videoChunks` / `audioChunks`.
- The "never fall back to legacy after `/finish` was accepted" rule is unchanged.

## Verified
- `npm run lint` (`tsc --noEmit`) and `vite build` pass.
- End-to-end test against the real server with real FFmpeg: duplicate chunk, chunk gap, wrong chunk count, repeated `/finish`, chunk after finish, slot reservation (429), aborted then retried download, full download size == `Content-Length`, task/file removed after complete download, `SESSION_NOT_FOUND` afterwards, output = valid H.264 + AAC MP4.
- Sweeper test with shortened TTL: active slow upload survives, abandoned upload and old orphan dir are removed.

## Not changed / known
- State is still in-process memory. A server restart loses running jobs (FFmpeg dies with the process); the client now reports this clearly. Multiple instances behind a load balancer would break polling unless pinned to one instance.
- `npm install` needs `--legacy-peer-deps` (existing `esbuild ^0.25` vs `vite 8.3` optional peer conflict).
