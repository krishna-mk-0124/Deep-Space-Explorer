const fs = require('fs');
const https = require('https');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '../public');
const MODELS_DIR = path.join(PUBLIC_DIR, 'models');
const TEXTURES_DIR = path.join(PUBLIC_DIR, 'textures');

if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });
if (!fs.existsSync(TEXTURES_DIR)) fs.mkdirSync(TEXTURES_DIR, { recursive: true });

// Wikimedia requires a descriptive user agent
const USER_AGENT = 'DeepSpaceExplorer/1.0 (krishna0124@gmail.com) Node.js/18';

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
          file.on('finish', () => {
            file.close(resolve);
          });
        } else {
          fs.unlink(dest, () => reject(`Server responded with ${response.statusCode}: ${response.statusMessage}`));
        }
      }).on('error', (err) => {
        fs.unlink(dest, () => reject(err.message));
      });
    };
    request(url);
  });
}

async function searchGithubForGlb(query, filenameRegex) {
  return new Promise((resolve, reject) => {
    const url = `https://api.github.com/search/code?q=${encodeURIComponent(query + ' extension:glb')}`;
    console.log(`Searching GitHub API: ${url}`);
    https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.items && json.items.length > 0) {
            let item = json.items.find(i => filenameRegex.test(i.name)) || json.items[0];
            const rawUrl = item.html_url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
            resolve(rawUrl);
          } else {
            resolve(null);
          }
        } catch (e) {
          console.error("GitHub search error:", data);
          resolve(null); // Resolve null rather than reject so we don't crash the whole script
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  try {
    // 1. Earth Textures
    await downloadFile(
      'https://upload.wikimedia.org/wikipedia/commons/8/83/Equirectangular_projection_SW.jpg',
      path.join(TEXTURES_DIR, 'earth_8k.jpg')
    ).catch(e => console.error("Earth diffuse error:", e));
    
    await downloadFile(
      'https://upload.wikimedia.org/wikipedia/commons/1/16/Appearance_of_sky_for_simulated_observer_in_Earth_orbit_with_clouds.jpg',
      path.join(TEXTURES_DIR, 'earth_clouds.jpg')
    ).catch(e => console.error("Earth clouds error:", e));
    
    // 3. Search and download Space Shuttle GLB
    const shuttleUrl = await searchGithubForGlb('space shuttle', /shuttle/i);
    if (shuttleUrl) {
      await downloadFile(shuttleUrl, path.join(MODELS_DIR, 'shuttle.glb')).catch(e => console.error(e));
    } else {
      console.log('Could not find Space Shuttle GLB on GitHub.');
    }
    
    // 4. Search and download Hubble GLB
    const hubbleUrl = await searchGithubForGlb('hubble telescope', /hubble/i);
    if (hubbleUrl) {
      await downloadFile(hubbleUrl, path.join(MODELS_DIR, 'hubble.glb')).catch(e => console.error(e));
    } else {
      console.log('Could not find Hubble GLB on GitHub.');
    }

    console.log('Asset download phase complete!');
  } catch (err) {
    console.error('Fatal error in main:', err);
  }
}

main();
