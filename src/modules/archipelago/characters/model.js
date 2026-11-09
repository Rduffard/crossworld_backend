const mongoose = require("mongoose");
const characterSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  schemaVersion:{type:Number,required:true,enum:[1]},
  rulesVersion:{type:String,required:true,enum:['SA-CHAR-1']},
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  calling: { type: String, required: true },
  origin: { type: String, required: true, trim: true, maxlength: 80 },
  notes: { type: String, default: "", maxlength: 5000 },
  rulesLedger: { type: mongoose.Schema.Types.Mixed, required: true },
  rulesRuntime: { type: mongoose.Schema.Types.Mixed, required: true },
  attributes: { type: mongoose.Schema.Types.Mixed, required: true },
  documentRevision: { type: Number, required: true, min: 0 },
  inventory: { type: [mongoose.Schema.Types.Mixed], required: true },
  loadout: { type: mongoose.Schema.Types.Mixed, required: true },
  presets: {type:[mongoose.Schema.Types.Mixed],default:[]},
  goldCp: { type: Number, required: true, min: 0, max:Number.MAX_SAFE_INTEGER,validate:Number.isSafeInteger },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "ArchipelagoCampaign", default: null },
  portraitUrl: { type: String, default: "" },
  pronouns:{type:String,default:'',maxlength:1000},
  appearance:{type:String,default:'',maxlength:1000},
  creationRequest:{type:mongoose.Schema.Types.Mixed},
  status: { type: String, enum: ["active", "archived", "retired"], default: "active" },
}, { timestamps: true, versionKey: false, strict: "throw", minimize: false });
characterSchema.pre("validate", function () {
  const rules = require("../system/rules2024");
  const summary = rules.replay(this.rulesLedger);
  if (!summary.decisionsComplete) throw Error("Incomplete character choices");
  if (this.calling !== this.rulesLedger.levels[0].callingId) throw Error("Calling differs from ledger");
  if (JSON.stringify(this.attributes) !== JSON.stringify(summary.attributes)) throw Error("Attributes differ from ledger");
  require("../equipment").validateLoadout(this.inventory, this.loadout);
  require('../equipment/magic').validate(this,summary);
  rules.runtime.validate(summary, this.rulesRuntime);
});
characterSchema.index({ owner: 1, status: 1 });
characterSchema.index({ owner: 1, name: 1 });
characterSchema.index({owner:1,'creationRequest.operationId':1},{unique:true,partialFilterExpression:{'creationRequest.operationId':{$type:'string'}}});
module.exports = mongoose.model("ArchipelagoCharacter", characterSchema);
