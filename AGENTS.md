# Instructions for coding agents

This repository is a public library of community-created ACE wind-turbine displays. Help people with limited programming and Git experience. Preserve simple, dependency-free tooling unless a specific creation needs more.

## Contributor scope, especially in forks

The normal goal is to add your own creation, not redesign or maintain the shared gallery. Keep a creation PR limited to your folder (`site/creations/<id>/` or `creations/<id>/`), your screenshot in `site/images/creations/`, and your one entry in `site/data/creations.json`. Preserve other entries and their files. Do not change the gallery homepage, shared CSS/JavaScript, workflows, scripts, instructions, branding, or other people's creations unless the user explicitly requests that maintenance work. Put your display's styling and dependencies inside its own folder.

Use a feature branch and open a PR from your fork into `WeDoWind/WeDoWind-ODE-ACE-Challenge:main`. A fork does not change the upstream viewing/source URLs required by the gallery schema; those URLs become available after upstream merge and deployment. Explain this when a preview is not yet public. Do not merge or deploy someone else's submission without an explicit request.

## When adding a gallery entry

Commit completed, validated changes at sensible milestones during repository work. Pushing is a separate action.

1. Read `CONTRIBUTING.md` and use `templates/creation.json` as the schema example.
2. Add one object to `site/data/creations.json`. Keep entries ordered by title. Use a unique lowercase hyphenated `id`.
3. Put an appropriately licensed screenshot in `site/images/creations/` and write meaningful `imageAlt` text. Do not use remote images in the gallery.
4. Source code is optional for gallery listings and may be shared separately later. Omit `sourceUrl`, `license`, and `dataUse` when not supplied; never invent them. When code is shared, include its source in this repository. Use `site/creations/<id>/` for static displays or `creations/<id>/` for projects needing other tools. Each needs a README and licence. Use public HTTPS viewing and source URLs, with `sourceUrl` pointing to the source folder here. Explain reproduction, ACE attribution, and API behaviour. If live verification is unavailable, say so in the pull request.
5. For a site hosted here, use `site/creations/<id>/index.html`, relative asset paths, and a README in that folder. Pages project sites have a repository path prefix.
6. Run `node scripts/validate.mjs`. Report the result and any limitation clearly.

Do not invent API fields, energy calculations, community impact figures, or endorsements. Inspect the current [ACE API docs](https://ace-api.duckdns.org/docs) and [OpenAPI JSON](https://ace-api.duckdns.org/openapi.json) when implementing a display. Discover sites/assets with `/v1/sites` and `/v1/sites/ace/assets`, and fields, units and recommended refresh intervals with `/v1/families`. Read [the live-data guide](docs/ace-live-data.md) and use `templates/ace-live.mjs` as an optional polling starter copied into your own creation folder. Show timestamps and a clear stale or unavailable state. Never commit secrets, personal information, or assets without sharing rights.

The official challenge submission is a separate comment on WeDoWind; do not claim a gallery pull request enters the challenge.

When sharing source code, include the [ACE dataset DOI: 10.5281/zenodo.22662372](https://doi.org/10.5281/zenodo.22662372) in each creation's README. Use citation metadata from the Zenodo record when available; do not invent authors or a dataset title. Document the live API endpoint and access date as well.

## Live API traffic and reliability

- Make at most one ACE request per second per running display, across all its endpoints and manual refresh controls. This is our contributor traffic rule, not a claim about a server-enforced quota. For slower resolutions, follow the longer recommended refresh interval. Separate visitors/tabs still create separate traffic; never promise a global one-request-per-second limit without a shared service.
- Request several needed fields in one call; use `limit=1` for a latest-value card. Fetch metadata once during setup, not on every refresh. Share one poller among all widgets. Prevent overlapping requests and ensure manual refresh cannot bypass the interval.
- Use a timeout and back off on failures. Honour HTTP 429 `Retry-After`; do not retry immediately. Prefer a completion-based polling loop to a bare `setInterval(fetch, ...)`. Stop polling when the display is hidden or closed when practical.
- Use observation timestamps, not browser fetch time, for freshness. ACE timestamps are Unix microseconds; JavaScript dates need milliseconds (`timestamp / 1000`). For instantaneous signals, check each requested field's `series_quality` and `series_observed_at`; a fresh row can contain an older signal. Do not turn null/missing readings into zero. Preserve valid zero values and distinguish unavailable data from zero generation.
- Document the chosen stale threshold, refresh interval, endpoint, access date, units and licence. Show the timestamp and stale/unavailable state; retain a last valid reading only with a clear warning. Never silently replace live data with demo values.
- Preview beneath the repository path prefix, check narrow screens and keyboard focus, test offline/stale/invalid responses as well as live responses, and update the screenshot if visible behaviour changes. Avoid adding a build system just to make a simple display.
