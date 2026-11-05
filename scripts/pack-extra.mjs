// Packs extra KayKit (CC0) hero meshes without animations: node scripts/pack-extra.mjs <srcdir> Name...
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const [SRC, ...NAMES] = process.argv.slice(2);
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
for (const name of NAMES) {
  const doc = await io.read(`${SRC}/${name}.glb`);
  for (const a of doc.getRoot().listAnimations()) {
    for (const c of a.listChannels()) c.dispose();
    for (const s of a.listSamplers()) s.dispose();
    a.dispose();
  }
  await doc.transform(resample(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(`public/models/${name}.glb`, doc);
  console.log(name, doc.getRoot().listNodes().filter((n) => n.getMesh()).map((n) => n.getName()).join(','));
}
