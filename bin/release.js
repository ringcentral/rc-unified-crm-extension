#! /usr/bin/env node
import simpleGit from 'simple-git';
import packageJson from '../package.json' assert { type: "json" };
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Octokit } from "@octokit/rest";
const git = simpleGit();

const __filename = fileURLToPath(import.meta.url);
// 👇️ "/home/john/Desktop/javascript"
const __dirname = path.dirname(__filename);

export async function release({
    releaseType,
    commit
}) {
    try {
        console.log('doing release...');
        console.log('fetching for changes...');
        const fetchResponse = await git.fetch();

        if (fetchResponse.remote) {
            console.warn('New changes are fetched from the remote. Please pull the latest changes.');
            return;
        }

        console.log('no change from remote, proceed releasing...');

        console.log(`current version: ${packageJson.version}`);
        const versionNumbers = packageJson.version.split('.');
        let major = versionNumbers[0];
        let minor = versionNumbers[1];
        let patch = versionNumbers[2];
        if (releaseType === "major") {
            major = Number(major) + 1;
            minor = 0;
            patch = 0;
        }
        else if (releaseType === "minor") {
            minor = Number(minor) + 1;
            patch = 0;
        }
        else if (releaseType === "patch") {
            patch = Number(patch) + 1;
        }
        const newVersionNumber = `${major}.${minor}.${patch}`;
        const versionTag = `${newVersionNumber}`;
        packageJson.version = newVersionNumber;
        console.log(`new version: ${newVersionNumber}`);
        await fs.writeFile(path.resolve(__dirname, '../package.json'), JSON.stringify(packageJson, null, 4));
        console.log('package.json version updated.');
        await git.add('*').commit(commit).push().addTag(versionTag);
        await git.push('gitlab-repo', '--tags');
        console.log(`git pushed with tag: ${versionTag}`);

        const octokit = new Octokit({
            auth: process.env.GITHUB_TOKEN
        });

        await octokit.rest.repos.createRelease({
            owner: 'ringcentral',
            repo: packageJson.name,
            tag_name: versionTag,
            name: versionTag,
            body: commit
        });
    }
    catch (e) {
        console.log(e);
    }
}