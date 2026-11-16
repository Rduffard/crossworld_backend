const now=state=>state.worldTime??Date.now();
const active=(state,e)=>e.expiresAt===undefined||e.expiresAt>now(state);

module.exports = { now, active };
