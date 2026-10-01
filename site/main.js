const gallery = document.querySelector('#gallery');
const count = document.querySelector('#count');

function link(href, label) {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.textContent = label;
  if (/^https?:/.test(href)) {
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
  }
  return anchor;
}

function renderCreation(item) {
  const card = document.createElement('article');
  card.className = 'card';
  const image = document.createElement('img');
  image.src = item.image;
  image.alt = item.imageAlt;
  image.loading = 'lazy';
  card.append(image);
  const body = document.createElement('div');
  body.className = 'card-body';
  const heading = document.createElement('h3');
  heading.textContent = item.title;
  const byline = document.createElement('p');
  byline.className = 'byline';
  byline.textContent = `By ${item.creator} · ${item.license}`;
  const summary = document.createElement('p');
  summary.textContent = item.summary;
  const data = document.createElement('p');
  data.className = 'data-use';
  data.textContent = item.dataUse;
  const links = document.createElement('div');
  links.className = 'card-links';
  links.append(link(item.viewUrl, 'View display ↗'), link(item.sourceUrl, 'Source & setup ↗'));
  body.append(heading, byline, summary, data, links);
  card.append(body);
  return card;
}

fetch('data/creations.json')
  .then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then(({ creations }) => {
    gallery.replaceChildren();
    count.textContent = `${creations.length} ${creations.length === 1 ? 'creation' : 'creations'}`;
    if (creations.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      const title = document.createElement('h3');
      title.textContent = 'The first space is yours.';
      const copy = document.createElement('p');
      copy.textContent = 'The gallery is ready for its first creation. Make a display, share a screenshot and source, and help the next person build on your idea.';
      empty.append(title, copy, link('https://github.com/charlieplumley/WeDoWind-ODE-ACE-Challenge/issues/new?template=creation.yml', 'Add your creation ↗'));
      gallery.append(empty);
      return;
    }
    creations.forEach(item => gallery.append(renderCreation(item)));
  })
  .catch(() => {
    gallery.replaceChildren();
    const message = document.createElement('p');
    message.textContent = 'The library could not load right now. Please try refreshing the page.';
    gallery.append(message);
  });
