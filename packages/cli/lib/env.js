const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SUPPORTED_VARIABLES = [
  {
    key: 'APP_SERVER',
    description: 'App Server URL (e.g., https://your-server.com)',
    validate: (value) => {
      if (!value) return { valid: false, message: 'URL cannot be empty' };
      try {
        new URL(value);
        return { valid: true };
      } catch {
        return { valid: false, message: 'Must be a valid URL' };
      }
    },
    required: true
  },
  {
    key: 'APP_SERVER_SECRET_KEY',
    description: 'Secret key for authenticating with the app server',
    validate: (value) => {
      if (!value) return { valid: false, message: 'Secret key cannot be empty' };
      return { valid: true };
    },
    required: true
  }
];

/**
 * Parse .env file content into key-value pairs
 */
function parseEnvFile(content) {
  const lines = content.split('\n');
  const env = new Map();
  const structure = []; // Preserve structure including comments and empty lines

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    
    // Check if it's a variable definition
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) {
      const key = match[1];
      const value = match[2];
      env.set(key, value);
      structure.push({ type: 'var', key, value, originalLine: line, index });
    } else {
      // Preserve comments and empty lines
      structure.push({ type: 'other', line, index });
    }
  });

  return { env, structure };
}

/**
 * Serialize env map back to .env file format, preserving structure
 */
function serializeEnvFile(structure, updatedEnv) {
  const lines = structure.map(item => {
    if (item.type === 'var') {
      const value = updatedEnv.get(item.key);
      if (value !== undefined) {
        return `${item.key}=${value}`;
      }
      return item.originalLine;
    }
    return item.line;
  });

  return lines.join('\n');
}

/**
 * Ensure .env file exists (copy from .env.sample or create from scratch)
 */
function ensureEnvFile(cwd) {
  const envPath = path.join(cwd, '.env');
  const samplePath = path.join(cwd, '.env.sample');

  if (fs.existsSync(envPath)) {
    return envPath;
  }

  console.log('.env file not found.');

  // Try to copy from .env.sample
  if (fs.existsSync(samplePath)) {
    console.log('Copying from .env.sample...');
    fs.copyFileSync(samplePath, envPath);
    console.log('✅ Created .env from .env.sample');
  } else {
    console.log('Creating new .env file from scratch...');
    // Create basic .env template
    const template = [
      '# RingCentral App Connect Configuration',
      '',
      '# App Server URL',
      'APP_SERVER=',
      '',
      '# App Server Secret Key',
      'APP_SERVER_SECRET_KEY=',
      ''
    ].join('\n');
    fs.writeFileSync(envPath, template);
    console.log('✅ Created new .env file');
  }

  return envPath;
}

/**
 * Prompt user for input
 */
function promptUser(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Display overview of all variables and their status
 */
function displayOverview(envPath) {
  console.log('\n📋 Environment Variables Status:\n');
  console.log('┌─────┬───────────────────────────┬────────────┬──────────────────────────────────┐');
  console.log('│ No. │ Variable                  │ Status     │ Current Value                    │');
  console.log('├─────┼───────────────────────────┼────────────┼──────────────────────────────────┤');
  
  SUPPORTED_VARIABLES.forEach((varConfig, index) => {
    const currentValue = getCurrentValue(envPath, varConfig.key);
    const status = currentValue ? '✅ Set' : '⚠️  Not Set';
    const displayValue = currentValue 
      ? (currentValue.length > 30 ? currentValue.substring(0, 27) + '...' : currentValue)
      : '-';
    
    const no = String(index + 1).padEnd(3);
    const key = varConfig.key.padEnd(25);
    const statusPad = status.padEnd(10);
    const valuePad = displayValue.padEnd(32);
    
    console.log(`│ ${no} │ ${key} │ ${statusPad} │ ${valuePad} │`);
  });
  
  console.log('└─────┴───────────────────────────┴────────────┴──────────────────────────────────┘\n');
}

/**
 * Prompt with validation
 */
async function promptWithValidation(varConfig, currentValue) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    const displayCurrent = currentValue ? ` [current: ${currentValue}]` : '';
    const prompt = `${varConfig.description}${displayCurrent}\nEnter value (or press Enter to skip): `;
    
    const ask = () => {
      rl.question(prompt, (answer) => {
        const trimmed = answer.trim();
        
        // Allow skip if not required or already has value
        if (trimmed === '') {
          if (varConfig.required && !currentValue) {
            console.log('⚠️  This variable is required. Please provide a value.\n');
            ask();
            return;
          }
          rl.close();
          resolve(null); // Skip
          return;
        }

        // Validate input
        if (varConfig.validate) {
          const result = varConfig.validate(trimmed);
          if (!result.valid) {
            console.log(`❌ Invalid input: ${result.message}\n`);
            ask();
            return;
          }
        }

        rl.close();
        resolve(trimmed);
      });
    };

    ask();
  });
}

/**
 * Quick setup mode - configure all unset required variables
 */
async function quickSetup(envPath) {
  console.log('🚀 Quick Setup - Configure all required variables\n');
  
  let allSet = true;
  
  for (const varConfig of SUPPORTED_VARIABLES) {
    if (!varConfig.required) continue;
    
    const currentValue = getCurrentValue(envPath, varConfig.key);
    if (currentValue) continue; // Skip already configured
    
    allSet = false;
    console.log(`\n📝 ${varConfig.key}`);
    const value = await promptWithValidation(varConfig, currentValue);
    
    if (value) {
      updateEnvVariable(envPath, varConfig.key, value);
      console.log(`✅ ${varConfig.key} saved`);
    }
  }
  
  if (allSet) {
    console.log('✅ All required variables are already configured!');
  }
  
  return !allSet;
}

