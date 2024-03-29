const config = require('../config.json')
const releaseNotes = require('../../../releaseNotes.json')

function getReleaseNotesPageRender({ platformName, registeredVersion }) {
    const registeredVersionNumbers = registeredVersion.split('.').map(v => parseInt(v));
    const currentVersionNumbers = config.version.split('.').map(v => parseInt(v));
    if (!!releaseNotes[config.version] &&
        (currentVersionNumbers[0] > registeredVersionNumbers[0] ||
            currentVersionNumbers[0] === registeredVersionNumbers[0] && currentVersionNumbers[1] > registeredVersionNumbers[1] ||
            currentVersionNumbers[0] === registeredVersionNumbers[0] && currentVersionNumbers[1] === registeredVersionNumbers[1] && currentVersionNumbers[2] > registeredVersionNumbers[2])
    ) {
        const globalNotes = releaseNotes[config.version].global ?? [];
        const platformNotes = releaseNotes[config.version][platformName] ?? [];
        const allNotes = globalNotes.concat(platformNotes);
        const allTypes = allNotes.map(n => { return n.type }).filter((value, index, array) => { return array.indexOf(value) === index; });
        let notesRender = {};
        let notesUiSchema = {};
        let sectionsCount = 0;
        for(const t of allTypes){
            const targetNotes = allNotes.filter(n => { return n.type === t });
            let description = '';
            for (const n of targetNotes) {
                description += n.description + '\n';
            }
            notesRender[sectionsCount.toString()] = {
                type: 'string',
                title: t,
                default: description
            }
            notesUiSchema[sectionsCount.toString()] = {
                "ui:widget": "textarea",
                "ui:readonly": true
            }
            sectionsCount++;
        }
        return {
            id: 'releaseNotesPage',
            title: `Release Notes (v${config.version})`,
            schema: {
                type: 'object',
                properties: notesRender
            },
            uiSchema: notesUiSchema,
            formData: {}
        }
    }
    else {
        return null;
    }
}

exports.getReleaseNotesPageRender = getReleaseNotesPageRender;