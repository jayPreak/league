// Packs the CC0 KayKit characters (kaylousberg.com) for the web.
// Every KayKit character shares one 41-bone rig, so meshes ship without animations
// and two small clip libraries drive them all by bone name.
// Usage: node scripts/prune-models.mjs <dir with the source .glb files>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const SRC = process.argv[2];
const MESHES = ['Mage', 'Barbarian', 'Rogue', 'Skeleton_Minion', 'Skeleton_Mage', 'Skeleton_Warrior'];
const LIBS = {
  hero: ['Mage', ['Idle', 'Running_A', 'Death_A', 'Hit_A', 'Cheer', 'Dodge_Forward', 'Spellcast_Shoot', 'Spellcast_Long', 'Spellcast_Raise', '1H_Melee_Attack_Chop', '2H_Melee_Attack_Chop', '2H_Melee_Attack_Spin', '1H_Ranged_Shoot', '2H_Ranged_Shoot', 'Throw']],
  skel: ['Skeleton_Minion', ['Idle_Combat', 'Walking_D_Skeletons', '1H_Melee_Attack_Chop', '2H_Melee_Attack_Chop', 'Spellcast_Shoot', 'Death_C_Skeletons']],
};

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const drop = (a) => {
  for (const c of a.listChannels()) c.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
};
const pack = (doc) => doc.transform(resample(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));

for (const name of MESHES) {
  const doc = await io.read(`${SRC}/${name}.glb`);
  for (const a of doc.getRoot().listAnimations()) drop(a);
  await pack(doc);
  await io.write(`public/models/${name}.glb`, doc);
}
// Minion weapons ship as separate props in the pack.
for (const w of ['Skeleton_Blade', 'Skeleton_Staff', 'Skeleton_Axe', 'Skeleton_Shield_Small_A']) {
  const doc = await io.read(`${SRC}/${w}.gltf`);
  await pack(doc);
  await io.write(`public/models/${w}.glb`, doc);
}
for (const [lib, [from, keep]] of Object.entries(LIBS)) {
  const doc = await io.read(`${SRC}/${from}.glb`);
  for (const a of doc.getRoot().listAnimations()) if (!keep.includes(a.getName())) drop(a);
  for (const n of doc.getRoot().listNodes()) n.setMesh(null).setSkin(null);
  await pack(doc);
  await io.write(`public/models/anims_${lib}.glb`, doc);
  console.log(lib, doc.getRoot().listAnimations().map((a) => a.getName()).join(','));
}
