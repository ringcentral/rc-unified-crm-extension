const fs = require('fs');
const path = require('path');
const https = require('https');
const { createWriteStream } = require('fs');
const { pipeline } = require('stream/promises');
const { extract } = require('tar');

const TEMPLATE_REPO = 'https://github.com/ringcentral/rc-unified-crm-extension';
const TEMPLATE_BRANCH = 'main';
const TEMPLATE_PATH = 'packages/template';

async function downloadTemplate(projectName, options) {
  const projectDir = projectName || 'my-app-connect-project';
  const fullPath = path.resolve(projectDir);
  
  // Check if directory exists
  if (fs.existsSync(fullPath)) {
    if (!options.force) {
      throw new Error(`Directory ${projectDir} already exists. Use --force to overwrite.`);
    }
    console.log(`Removing existing directory: ${projectDir}`);
    fs.rmSync(fullPath, { recursive: true, force: true });
  }

  console.log(`Creating new RingCentral App Connect project: ${projectDir}`);
  
  // Create project directory
  fs.mkdirSync(fullPath, { recursive: true });
  
  // Download template from GitHub
  const archiveUrl = `${TEMPLATE_REPO}/archive/refs/heads/${TEMPLATE_BRANCH}.tar.gz`;
  const tempArchivePath = path.join(fullPath, 'template.tar.gz');
  
  console.log('Downloading template from GitHub...');
  
  try {
    // Download the archive
    await downloadFile(archiveUrl, tempArchivePath);
    
    // Extract the archive
    console.log('Extracting template files...');
    await extract({
      file: tempArchivePath,
      cwd: fullPath
    });
    
    // Move template files to project root
    const extractedDir = path.join(fullPath, `rc-unified-crm-extension-${TEMPLATE_BRANCH}`, TEMPLATE_PATH);
    const files = fs.readdirSync(extractedDir);
    
    for (const file of files) {
      const sourcePath = path.join(extractedDir, file);
      const targetPath = path.join(fullPath, file);
      
      if (fs.statSync(sourcePath).isDirectory()) {
        fs.cpSync(sourcePath, targetPath, { recursive: true });
      } else {
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
    
    // Clean up
    fs.rmSync(path.join(fullPath, `rc-unified-crm-extension-${TEMPLATE_BRANCH}`), { recursive: true, force: true });
    fs.unlinkSync(tempArchivePath);
    
    // Update package.json with project name
    const packageJsonPath = path.join(fullPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      packageJson.name = projectName || 'my-app-connect-project';
      packageJson.name = packageJson.name.replace(/\s+/g, '-');
      packageJson.version = '0.0.1';
      packageJson.description = `RingCentral App Connect project: ${projectName || 'my-app-connect-project'}`;
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    }
    
    console.log('\n✅ Project created successfully!');
    console.log('\nNext steps:');
    console.log(`  cd ${projectDir}`);
    console.log('  npm install');
    console.log('  cp .env.test .env  # Configure your environment');
    console.log('  npm run dev        # Start development server');
    console.log('\n📖 Documentation: https://ringcentral.github.io/rc-unified-crm-extension/developers/getting-started/');
    
  } catch (error) {
    // Clean up on error
    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
    throw error;
  }
}

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    
    const makeRequest = (requestUrl) => {
      https.get(requestUrl, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const location = response.headers.location;
          if (location) {
            console.log(`Following redirect to: ${location}`);
            makeRequest(location);
            return;
          }
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
          return;
        }
        
        pipeline(response, file)
          .then(() => resolve())
          .catch(reject);
      }).on('error', reject);
    };
    
    makeRequest(url);
  });
}

async function init(projectName, options) {
  try {
    await downloadTemplate(projectName, options);
  } catch (error) {
    throw new Error(`Failed to initialize project: ${error.message}`);
  }
}

module.exports = { init }; 