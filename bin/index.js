#! /usr/bin/env node
import { Command } from 'commander';
import packageJson from '../package.json' assert { type: "json" };
import { release } from './release.js';
import inquirer from 'inquirer';

const program = new Command();

program.version(packageJson.version).description('RingCentral App Connect');

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