# Add a creation to the library

Thank you for sharing your work. Anyone can submit more than one creation, and teams are welcome. The gallery is a directory of projects; the [WeDoWind Solutions comment](https://community.wedowind.ch/posts/open-data-exploration-solutions-107654528) is the official challenge entry.

## Before you start

Have these ready:

- A short, plain-language title and description (what will visitors see or learn?).
- A public URL where the display can be viewed, plus a public source-code URL.
- A screenshot (PNG, JPEG, or WebP), with no private information.
- The open licence for your creation and instructions to run or adapt it.
- The ACE API endpoint(s) used, update interval, and what the display shows if data is unavailable.

If your display needs a server, special hardware, credentials, or a paid service, mention that in its own README. Never commit API keys or personal data.

## Option A: use a form; no Git needed

1. Create a free GitHub account if you do not have one.
2. Open the [creation submission form](../../issues/new?template=creation.yml).
3. Fill in every field and attach your screenshot to the issue. Submit it.
4. A maintainer will check the links, licence, and screenshot, then add the gallery entry. They may ask a question in the issue.
5. Post your URL, description, and screenshot in the [official WeDoWind Solutions task](https://community.wedowind.ch/posts/open-data-exploration-solutions-107654528).

## Option B: edit on GitHub

1. Open [`site/data/creations.json`](site/data/creations.json) and select the pencil icon. GitHub may prompt you to fork this repository; accept.
2. Copy the object in [`templates/creation.json`](templates/creation.json) into the `creations` array. Add a comma between entries. Replace every placeholder. Choose a short lowercase `id` containing only letters, numbers, and hyphens; it must be unique.
3. Put your screenshot in `site/images/creations/` using **Add file → Upload files**. Set `image` to a path such as `images/creations/my-display.png`. Write useful `imageAlt` text describing the picture.
4. For a display that can run as plain HTML, CSS, and JavaScript, you may also add `site/creations/<your-id>/index.html`. Its viewing URL will be `https://<owner>.github.io/<repo>/creations/<your-id>/`. For other apps, link to wherever you host them.
5. Select **Propose changes** and then **Create pull request**. Explain how you tested the display and provide your WeDoWind entry link if available.

The gallery entry points to your own project and licence. If you host a display here, add a README beside it with setup, data attribution, and licence details.

## Option C: use Git or an AI agent

Fork the repository, make a branch, add your entry and screenshot, run `node scripts/validate.mjs`, then open a pull request. There are no package dependencies. An AI assistant should read [`AGENTS.md`](AGENTS.md) first and follow the same checks. You can give it this prompt:

> Read AGENTS.md and CONTRIBUTING.md. Add my ACE display to the gallery using the details and files I provide. Make a unique entry, add a screenshot with alt text, run the validator, and prepare a pull request. Ask me only for missing URLs, licence, or screenshot.

## Review checklist

- The display uses live ACE data and explains stale or unavailable data.
- People without wind-energy expertise can understand it on a screen.
- The viewing and source URLs work without a login.
- The screenshot matches the display and has useful alt text.
- Licence and ACE data attribution are clear.
- Reproduction instructions are available in the linked source repository or the hosted creation folder.
- `node scripts/validate.mjs` passes.

Maintainers review entries for basic completeness and safety, not challenge judging. Please keep feedback constructive. The challenge criteria and winner selection live on WeDoWind.
