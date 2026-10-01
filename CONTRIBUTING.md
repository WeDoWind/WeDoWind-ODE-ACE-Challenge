# Add a creation to the library

Thank you for sharing your work. Anyone can submit more than one creation, and teams are welcome. The gallery is a directory of projects; the [WeDoWind Solutions comment](https://community.wedowind.ch/posts/open-data-exploration-solutions-107654528) is the official challenge entry.

## Before you start

Have these ready:

- A short, plain-language title and description (what will visitors see or learn?).
- A public viewing URL and all source files to include in this repository.
- A screenshot (PNG, JPEG, or WebP), with no private information.
- The open licence for your creation and instructions to run or adapt it.
- The ACE API endpoint(s) used, update interval, and what the display shows if data is unavailable.

If your display needs a server, special hardware, credentials, or a paid service, mention that in its own README. Never commit API keys or personal data.

## Cite the ACE dataset

Link to the [ACE dataset on Zenodo (DOI: 10.5281/zenodo.22662372)](https://doi.org/10.5281/zenodo.22662372) in your project README and cite it in works using the dataset. Use the citation provided on the Zenodo record, or its citation export. Credit ACE in the display and document your live API endpoint and access date. The data is shared under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## Option A: use a form; no Git needed

1. Create a free GitHub account if you do not have one.
2. Open the [creation submission form](https://github.com/WeDoWind/WeDoWind-ODE-ACE-Challenge/issues/new?template=creation.yml).
3. Fill in every field and attach your screenshot and project ZIP, or link to downloadable project files. Submit it.
4. A maintainer will check the files, licence, and screenshot, then add the source and gallery entry to this repository. They may ask a question in the issue.
5. Post your URL, description, and screenshot in the [official WeDoWind Solutions task](https://community.wedowind.ch/posts/open-data-exploration-solutions-107654528).

## Option B: edit on GitHub

1. Open [`site/data/creations.json`](site/data/creations.json) and select the pencil icon. GitHub may prompt you to fork this repository; accept.
2. Copy the object in [`templates/creation.json`](templates/creation.json) into the `creations` array. Add a comma between entries. Replace every placeholder. Choose a short lowercase `id` containing only letters, numbers, and hyphens; it must be unique.
3. Put your screenshot in `site/images/creations/` using **Add file → Upload files**. Set `image` to a path such as `images/creations/my-display.png`. Write useful `imageAlt` text describing the picture.
4. Add all source files. For plain HTML, CSS, and JavaScript, use `site/creations/<your-id>/index.html`. Its viewing URL will be `https://wedowind.github.io/WeDoWind-ODE-ACE-Challenge/creations/<your-id>/`. Projects needing a server or other tools go in `creations/<your-id>/` and may link to a running copy elsewhere.
5. Select **Propose changes** and then **Create pull request**. Explain how you tested the display and provide your WeDoWind entry link if available.

Add `README.md` and `LICENSE` in your source folder. Explain setup, data attribution, API behaviour, and how to reproduce the display. Set `sourceUrl` to that folder in this repository, for example `https://github.com/WeDoWind/WeDoWind-ODE-ACE-Challenge/tree/main/site/creations/my-display`. Each creation retains its stated licence.

## Option C: use Git or an AI agent

Fork the repository, clone your fork, make a branch, add your source folder, entry and screenshot, run `node scripts/validate.mjs`, then push to your fork and open a pull request into this repository's `main` branch. A maintainer reviews and merges it; the gallery then updates automatically. The gallery has no package dependencies. An AI assistant should read [`AGENTS.md`](AGENTS.md) first and follow the same checks. You can give it this prompt:

> Read AGENTS.md and CONTRIBUTING.md. Add my ACE display source and gallery entry using the details and files I provide. Add a screenshot with alt text, run the validator, and prepare a pull request from my fork. Ask me only for missing files, viewing URL, licence, or screenshot.

## Review checklist

- The display uses live ACE data and explains stale or unavailable data.
- People without wind-energy expertise can understand it on a screen.
- The viewing URL works without a login and all source is included in this repository.
- The screenshot matches the display and has useful alt text.
- Licence and ACE data attribution are clear.
- Reproduction instructions are included in the creation source folder here.
- `node scripts/validate.mjs` passes.

Maintainers review entries for basic completeness and safety, not challenge judging. Please keep feedback constructive. The challenge criteria and winner selection live on WeDoWind.
