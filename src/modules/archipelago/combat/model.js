const mongoose = require('mongoose');
// Encounter-local snapshots only. No character synchronization or session resource reset.
const schema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: ['active', 'paused', 'completed'], required: true },
  revision: { type: Number, required: true }, round: { type: Number, required: true },
  activeCombatant: { type: String, required: true }, spatialMode: { type: String, enum: ['fixed-in-range'], required: true },
  combatants: { type: [mongoose.Schema.Types.Mixed], required: true },
  sourceCharacter: { type: mongoose.Schema.Types.ObjectId, ref: 'ArchipelagoCharacter', default: null },
  initialCharacterSnapshot: { type: mongoose.Schema.Types.Mixed, default: undefined },
  events: { type: [mongoose.Schema.Types.Mixed], default: [] }
}, { timestamps: true, versionKey: false });
module.exports = mongoose.model('ArchipelagoEncounter', schema);
