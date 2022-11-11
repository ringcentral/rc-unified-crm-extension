#! /usr/bin/env node
const commander = require('commander');
const program = new commander.Command();
const { version } = require('../package.json');
const { release } = require('./release')
const inquirer = require('inquirer');

program.version(version).description('RingCentral Unified CRM Extension');

program
    .command('release')
    .alias('r')
    .description('create a new release')
    .action(() => {
        inquirer
            .prompt([
                {
                    type: 'list',
                    name: 'releaseType',
                    message: 'Choose a release type:',
                    choices: [
                        'major',
                        'minor',
                        'patch'
                    ],
                },
                {
                    type: 'input',
                    name: 'commit',
                    message: 'Enter commit description:',
                    default: ''
                },
            ])
            .then((answers) => {
                release(answers);
            })
    });

program.parse(process.argv);