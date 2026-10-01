import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function parseIssue(body) {
  const fields = {};
  for (const match of body.matchAll(/^### (Title|Creators|Description|URL|Screenshot)\r?\n+([\s\S]*?)(?=^### |$(?![\s\S]))/gm)) {
    if (fields[match[1]]) throw new Error(`Duplicate field: ${match[1]}`);
    fields[match[1]] = match[2].trim();
  }
  for (const label of ['Title', 'Creators', 'Description', 'URL', 'Screenshot']) {
    if (!fields[label] || fields[label] === '_No response_') throw new Error(`Missing ${label}; edit the issue to use the five-field form.`);
  }
  if (fields.Description.length > 240) throw new Error('Shorten the issue Description to 240 characters or fewer.');
  const viewing = new URL(fields.URL);
  if (viewing.protocol !== 'https:' || viewing.username || viewing.password) throw new Error('URL must be public HTTPS.');
  const screenshot = fields.Screenshot.match(/!\[[^\]]*\]\((https:\/\/[^\s)]+)\)/)?.[1]
    ?? fields.Screenshot.match(/<img\b[^>]*\bsrc="(https:\/\/[^"\s]+)"[^>]*>/)?.[1];
  if (!screenshot) throw new Error('Attach one screenshot to the issue using GitHub.');
  const image = new URL(screenshot);
  if (image.username || image.password || !(
    (image.hostname === 'github.com' && image.pathname.startsWith('/user-attachments/assets/')) ||
    image.hostname === 'user-images.githubusercontent.com'
  )) throw new Error('Screenshot must be a GitHub-hosted image attachment.');
  return { title: fields.Title, creator: fields.Creators, summary: fields.Description, viewUrl: viewing.href, screenshot };
}

export function imageExtension(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'webp';
  throw new Error('Screenshot must be PNG, JPEG, or WebP.');
}

async function main() {
  const root = resolve(import.meta.dirname, '..');
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const input = event.inputs;
  if (input.approved !== 'true') throw new Error('Tick the approval checkbox after completing the review.');
  if (!/^[1-9]\d*$/.test(input.issue)) throw new Error('Issue number must be a positive integer.');
  const id = `issue-${input.issue}`;
  if (!input.image_alt?.trim()) throw new Error('Describe the screenshot for alt text.');
  const dataPath = resolve(root, 'site/data/creations.json');
  const data = JSON.parse(readFileSync(dataPath, 'utf8'));
  if (data.creations.some(item => item.id === id)) throw new Error('That creation ID is already listed.');
  const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/issues/${input.issue}`, {
    headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Cannot read issue: HTTP ${response.status}`);
  const issue = await response.json();
  if (issue.pull_request || issue.state !== 'open') throw new Error('Choose an open submission issue, not a pull request.');
  const { screenshot, ...fields } = parseIssue(issue.body ?? '');
  const downloaded = await fetch(screenshot, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!downloaded.ok) throw new Error(`Cannot download screenshot: HTTP ${downloaded.status}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of downloaded.body) {
    size += chunk.length;
    if (size > 10 * 1024 * 1024) throw new Error('Screenshot exceeds 10 MB.');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  const image = `images/creations/${id}.${imageExtension(bytes)}`;
  mkdirSync(resolve(root, 'site/images/creations'), { recursive: true });
  writeFileSync(resolve(root, 'site', image), bytes);
  data.creations.push({ id, ...fields, image, imageAlt: input.image_alt.trim() });
  data.creations.sort((a, b) => a.title.localeCompare(b.title));
  writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`);
  writeFileSync(resolve(root, 'submission-pr.md'), `Adds the reviewed creation from #${input.issue}.\n\nThe approval workflow imported the issue details and screenshot and ran the gallery validator. Review the listing before merging. The maintainer checked the viewing URL and screenshot sharing rights. Source code is optional and can be shared separately later.\n\nCloses #${input.issue}.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
