import DropdownList from '../dropdownList';
import React, { useState, useEffect } from 'react';

export default ({ additionalFormInfo, setSubmission, style }) => {
    const orgs = additionalFormInfo.links.filter(f => f.label === 'Organisation');
    const opportunities = additionalFormInfo.links.filter(f => f.label === 'Opportunity');
    const projects = additionalFormInfo.links.filter(f => f.label === 'Project');
    const [orgSelection, setOrgSelection] = useState(orgs.length > 0 ? orgs[0].id : null);
    const [opportunitySelection, setOpportunitySelection] = useState(opportunities.length > 0 ? opportunities[0].id : null);
    const [projectSelection, setProjectSelection] = useState(projects.length > 0 ? projects[0].id : null);

    useEffect(() => {
        setSubmission({
            orgSelection,
            opportunitySelection,
            projectSelection
        });
    }, []);

    return (
        <div>
            {orgs.length > 0 && <DropdownList
                key='Organisation'
                style={style}
                label='Organisation'
                selectionItems={orgs.map(d => { return { value: d.id, display: d.name } })}
                presetSelection={orgSelection}
                onSelected={(selection) => {
                    setOrgSelection(selection);
                    setSubmission({
                        orgSelection: selection,
                        opportunitySelection,
                        projectSelection
                    })
                }} />}
            {opportunities.length > 0 && <DropdownList
                key='Opportunity'
                style={style}
                label='Opportunity'
                selectionItems={opportunities.map(d => { return { value: d.id, display: d.name } })}
                presetSelection={opportunitySelection}
                onSelected={(selection) => {
                    setOpportunitySelection(selection);
                    setSubmission({
                        orgSelection,
                        opportunitySelection: selection,
                        projectSelection
                    });
                }} />}
            {projects.length > 0 && <DropdownList
                key='Project'
                style={style}
                label='Project'
                selectionItems={projects.map(d => { return { value: d.id, display: d.name } })}
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