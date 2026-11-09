const limits={name:[2,80],notes:[0,5000],portraitUrl:[0,2000],pronouns:[0,1000],appearance:[0,1000]};
function validate(value){
  const result={};
  for(const [key,[min,max]]of Object.entries(limits))if(value[key]!==undefined){
    if(typeof value[key]!=='string'||value[key].trim().length<min||value[key].length>max)throw Object.assign(new Error('Invalid '+key),{statusCode:422,code:'invalid_identity',fieldPath:key});
    result[key]=value[key].trim();
    if(key==='portraitUrl'&&result[key]){
      let valid=false;try{valid=new URL(result[key]).protocol==='https:';}catch{/* Invalid URL. */}
      if(!valid)throw Object.assign(new Error('Portrait requires a valid HTTPS URL'),{statusCode:422,code:'invalid_portrait_url',fieldPath:key});
    }
  }
  return result;
}
module.exports={validate,fields:Object.keys(limits)};
