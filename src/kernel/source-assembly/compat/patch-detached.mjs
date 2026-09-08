import assert from 'node:assert/strict';
// Semantic extension, no public struct layout change. Group2 is detached text
// in manufacturing coordinates; groups0/1 retain the frozen mechanics meaning.
export function patchDetached(text){
  const replace=(a,b)=>{assert.equal(text.split(a).length,2,`detached patch anchor: ${a}`);text=text.replace(a,b);};
  replace('slab.kind<=AM_SOURCE_TEXT_BASE','slab.kind<=AM_SOURCE_BED_TEXT_BASE');
  replace('const bool text=slab.kind==AM_SOURCE_TEXT||slab.kind==AM_SOURCE_TEXT_BASE;','const bool text=slab.kind>=AM_SOURCE_TEXT;const bool bed=slab.kind>=AM_SOURCE_BED_TEXT;const double source_base=bed?0:body_z;');
  replace('(slab.kind==AM_SOURCE_TEXT&&slab.role==AM_TEXT)||(slab.kind==AM_SOURCE_TEXT_BASE&&slab.role==AM_TEXT_BASE)','((slab.kind==AM_SOURCE_TEXT||slab.kind==AM_SOURCE_BED_TEXT)&&slab.role==AM_TEXT)||((slab.kind==AM_SOURCE_TEXT_BASE||slab.kind==AM_SOURCE_BED_TEXT_BASE)&&slab.role==AM_TEXT_BASE)');
  replace('auto mesh=prism(shape,body_z+slab.z0,body_z+slab.z1);','auto mesh=prism(shape,source_base+slab.z0,source_base+slab.z1);');
  replace('add(mesh,f,role,0,&m);','add(mesh,f,role,bed?2:0,&m);');
  replace('role,0,{slab.z0,slab.z1,0,0,0,0},','role,bed?2:0,{slab.z0,slab.z1,0,0,0,0},');
  replace('source_patches.push_back({shape,body_z+slab.z0,body_z+slab.z1,','source_patches.push_back({shape,source_base+slab.z0,source_base+slab.z1,');
  replace('auto shape=ring_set(a.ring_start,a.ring_count,a.fill_rule);std::vector<CrossSection> lower;',
    'auto shape=ring_set(a.ring_start,a.ring_count,a.fill_rule);std::vector<CrossSection> lower;\n    int attachment_group=-1;for(const auto& p:source_patches)if(p.attachment==a.semantic_id){int g=(int)pieces[p.piece].group;need(attachment_group<0||attachment_group==g,"MIXED_ATTACHMENT_DATUM");attachment_group=g;}\n    double attachment_base=attachment_group==2?0:body_z;');
  replace('near(p.z0,body_z+a.z0)','near(p.z0,attachment_base+a.z0)');
  replace('near(lo,body_z+a.z0)&&near(hi,body_z+a.z1)','near(lo,attachment_base+a.z0)&&near(hi,attachment_base+a.z1)');
  replace('const uint32_t g=tray?1:0;uint32_t role','uint32_t g=tray?1:0;uint32_t role');
  replace('if(p.attachment==attachment->semantic_id)selected.push_back(pieces[p.piece].mesh);','if(p.attachment==attachment->semantic_id){selected.push_back(pieces[p.piece].mesh);g=pieces[p.piece].group;}');
  replace('z=body_z+attachment->z0;','z=(g==2?0:body_z)+attachment->z0;');
  replace('std::array<std::vector<Manifold>,2> claimed;','std::array<std::vector<Manifold>,3> claimed;');
  replace('  double highest=0;\n  for(auto& p:disjoint){',
    '  // Detached text must not collide after the secondary part is laid out.\n  std::vector<Manifold> manufacturing;for(auto& p:disjoint){auto mesh=p.mesh;if(p.group==1)mesh=mesh.Translate({secondary_x,0,0});if(rot&&p.group!=2)mesh=mesh.Rotate(0,0,rot);manufacturing.push_back(evaluate(mesh));}\n  for(size_t i=0;i<disjoint.size();i++)for(size_t j=0;j<i;j++)if(disjoint[i].group!=disjoint[j].group&&(disjoint[i].group==2||disjoint[j].group==2))\n    need(!nonempty(manufacturing[i]^manufacturing[j]),"DETACHED_TEXT_PLACEMENT_COLLISION");\n  double highest=0;\n  for(auto& p:disjoint){');
  replace('if(rot)mesh=mesh.Rotate(0,0,rot);','if(rot&&p.group!=2)mesh=mesh.Rotate(0,0,rot);');
  replace('if(r.product==AM_CLICKY){info.preview_transform','if(p.group!=2&&r.product==AM_CLICKY){info.preview_transform');
  replace('if(r.product==AM_CHARM&&e(AM_F_charmGan)==0){info.preview_transform','if(p.group!=2&&r.product==AM_CHARM&&e(AM_F_charmGan)==0){info.preview_transform');
  return text;
}
