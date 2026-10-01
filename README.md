# ACE public communication display — community creations

A shared library of screen-friendly ideas for [WeDoWind's Open Data Exploration Challenge 5](https://community.wedowind.ch/posts/open-data-exploration-challenge-5-ace-public-communication-display). The challenge is to help people in Lawrence Weston understand what the community-owned ACE wind turbine is doing and the value it creates.

**[Browse the creations on GitHub Pages](https://charlieplumley.github.io/WeDoWind-ODE-ACE-Challenge/)** · [Submit a creation](CONTRIBUTING.md) · [Challenge discussion and official entry](https://community.wedowind.ch/posts/open-data-exploration-solutions-107654528)

> The Pages address above assumes this repository will be published under `charlieplumley`. If a different account or repository name is used, replace the link after publishing.

## The essentials

Your display should use [live ACE API data](https://ace-api.duckdns.org/docs), work on a screen, make sense to a non-technical audience, and be shared under an open licence with reproduction instructions. The [existing dashboard](https://ace-api.duckdns.org/dashboard/) and [historical data](https://doi.org/10.5281/zenodo.22662372) may help you explore ideas. Credit ACE for turbine data under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

You can create a dashboard, artwork, interactive display, digital twin, or something else. Technical complexity is not a judging criterion. Build for a community centre screen that may run for hours with little supervision. Explain what happens when the API is delayed or unavailable.

**Official entry:** Add a comment to the [WeDoWind Solutions task](https://community.wedowind.ch/posts/open-data-exploration-solutions-107654528) with a viewing URL, short description, and screenshot. Adding a project here makes it easier for others to find and learn from, but does not replace that comment. The final presentation and vote are on **28 October 2026**.

## How to add your creation

Choose the route that feels easiest:

1. **No Git experience:** Open a [new submission issue](../../issues/new?template=creation.yml) and fill in the form. A maintainer can add it to the gallery. You still need to post your official WeDoWind comment.
2. **GitHub web editor:** Follow the [step-by-step contribution guide](CONTRIBUTING.md#option-b-edit-on-github). GitHub will create a pull request for review.
3. **Git or an AI coding agent:** Give it [AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md), then ask it to prepare a pull request. It can use the [entry template](templates/creation.json).

You can link to a display hosted elsewhere, or put a static website in `site/creations/<slug>/`. Other kinds of project can live in their own repository and be linked from the gallery. Each gallery entry needs a screenshot, viewing URL, source URL, licence, brief description, and a note on its live ACE data use.

## Repository map

| Path | Purpose |
| --- | --- |
| [`site/`](site/) | GitHub Pages gallery and optional hosted displays |
| [`site/data/creations.json`](site/data/creations.json) | Gallery entries |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Human-friendly submission steps |
| [`AGENTS.md`](AGENTS.md) | Instructions for AI coding agents |
| [`templates/`](templates/) | Copyable entry and display starter |

## Publish the gallery

After this folder is pushed to a **public** GitHub repository, open **Settings → Pages**. Under **Build and deployment**, choose **GitHub Actions**. The included workflow publishes `site/` on pushes to `main`. The resulting URL appears in the workflow's deployment summary and under Settings → Pages. Update the gallery link at the top of this README if the account or repository name differs. [GitHub's Pages setup guide](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) has screenshots and current settings.

The gallery is a static site with no build tool or service account. It does not proxy the ACE API. Hosted creations call ACE directly from visitors' browsers, so their authors should test browser access and provide a clear offline state.

## Licences and credit

Repository gallery code is [MIT licensed](LICENSE). Repository text and gallery metadata are [CC BY 4.0](LICENSE-DOCS.md). Each creation keeps the licence stated by its author; listing a project here does not relicense it. ACE turbine data is provided under CC BY 4.0; include attribution in your display and project documentation. Screenshots and other third-party assets must have permission for public sharing.
