#!/usr/bin/env node

 

const fs = require('fs');
const path = require('path');

// Configuration of files to update
const FILES_TO_UPDATE = [
  {
    path: 'package.json',
    description: 'Package manifest'
  },
  {
    path: 'packages/core/package.json',
    description: 'Core package'
  },
  {
    path: 'src/adapters/manifest.json',
    description: 'Adapter manifest'
  },
  {
    path: 'src/adapters/testCRM/manifest.json',
    description: 'Test adapter manifest'
  }
];

/**
 * Validates if a version string follows semantic versioning format
 * @param {string} version - Version string to validate
 * @returns {boolean} - True if valid semver format
 */
function isValidVersion(version) {
  const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
  return semverRegex.test(version);
}

/**
 * Updates the version in a JSON file
 * @param {string} filePath - Path to the JSON file
 * @param {string} newVersion - New version to set
 * @param {string} description - Description of the file for logging
 * @returns {boolean} - True if update was successful
 */
function updateVersionInFile(filePath, newVersion, description) {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      return false;
    }

    // Read and parse the JSON file
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const jsonData = JSON.parse(fileContent);
    
    // Store old version for logging
    const oldVersion = jsonData.version;
    
    // Update version
    jsonData.version = newVersion;
    
    // Write back to file with proper formatting
    fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2) + '\n');
    
    console.log(`✅ ${description} (${filePath}): ${oldVersion} → ${newVersion}`);
    return true;
  } catch (error) {
    console.error(`❌ Error updating ${description} (${filePath}):`, error.message);
    return false;
  }
}

/**
 * Main function to update versions in all configured files
 */
function main() {
  const args = process.argv.slice(2);
  
  // Check if version argument is provided
  if (args.length === 0) {
    console.error('❌ Error: Version argument is required');
    console.log('');
    console.log('Usage: node updateVersion.js <new-version>');
    console.log('Example: node updateVersion.js 1.6.0');
    console.log('');
    console.log('Files that will be updated:');
    FILES_TO_UPDATE.forEach(file => {
      console.log(`  • ${file.path} (${file.description})`);
    });
    process.exit(1);
  }
  
  const newVersion = args[0];
  
  // Validate version format
  if (!isValidVersion(newVersion)) {
    console.error(`❌ Error: Invalid version format "${newVersion}"`);
    console.log('Version should follow semantic versioning (e.g., 1.2.3, 2.0.0-beta.1)');
    process.exit(1);
  }
  
  console.log(`🚀 Updating version to: ${newVersion}`);
  console.log('');
  
  let allUpdatesSuccessful = true;
  
  // Update each file
  for (const file of FILES_TO_UPDATE) {
    const success = updateVersionInFile(file.path, newVersion, file.description);
    if (!success) {
      allUpdatesSuccessful = false;
    }
  }
  
  console.log('');
  
  if (allUpdatesSuccessful) {
    console.log('🎉 All files updated successfully!');
  } else {
    console.log('❌ Some files failed to update. Please check the errors above.');
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = {
  updateVersionInFile,
  isValidVersion
};
