import { RcIconButton, RcDialog, RcButton, RcTypography } from '@ringcentral/juno';
import React, { useState } from 'react';
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

    const modalButtonContainerStyle = {
        display: 'flex',
        justifyContent: 'center',
        padding: '20px',
        gap: '10px',
    }

    const [showDialog, setShowDialog] = useState(false);

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
        <div>
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
                    onClick={() => { setShowDialog(true); }}
                    style={{
                        transform: 'rotate(180deg) scaleX(-1)'
                    }}
                    title="Import"
                />
            </div>
            <RcDialog
                open={showDialog}
            >
                <RcTypography
                    variant='body2'
                    style={{
                        padding: '20px 20px 0px 20px'
                    }}
                >
                    Importing templates will overwrite any existing templates. Do you wish to proceed?
                </RcTypography>
                <div style={modalButtonContainerStyle}>
                    <RcButton
                        variant='outlined'
                        radius='zero'
                        color="action.primary"
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
                                setShowDialog(false);
                            }
                            catch (e) {
                                console.log(e)
                            }
                        }}
                    >
                        Import
                    </RcButton>
                    <RcButton
                        variant='outlined'
                        color="danger.b03"
                        radius='zero'
                        onClick={() => { setShowDialog(false); }}
                    >
                        Cancel
                    </RcButton>
                </div>
            </RcDialog>
        </div>
    )
}
