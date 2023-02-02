import DropdownList from '../dropdownList';
import React, { useState } from 'react';

export default ({ additionalFormInfo, setSubmission, style }) => {
    const [orgSelection, setOrgSelection] = useState(null);
    const [opportunitySelection, setOpportunitySelection] = useState(null);
    const [projectSelection, setProjectSelection] = useState(null);
    const org = additionalFormInfo.filter(f => f.label === 'Organisation');
    const opportunity = additionalFormInfo.filter(f => f.label === 'Opportunity');
    const project = additionalFormInfo.filter(f => f.label === 'Project');
    return (
        <div>
            {org.length > 0 && <DropdownList
                key='Organisation'
                style={style}
                label='Organisation'
                selectionItems={org[0].value.map(d => { return { value: d.id, display: d.title } })}
                presetSelection={orgSelection}
                onSelected={(selection) => {
                    setOrgSelection(selection);
                    setSubmission({
                        orgSelection: selection,
                        opportunitySelection,
                        projectSelection
                    });
                }} />}
            {opportunity.length > 0 && <DropdownList
                key='Opportunity'
                style={style}
                label='Opportunity'
                selectionItems={opportunity[0].value.map(d => { return { value: d.id, display: d.title } })}
                presetSelection={opportunitySelection}
                onSelected={(selection) => {
                    setOpportunitySelection(selection);
                    setSubmission({
                        orgSelection,
                        opportunitySelection: selection,
                        projectSelection
                    });
                }} />}
            {project.length > 0 && <DropdownList
                key='Project'
                style={style}
                label='Project'
                selectionItems={project[0].value.map(d => { return { value: d.id, display: d.title } })}
                presetSelection={projectSelection}
                onSelected={(selection) => {
                    setProjectSelection(selection);
                    setSubmission({
                        orgSelection,
                        opportunitySelection,
                        projectSelection: selection
                    });
                }} />}
        </div>
    );
}