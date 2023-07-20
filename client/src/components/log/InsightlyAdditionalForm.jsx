import DropdownList from '../dropdownList';
import React, { useState, useEffect } from 'react';

export default ({ additionalFormInfo, setSubmission, style }) => {
    const org = additionalFormInfo.find(f => f.label === 'Organisation');
    const opportunity = additionalFormInfo.find(f => f.label === 'Opportunity');
    const project = additionalFormInfo.find(f => f.label === 'Project');
    const [orgSelection, setOrgSelection] = useState(org?.value && org.value.length > 0 ? org.value[0].id : null);
    const [opportunitySelection, setOpportunitySelection] = useState(opportunity?.value && opportunity.value.length > 0 ? opportunity.value[0].id : null);
    const [projectSelection, setProjectSelection] = useState(project?.value && project.value.length > 0 ? project.value[0].id : null);

    useEffect(() => {
        setSubmission({
            orgSelection,
            opportunitySelection,
            projectSelection
        });
    }, []);

    return (
        <div>
            {org?.value && org.value.length > 0 && <DropdownList
                key='Organisation'
                style={style}
                label='Organisation'
                selectionItems={org.value.map(d => { return { value: d.id, display: d.title } })}
                presetSelection={orgSelection}
                onSelected={(selection) => {
                    setOrgSelection(selection);
                    setSubmission({
                        orgSelection: selection,
                        opportunitySelection,
                        projectSelection
                    })
                }} />}
            {opportunity?.value && opportunity.value.length > 0 && <DropdownList
                key='Opportunity'
                style={style}
                label='Opportunity'
                selectionItems={opportunity.value.map(d => { return { value: d.id, display: d.title } })}
                presetSelection={opportunitySelection}
                onSelected={(selection) => {
                    setOpportunitySelection(selection);
                    setSubmission({
                        orgSelection,
                        opportunitySelection: selection,
                        projectSelection
                    });
                }} />}
            {project?.value && project.value.length > 0 && <DropdownList
                key='Project'
                style={style}
                label='Project'
                selectionItems={project.value.map(d => { return { value: d.id, display: d.title } })}
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