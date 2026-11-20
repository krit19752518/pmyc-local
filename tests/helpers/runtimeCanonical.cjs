/* Canonical runtime contract: ignore emitter scaffolding, never handler logic or HTML. */
const ts=require('typescript');
const parse=text=>ts.createSourceFile('runtime.js',text,ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS);
function canonical(n){
 if(ts.isParenthesizedExpression(n))return canonical(n.expression);
 if(ts.isIdentifier(n))return ['identifier',n.text];
 if(ts.isStringLiteral(n)||ts.isNumericLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)||ts.isTemplateHead(n)||ts.isTemplateMiddle(n)||ts.isTemplateTail(n))return [n.kind,n.text];
 const children=[];ts.forEachChild(n,c=>{children.push(canonical(c));});
 return [n.kind,ts.isVariableDeclarationList(n)?n.flags&(ts.NodeFlags.Let|ts.NodeFlags.Const):0,...children];
}
function analyze(text){
 const sf=parse(text),imports=new Map(),exports=new Map(),dependencies=[];
 function requireInfo(n){
  let x=n,def=false;if(ts.isCallExpression(x)&&x.expression.getText(sf)==='__importDefault'){x=x.arguments[0];def=true;}
  return ts.isCallExpression(x)&&ts.isIdentifier(x.expression)&&x.expression.text==='require'&&ts.isStringLiteral(x.arguments[0])?{module:x.arguments[0].text,def}:null;
 }
 for(const n of sf.statements){
  if(ts.isVariableStatement(n))for(const d of n.declarationList.declarations){if(ts.isIdentifier(d.name)&&d.initializer){const r=requireInfo(d.initializer);if(r){imports.set(d.name.text,r);if(!dependencies.includes(r.module))dependencies.push(r.module);}}}
  if(ts.isExpressionStatement(n)&&ts.isBinaryExpression(n.expression)&&ts.isPropertyAccessExpression(n.expression.left)&&n.expression.left.expression.getText(sf)==='exports'){
   const e=n.expression;if(e.right.kind!==ts.SyntaxKind.VoidExpression&&!ts.isBinaryExpression(e.right))exports.set(e.left.name.text,ts.isIdentifier(e.right)?e.right.text:e.left.name.text);
  }
  if(ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(sf)==='Object.defineProperty'&&n.expression.arguments[0]?.getText(sf)==='exports'&&ts.isStringLiteral(n.expression.arguments[1])&&n.expression.arguments[1].text!=='__esModule')exports.set(n.expression.arguments[1].text,n.expression.arguments[1].text);
 }
 const resolve=(p)=>{
  if(!ts.isPropertyAccessExpression(p)||!ts.isIdentifier(p.expression))return null;
  if(imports.has(p.expression.text)){const info=imports.get(p.expression.text);return ts.factory.createIdentifier(info.module+'::'+p.name.text);}
  if(p.expression.text==='exports'&&exports.has(p.name.text))return ts.factory.createIdentifier(exports.get(p.name.text));
  return null;
 };
 const transformer=context=>{
  const visit=n=>{
   if(ts.isParenthesizedExpression(n)&&ts.isBinaryExpression(n.expression)&&n.expression.operatorToken.kind===ts.SyntaxKind.CommaToken&&n.expression.left.kind===ts.SyntaxKind.NumericLiteral&&n.expression.left.text==='0'){
    const resolved=resolve(n.expression.right);if(resolved)return resolved;
   }
   return resolve(n)||ts.visitEachChild(n,visit,context);
  };return n=>ts.visitNode(n,visit);
 };
 const transformed=ts.transform(sf,[transformer]).transformed[0];
 const body=[],exportDescriptors=[];
 for(let i=0;i<sf.statements.length;i++){
  const original=sf.statements[i],n=transformed.statements[i];
  if(ts.isExpressionStatement(original)&&ts.isStringLiteral(original.expression)&&original.expression.text==='use strict')continue;
  if(ts.isVariableStatement(original)&&original.declarationList.declarations.every(d=>ts.isIdentifier(d.name)&&(d.name.text==='__importDefault'||imports.has(d.name.text))))continue;
  if(ts.isExpressionStatement(original)&&ts.isCallExpression(original.expression)&&original.expression.expression.getText(sf)==='Object.defineProperty'&&original.expression.arguments[0]?.getText(sf)==='exports'){
   if(original.expression.arguments[1]?.text!=='__esModule')exportDescriptors.push([original.expression.arguments[1]?.text,canonical(n.expression.arguments[2])]);
   continue;
  }
  if(ts.isExpressionStatement(original)&&ts.isBinaryExpression(original.expression)&&ts.isPropertyAccessExpression(original.expression.left)&&original.expression.left.expression.getText(sf)==='exports'){
   const value=original.expression.right;
   if(ts.isIdentifier(value)||ts.isBinaryExpression(value)||value.kind===ts.SyntaxKind.VoidExpression)continue;
   const expression=ts.isExpressionStatement(n)?n.expression:undefined;
   const decl=ts.factory.createVariableStatement(undefined,ts.factory.createVariableDeclarationList([ts.factory.createVariableDeclaration(original.expression.left.name.text,undefined,undefined,expression.right)],ts.NodeFlags.Const));body.push(canonical(decl));continue;
  }
  body.push(canonical(n));
 }
 return {dependencies,exportDescriptors,exports:[...exports.entries()].sort(([a],[b])=>a.localeCompare(b)),body};
}
function digest(text){const crypto=require('crypto');return crypto.createHash('sha256').update(JSON.stringify(analyze(text))).digest('hex');}
module.exports={analyze,canonical,digest};
