# BuildZn Instagram workflow

Separate commands preserve the existing Finance Bending / YouTube pipeline. BuildZn never imports Gemini, ElevenLabs, YouTube, LinkedIn, Discord or the unofficial Instagram client. It uses local speech and FFmpeg; there is no paid fallback, external upload, scheduled daemon, or unattended posting.

## Generate and review

Requirements: Node 22, FFmpeg/ffprobe with drawtext, installed TTF font, macOS speech (Samantha by default) or Linux espeak-ng. Existing npm dependencies suffice. No new subscription or API key is required to generate.

```
npm run buildzn:generate
```

Outputs remain in `tmp/buildzn-review`: a playable 1080x1920 H.264/AAC reel, captioned scenes, SRT, script, actual synthetic lead workflow result, and `review.json` with media/caption hashes. This is a deterministic local demo, not a live AI lead integration or client case study. Narration is synthesized locally. SRT and on-screen scene captions are timed to each individually synthesized scene; word alignment is not claimed.

Review the MP4 and caption, then explicitly approve:

```
node src/buildzn_index.js approve tmp/buildzn-review --approve
```

## Publishing readiness

```
npm run buildzn:readiness
```

Uses existing `INSTAGRAM_GRAPH_TOKEN` and `INSTAGRAM_GRAPH_USER_ID` in ignored `.env`. Read-only identity check, no container creation or posting. Error 190 means the token is invalid or expired; refresh through the Meta app. This path supports Instagram Login tokens at graph.instagram.com. Facebook Login tokens use a different host and permissions and are not silently substituted. Set `INSTAGRAM_API_VERSION` to a supported version for your app; compatibility default is v21.0.

Required: professional Instagram account, Instagram Login Meta app, `instagram_business_basic` and `instagram_business_content_publish` permissions, valid scoped token, correct user ID and approved publicly reachable HTTPS MP4. Identity check alone does not prove publishing permission. Confirm scopes in Meta app before publishing.

No automatic third-party CDN upload: it exposes media publicly and transient/deleting URLs are unreliable. Manually provide a reviewed persistent free HTTPS media URL via `BUILDZN_APPROVED_VIDEO_URL`. Ensure it serves the exact approved video. No hosting purchase is required or enabled by this code.

Only after human approval:

```
node src/buildzn_index.js publish tmp/buildzn-review --approve
```

This creates a Reel container, polls processing with a bounded timeout, publishes once, and fetches its real permalink. No password/private API fallback. A receipt blocks duplicate attempts after publish starts; reconcile uncertain outcomes with Instagram before retrying. Do not delete a receipt just to retry.

## Free-only policy

BuildZn generation is entirely local, $0 API consumption. The existing Gemini/ElevenLabs keys are not used by this path. Do not assume a Gemini key is free: billing and rate limits depend on its project and must be inspected in AI Studio. No generic fixed free quotas are asserted. Free generation keeps working even when third-party quotas are exhausted because none are needed here. Existing Finance Bending scheduled workflow and its provider choices were preserved; it is not certified free-only by this repair.

Official references:
- https://www.postman.com/meta/workspace/instagram/documentation/23987686-9386f468-7714-490f-9bfc-9442db5c8f00
- https://ai.google.dev/gemini-api/docs/billing
- https://ai.google.dev/gemini-api/docs/rate-limits

## Tests

`npm run buildzn:test`: actual sample extraction, approval/tamper rejection before network, mocked official API processing/publish/permalink, failed processing, duplicate prevention. These API contract tests use mocks, not live posts. Real account readiness is tested separately. Nothing was posted during repair.
