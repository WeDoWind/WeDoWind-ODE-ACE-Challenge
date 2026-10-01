import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const data = JSON.parse(readFileSync(resolve(root, 'site/data/creations.json'), 'utf8'));
const template = JSON.parse(readFileSync(resolve(root, 'templates/creation.json'), 'utf8'));
const optional = ['sourceUrl', 'license', 'dataUse'];
const required = Object.keys(template).filter(field => !optional.includes(field));
const errors = [];

if (!Array.isArray(data.creations)) errors.push('creations must be an array');
else {
  const ids = new Set();
  for (const [index, item] of data.creations.entries()) {
    const prefix = `creations[${index}]`;
    for (const field of required) {
      if (typeof item[field] !== 'string' || !item[field].trim()) errors.push(`${prefix}.${field} is required`);
    }
    for (const field of optional) {
      if (field in item && (typeof item[field] !== 'string' || !item[field].trim())) errors.push(`${prefix}.${field} must be a non-empty string when provided`);
    }
    if (Object.keys(item).some(field => !Object.keys(template).includes(field))) errors.push(`${prefix} has an unknown field`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id ?? '')) errors.push(`${prefix}.id must be lowercase letters, numbers and hyphens`);
    if (ids.has(item.id)) errors.push(`${prefix}.id is duplicated`);
    ids.add(item.id);
    for (const field of ['viewUrl', ...(item.sourceUrl ? ['sourceUrl'] : [])]) {
      try { if (new URL(item[field]).protocol !== 'https:') throw new Error(); }
      catch { errors.push(`${prefix}.${field} must be a public HTTPS URL`); }
    }
    if (item.sourceUrl) {
      const sourcePrefix = 'https://github.com/WeDoWind/WeDoWind-ODE-ACE-Challenge/tree/main/';
      const sourcePath = typeof item.sourceUrl === 'string' && item.sourceUrl.startsWith(sourcePrefix)
        ? item.sourceUrl.slice(sourcePrefix.length).replace(/\/$/, '') : '';
      if (![ `site/creations/${item.id}`, `creations/${item.id}` ].includes(sourcePath)) {
        errors.push(`${prefix}.sourceUrl must point to this creation's source folder in this repository`);
      } else {
        if (!existsSync(resolve(root, sourcePath, 'README.md'))) errors.push(`${prefix} source folder needs README.md`);
        if (!existsSync(resolve(root, sourcePath, 'LICENSE'))) errors.push(`${prefix} source folder needs LICENSE`);
        if (sourcePath.startsWith('site/') && !existsSync(resolve(root, sourcePath, 'index.html'))) errors.push(`${prefix} static display needs index.html`);
      }
    }
    if (!/^images\/creations\/[a-z0-9-]+\.(png|jpg|jpeg|webp)$/.test(item.image ?? '')) errors.push(`${prefix}.image must be a screenshot path in images/creations`);
    else if (!existsSync(resolve(root, 'site', item.image))) errors.push(`${prefix}.image does not exist`);
    if ((item.summary ?? '').length > 240) errors.push(`${prefix}.summary is too long (maximum 240 characters)`);
  }
  const titles = data.creations.map(item => item.title);
  if (JSON.stringify(titles) !== JSON.stringify([...titles].sort((a,b) => a.localeCompare(b)))) errors.push('creations must be sorted by title');
}

if (errors.length) { console.error(errors.map(error => `- ${error}`).join('\n')); process.exitCode = 1; }
else console.log(`Gallery valid: ${data.creations.length} creation(s).`);
