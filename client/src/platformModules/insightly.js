function getContactAdditionalInfo(contactRes) {
    if (!contactRes.data.contact.links || contactRes.data.contact.links.length === 0) {
        return [];
    }
    const additionalInfo = [];
    const distinctLabels = contactRes.data.contact.links.map(link => link.label).filter((x, i, a) => a.indexOf(x) == i);
    for (const label of distinctLabels) {
        const links = contactRes.data.contact.links.filter(l => l.label === label);
        additionalInfo.push({
            label,
            value: links.map(l => { return { id: l.id, title: l.name } })
        })
    }
    console.log(additionalInfo);
    return additionalInfo;
}

exports.getContactAdditionalInfo = getContactAdditionalInfo;