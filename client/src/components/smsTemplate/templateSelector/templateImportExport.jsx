import { RcIconButton } from '@ringcentral/juno';
import React from 'react';
import { Download } from '@ringcentral/juno-icon';

export default ({
    templates,
    saveTemplates
}) => {
    const bottomButtonContainerStyle = {
        position: 'absolute',
        bottom: '0px',
        background: '#cfcfcf',
        display: 'flex',
        width: '100%',
        justifyContent: 'center'
    }

    function exportTemplates() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(templates));
        let dlAnchorElem = document.getElementById('downloadAnchorElem');
        if (!dlAnchorElem) {
            dlAnchorElem = document.createElement('a');
            dlAnchorElem.id = "downloadAnchorElem";
            dlAnchorElem.style = "display:none";
        }
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", "sms_templates.json");
        dlAnchorElem.click();
    }

    return (
        <div style={bottomButtonContainerStyle}>
            {
                templates.length !== 0 &&
                <RcIconButton
                    symbol={Download}
                    color="neutral.b06"
                    onClick={() => { exportTemplates(); }}
                    title="Export"
                />
            }
            <RcIconButton
                symbol={Download}
                color="neutral.b06"
                onClick={async () => {
                    try {
                        const fileHandle = await window.showOpenFilePicker(
                            {
                                types: [
                                    {
                                        accept: { 'application/json': ['.json'] }
                                    }
                                ]
                            });
                        const file = await fileHandle[0].getFile();
                        const templatesText = await file.text();
                        const templatesJson = JSON.parse(templatesText);
                        await saveTemplates({ templates: templatesJson })
                    }
                    catch (e) {
                        console.log(e)
                    }
                }}
                style={{
                    transform: 'rotate(180deg) scaleX(-1)'
                }}
                title="Import"
            />
        </div>
    )
}
