import { RcDivider, RcIconButton, RcList, RcText, RcTypography } from '@ringcentral/juno';
import React, { useState } from 'react';
import { ChevronLeft, CallAdd, Download } from '@ringcentral/juno-icon';
import TemplateItem from './templateItem';
import ImportExportTemplate from './templateImportExport';

export default ({
    setEditTemplateIndex,
    templates,
    setIsOpen,
    setPageState,
    saveTemplates
}) => {
    const topButtonContainerStyle = {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
    }

    const [draggingTemplate, setDraggingTemplate] = useState(null);

    function renderTemplates() {
        return templates.map((t, i) => {
            return (
                <TemplateItem
                    title={t.name}
                    content={t.message}
                    index={i}
                    setEditTemplateIndex={setEditTemplateIndex}
                    setIsOpen={setIsOpen}
                    setPageState={setPageState}
                    templates={templates}
                    saveTemplates={saveTemplates}
                    draggingTemplate={draggingTemplate}
                    setDraggingTemplate={setDraggingTemplate}
                />
            )
        })
    }

    return (
        <div>
            <div style={topButtonContainerStyle}>
                <RcIconButton
                    symbol={ChevronLeft}
                    color="action.primary"
                    onClick={() => { setIsOpen(false); }}
                />
                <RcText>Select template</RcText>
                <RcIconButton
                    symbol={CallAdd}
                    color="action.primary"
                    onClick={() => { setPageState('create'); }}
                />
            </div>
            <RcDivider />
            {templates.length === 0 ?
                <RcTypography
                    align="center"
                    variant="headline1"
                    style={{
                        top: '30%',
                        position: 'absolute'
                    }}
                >
                    You do not have a SMS template. To create a new template, click the '+' button.
                </RcTypography>
                :
                <RcList
                    dense
                    style={{
                        maxHeight: '447px',
                        overflow: 'auto'
                    }}
                >
                    {renderTemplates()}
                </RcList>
            }
            <ImportExportTemplate
                templates={templates}
                saveTemplates={saveTemplates}
            />
        </div>
    )
}