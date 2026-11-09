// Static management fields transcribed from SRD 5.2.1 spell headers and clauses.
// Runtime code does not infer mechanics by parsing prose.
const profiles=require('./spellProfiles.json');
for(const id of ['divine-smite','searing-smite','shining-smite','ensnaring-strike'])profiles[id].castingTrigger='hit';
for(const id of ['feather-fall','shield','counterspell'])profiles[id].castingTrigger='reaction';
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
module.exports=freeze(profiles);
