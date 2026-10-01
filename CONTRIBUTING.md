# Add a creation to the library

Anyone can submit more than one creation, and teams are welcome. The gallery lists creations; the [WeDoWind Solutions comment](https://community.wedowind.ch/posts/open-data-exploration-solutions-107654528) is the separate official challenge entry.

## Option A: use a form; no Git needed

1. Create a free GitHub account if needed.
2. Open the [creation submission form](https://github.com/WeDoWind/WeDoWind-ODE-ACE-Challenge/issues/new?template=creation.yml).
3. Fill in **Title**, **Creators**, **Description**, and a public viewing **URL**, then attach a **Screenshot** (PNG, JPEG, or WebP). Use a screenshot you have permission to share, without private information.
4. A maintainer reviews the submission and approves its gallery listing. No source code, source folder, licence file, or technical documentation is required to be listed.
5. Post your URL, description, and screenshot in the official WeDoWind Solutions task to enter the challenge.

You can share code separately later if you want others to run or adapt your creation. Never upload API keys or private information.

## Maintainers: approve a submission

1. Check the submission, public viewing URL, and screenshot sharing rights. The issue must use the headings **Title**, **Creators**, **Description**, **URL**, and **Screenshot**. Description must be at most 240 characters; URL must use HTTPS. The screenshot must be uploaded to GitHub and be a PNG, JPEG, or WebP of at most 10 MB. Add these headings to older submissions if needed.
2. Open **Actions → Approve creation → Run workflow** and choose **main**.
3. Enter the issue number and a meaningful screenshot description for alt text. Tick the confirmation checkbox and run it. The ID is generated automatically as `issue-<number>`.
4. The workflow reads the issue, saves the screenshot locally, adds the listing in title order, validates it, and opens a pull request. Review and merge it to publish through GitHub Pages. Merging closes the submission issue. Required pull-request checks may still need approval or a manual run; the approval workflow also validates the listing itself.

One-time setup: in **Settings → Actions → General → Workflow permissions**, enable **Allow GitHub Actions to create and approve pull requests**. Organisation policy may control this setting. No personal access token is needed. GitHub Pages must be configured as described in the README. The workflow must be pushed to the default branch before it appears in Actions.

If a run fails, check its log. Invalid fields and existing listings stop the import. An existing `gallery/issue-<number>` branch stops duplicate pull requests: use the existing pull request, or delete the unmerged branch before retrying. No submitted code is executed.

## Option B: edit on GitHub

1. Open [`site/data/creations.json`](site/data/creations.json) and select the pencil icon. Fork the repository if GitHub prompts you.
2. Copy [`templates/creation.json`](templates/creation.json) into the `creations` array. Replace the placeholders, choose a unique lowercase hyphenated ID, and keep entries ordered by title. `sourceUrl`, `license`, and `dataUse` are optional: omit them when not supplied.
3. Upload your screenshot to `site/images/creations/`. Set `image` to its relative path and write meaningful `imageAlt` text.
4. If sharing code, follow the source instructions below.
5. Select **Propose changes**, then **Create pull request**. Explain your checks and any live verification limitations.

## Option C: use Git or an AI agent

Fork and clone the repository, make a branch, add your entry and screenshot, run `node scripts/validate.mjs`, push, and open a pull request into `main`. Source code is optional. AI agents should read [`AGENTS.md`](AGENTS.md). The gallery has no package dependencies.

## Sharing code separately

Use `site/creations/<id>/index.html` for static displays, with relative assets so repository-prefixed Pages URLs work. Use `creations/<id>/` for projects needing other tools. Include `README.md` and `LICENSE` with setup, reproduction instructions, ACE attribution, live API endpoints and access date, refresh interval, and stale or unavailable behaviour. Mention server, hardware, credential, or paid-service requirements.

Use the existing gallery ID when adding code later. Add `sourceUrl` pointing to that folder in this repository, for example `https://github.com/WeDoWind/WeDoWind-ODE-ACE-Challenge/tree/main/site/creations/issue-12`. Add the actual `license` and `dataUse` details when known. Each creation keeps its stated licence.

## Cite the ACE dataset

Credit ACE in displays. When sharing source code, include the [ACE dataset DOI: 10.5281/zenodo.22662372](https://doi.org/10.5281/zenodo.22662372) in its README and cite it in works using the data. Use the citation metadata on Zenodo rather than inventing authors or a title. Document live API endpoints and access dates. ACE data is shared under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## Review checklist

- The viewing URL works without a login.
- The title, creators, and description accurately describe the creation.
- The screenshot matches the display, has useful alt text, and can be shared publicly.
- If code is shared, its folder includes a README, licence, reproduction instructions, and ACE citation; live displays explain stale or unavailable data.
- `node scripts/validate.mjs` passes.

Maintainers review completeness and safety, not challenge judging. Challenge criteria and winner selection live on WeDoWind.
