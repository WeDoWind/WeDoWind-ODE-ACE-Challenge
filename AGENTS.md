# Instructions for coding agents

This repository is a public library of community-created ACE wind-turbine displays. Help people with limited programming and Git experience. Preserve simple, dependency-free tooling unless a specific creation needs more.

## When adding a gallery entry

1. Read `CONTRIBUTING.md` and use `templates/creation.json` as the schema example.
2. Add one object to `site/data/creations.json`. Keep entries ordered by title. Use a unique lowercase hyphenated `id`.
3. Put an appropriately licensed screenshot in `site/images/creations/` and write meaningful `imageAlt` text. Do not use remote images in the gallery.
4. Include every creation's source in this repository. Use `site/creations/<id>/` for static displays or `creations/<id>/` for projects needing other tools. Each needs a README and licence. Use public HTTPS viewing and source URLs, with `sourceUrl` pointing to the source folder here. Explain reproduction, ACE attribution, and API behaviour. If live verification is unavailable, say so in the pull request.
5. For a site hosted here, use `site/creations/<id>/index.html`, relative asset paths, and a README in that folder. Pages project sites have a repository path prefix.
6. Run `node scripts/validate.mjs`. Report the result and any limitation clearly.

Do not invent API fields, energy calculations, community impact figures, or endorsements. Inspect the current [ACE API docs](https://ace-api.duckdns.org/docs) when implementing a display. Show timestamps and a clear stale or unavailable state. Never commit secrets, personal information, or assets without sharing rights.

The official challenge submission is a separate comment on WeDoWind; do not claim a gallery pull request enters the challenge.