/**
 * Interactive menu
 */
async function showMenu(envPath) {
  displayOverview(envPath);
  
  console.log('Options:');
  console.log('  1. Configure all unset variables (Quick Setup)');
  console.log('  2. Configure specific variable');
  console.log('  3. View all current values');
  console.log('  0. Exit\n');
  
  const answer = await promptUser('Choose an option: ');
  return parseInt(answer, 10);
}

/**
 * Configure specific variable
 */
async function configureSpecific(envPath) {
  console.log('\nSelect a variable to configure:');
  SUPPORTED_VARIABLES.forEach((varConfig, index) => {
    const currentValue = getCurrentValue(envPath, varConfig.key);
    const status = currentValue ? '✅' : '⚠️';
    console.log(`  ${index + 1}. ${status} ${varConfig.key}`);
  });
  console.log('  0. Back\n');

  const answer = await promptUser('Enter number: ');
  const choice = parseInt(answer, 10);

  if (choice === 0 || isNaN(choice)) {
    return false;
  }

  if (choice < 1 || choice > SUPPORTED_VARIABLES.length) {
    console.log('❌ Invalid selection.');
    return true;
  }

  const varConfig = SUPPORTED_VARIABLES[choice - 1];
  const currentValue = getCurrentValue(envPath, varConfig.key);
  
  console.log(`\n📝 Configuring: ${varConfig.key}\n`);
  const newValue = await promptWithValidation(varConfig, currentValue);

  if (newValue) {
    updateEnvVariable(envPath, varConfig.key, newValue);
    console.log(`\n✅ ${varConfig.key} updated successfully`);
  } else {
    console.log('\nℹ️  Skipped');
  }
  
  return true;
}

/**
 * View all current values
 */
function viewAllValues(envPath) {
  console.log('\n📄 Current Environment Variables:\n');
  
  SUPPORTED_VARIABLES.forEach((varConfig) => {
    const value = getCurrentValue(envPath, varConfig.key);
    console.log(`${varConfig.key}=${value || '(not set)'}`);
  });
  
  console.log('');
}

/**
 * Update a specific variable in .env file
 */
function updateEnvVariable(envPath, variableName, value) {
  let content = '';
  
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
  }

  const { env, structure } = parseEnvFile(content);
  
  // Update the variable
  env.set(variableName, value);

  // Check if variable exists in structure
  const existsInStructure = structure.some(item => item.type === 'var' && item.key === variableName);
  
  if (!existsInStructure) {
    // Add new variable to the end
    structure.push({ type: 'var', key: variableName, value, originalLine: `${variableName}=${value}`, index: structure.length });
  }

  // Serialize back
  const newContent = serializeEnvFile(structure, env);
  fs.writeFileSync(envPath, newContent);
}

/**
 * Get current value of a variable from .env
 */
function getCurrentValue(envPath, variableName) {
  if (!fs.existsSync(envPath)) {
    return '';
  }

  const content = fs.readFileSync(envPath, 'utf8');
  const { env } = parseEnvFile(content);
  return env.get(variableName) || '';
}

/**
 * Main env configuration function
 */
async function env(options = {}) {
  try {
    const cwd = process.cwd();
    const packageJsonPath = path.join(cwd, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      throw new Error('No package.json found in current directory. Run this in your project root.');
    }

    // Support CLI flags for non-interactive mode
    if (options.appServer || options.secretKey) {
      const envPath = ensureEnvFile(cwd);
      if (options.appServer) {
        updateEnvVariable(envPath, 'APP_SERVER', options.appServer);
        console.log('✅ APP_SERVER set');
      }
      if (options.secretKey) {
        updateEnvVariable(envPath, 'APP_SERVER_SECRET_KEY', options.secretKey);
        console.log('✅ APP_SERVER_SECRET_KEY set');
      }
      return;
    }

    // Ensure .env file exists
    const envPath = ensureEnvFile(cwd);

    // Check if this is first time setup
    const hasUnsetRequired = SUPPORTED_VARIABLES
      .filter(v => v.required)
      .some(v => !getCurrentValue(envPath, v.key));

    if (hasUnsetRequired && !options.menu) {
      // Auto-run quick setup for first time users
      const configured = await quickSetup(envPath);
      if (configured) {
        console.log('\n✨ Setup complete! Your environment is ready.\n');
      }
      return;
    }

    // Interactive menu loop
    while (true) {
      const choice = await showMenu(envPath);
      
      switch (choice) {
        case 1:
          await quickSetup(envPath);
          break;
        case 2:
          const continueConfig = await configureSpecific(envPath);
          if (!continueConfig) continue;
          break;
        case 3:
          viewAllValues(envPath);
          await promptUser('Press Enter to continue...');
          break;
        case 0:
          console.log('\n✨ Environment configuration complete.\n');
          return;
        default:
          console.log('❌ Invalid option. Please try again.\n');
      }
    }

  } catch (error) {
    throw new Error(`Failed to configure environment: ${error.message}`);
  }
}

module.exports = { env };