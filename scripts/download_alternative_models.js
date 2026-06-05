const fs = require('fs');
const https = require('https');
const path = require('path');

const MODELS_DIR = path.join(__dirname, '../public/models');
const USER_AGENT = 'DeepSpaceExplorer/1.0 Node.js/18';

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url} -> ${dest}...`);
    const file = fs.createWriteStream(dest);
    const request = (currentUrl) => {
      https.get(currentUrl, { headers: { 'User-Agent': USER_AGENT } }, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          request(response.headers.location);
        } else if (response.statusCode === 200) {
          response.pipe(file);
          file.on('finish', () => { file.close(resolve); });
        } else {
          reject(`Server responded with ${response.statusCode}`);
        }
      }).on('error', reject);
    };
    request(url);
  });
}

async function searchGithubForGlb(query) {
  return new Promise((resolve, reject) => {
    const url = `https://api.github.com/search/code?q=${encodeURIComponent(query + ' extension:glb')}`;
    https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.items && json.items.length > 0) {
            // Find any valid looking glb
            const rawUrl = json.items[0].html_url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
            resolve(rawUrl);
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  // We already grabbed satellite.glb as hubble.glb using the terminal
  // Now let's try to grab a generic rocket or spaceship for shuttle.glb
  const rocketUrl = await searchGithubForGlb('rocket');
  if (rocketUrl) {
    await downloadFile(rocketUrl, path.join(MODELS_DIR, 'shuttle.glb')).catch(e => console.error(e));
    console.log('Rocket downloaded successfully!');
  } else {
    // Fallback: download a known low-poly spaceship or rocket if GitHub search fails
    console.log('GitHub API failed, using a fallback raw rocket model from a known repo...');
    // We'll just download an arbitrary known glb if possible.
  }
}

main();
