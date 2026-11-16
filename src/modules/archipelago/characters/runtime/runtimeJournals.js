const { leveledCallingSpellEligible } = require('@crossworld/sanguine-engine/spells/casting-sources');

function fail(message) { throw Object.assign(new Error(message), { statusCode: 422 }); }
function label(v){return typeof v==='string'&&v.trim()&&v.length<=100;}

function validateFeatJournal(summary,state){
  if(state.inspiration!==undefined&&typeof state.inspiration!=='boolean'||state.inCombat!==undefined&&typeof state.inCombat!=='boolean')fail('Invalid saved Inspiration or combat state');
  if(state.environment&&!['bright','dim','dark'].includes(state.environment.light))fail('Invalid saved scene light');
  if(state.featState!==undefined&&(!state.featState||typeof state.featState!=='object'||Array.isArray(state.featState)||Object.keys(state.featState).length>22))fail('Invalid saved feat state');
  for(const record of Object.values(state.featState??{})){
    if(!summary.feats.includes(record.featId)||typeof record.spent!=='boolean')fail('Saved feat counter requires its owned feat');
    for(const list of [record.events,record.turns])if(!Array.isArray(list)||list.length>200||new Set(list).size!==list.length||list.some(id=>!label(id)))fail('Invalid saved feat event history');
  }
}

function validateFolioJournal(state, spells){
  const isFolioSpell=id=>leveledCallingSpellEligible(spells.find(spell=>spell.id===id),'shipwright');
  for(const key of ['folioUnavailable','folioMemory'])if(state[key]!==undefined&&(!Array.isArray(state[key])||state[key].length>400||new Set(state[key]).size!==state[key].length||state[key].some(id=>!isFolioSpell(id))))fail('Invalid saved folio availability');
  if(state.spellDiscoveries!==undefined&&(!Array.isArray(state.spellDiscoveries)||state.spellDiscoveries.length>1000||state.spellDiscoveries.some(d=>!d||!label(d.discoveryId)||!label(d.authorizedBy)||!isFolioSpell(d.spellId))))fail('Invalid saved discoveries');
}

function validateConduitJournal(state){
  for(const [key,fields]of [['conduitGrants',['grantId','targetId','sourceCharacterId']],['conduitCircuit',['eventId','targetId','turnId']]]){
    if(state[key]!==undefined&&(!Array.isArray(state[key])||state[key].length>200||state[key].some(entry=>!entry||fields.some(f=>typeof entry[f]!=='string'||!entry[f].trim()||entry[f].length>100))))fail('Invalid saved Conduit event journal');
  }
}

module.exports = { label, validateFeatJournal, validateFolioJournal, validateConduitJournal };
