#!/usr/bin/env node

const { Command } = require('commander');
const { init } = require('../lib/init');
const { upgrade } = require('../lib/upgrade');
const { start } = require('../lib/start');
const { env } = require('../lib/env');

const program = new Command();

program
  .name('appconnect')
  .description('CLI for RingCentral App Connect')
  .version(require('../../package.json').version);

program
  .command('init')
  .description('Initialize a new RingCentral App Connect project')
  .argument('[project-name]', 'Name of the project directory')
  .option('-t, --template <template>', 'Template to use: default or plugin (default: default)', 'default')
  .option('-f, --force', 'Force overwrite if directory exists')
  .option('--no-install', 'Skip installing dependencies')
  .option('--id <unique-identifier>', 'Connector Unique Identifier from the Developer Console (prompted if omitted)')
  .option('--no-env', 'Skip copying .env.test to .env')
  .option('-s, --start', 'Automatically start the dev server after init')
  .option('-b, --beta', 'Init with beta template')
  .action(async (projectName, options) => {
    try {
      await init(projectName, options);
    } catch (error) {
      console.error('Error initializing project:', error.message);
      process.exit(1);
    }
  });

program
  .command('upgrade')
  .description('Upgrade @app-connect/core to latest in current project')
  .option('-D, --dev', 'Install as devDependency')
  .action(async (options) => {
    try {
      await upgrade(options);
    } catch (error) {
      console.error('Error upgrading @app-connect/core:', error.message);
      process.exit(1);
    }
  });

program
  .command('start')
  .description('Start dev server, optionally on a specific port')
  .argument('[port]', 'Port number')
  .action(async (port) => {
    try {
      await start(port);
    } catch (error) {
      console.error('Error starting dev server:', error.message);
      process.exit(1);
    }
  });

program
  .command('env')
  .description('Configure the environment variables (connector: APP_SERVER + secret key; plugin: plugin secret key)')
  .option('--app-server <url>', 'Connector server URL (connector projects)')
  .option('--secret-key <key>', 'Secret key from the Developer Console')
  .action(async (options) => {
    try {
      await env(options);
    } catch (error) {
      console.error('Error configuring CLI:', error.message);
      process.exit(1);
    }
  });

program.parse();


